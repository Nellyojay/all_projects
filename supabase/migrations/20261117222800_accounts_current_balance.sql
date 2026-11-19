DROP TRIGGER IF EXISTS initialize_account_balance ON public.accounts;
DROP FUNCTION IF EXISTS public.initialize_account_balance();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'balance'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'current_balance'
  ) THEN
    ALTER TABLE public.accounts RENAME COLUMN balance TO current_balance;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'balance'
  ) THEN
    ALTER TABLE public.accounts DROP COLUMN balance;
  ELSE
    ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS current_balance numeric NOT NULL DEFAULT 0;
  END IF;
END;
$$;

ALTER TABLE public.accounts ALTER COLUMN current_balance SET DEFAULT 0;

UPDATE public.accounts AS account
SET current_balance =
  COALESCE((
    SELECT SUM(CASE WHEN transaction.kind = 'income' THEN transaction.amount ELSE -transaction.amount END)
    FROM public.transactions AS transaction
    WHERE transaction.user_id = account.user_id AND transaction.account_id = account.id
  ), 0)
  + COALESCE((
    SELECT SUM(CASE
      WHEN transfer.to_account_id = account.id THEN transfer.amount
      ELSE -transfer.amount
    END)
    FROM public.transfers AS transfer
    WHERE transfer.user_id = account.user_id
      AND (transfer.from_account_id = account.id OR transfer.to_account_id = account.id)
  ), 0);

ALTER TABLE public.accounts ALTER COLUMN current_balance SET NOT NULL;

CREATE OR REPLACE FUNCTION public.update_account_balance_on_transaction_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.mythingz_importing', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.account_id IS NOT NULL THEN
    UPDATE public.accounts
      SET current_balance = current_balance
        - CASE WHEN OLD.kind = 'income' THEN OLD.amount ELSE -OLD.amount END
      WHERE user_id = OLD.user_id AND id = OLD.account_id;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.account_id IS NOT NULL THEN
    UPDATE public.accounts
      SET current_balance = current_balance
        + CASE WHEN NEW.kind = 'income' THEN NEW.amount ELSE -NEW.amount END
      WHERE user_id = NEW.user_id AND id = NEW.account_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS update_account_balance_on_transaction_change ON public.transactions;
CREATE TRIGGER update_account_balance_on_transaction_change
  AFTER INSERT OR UPDATE OF user_id, account_id, kind, amount OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_account_balance_on_transaction_change();

CREATE OR REPLACE FUNCTION public.update_account_balance_on_transfer_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.mythingz_importing', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    UPDATE public.accounts
      SET current_balance = current_balance + OLD.amount
      WHERE user_id = OLD.user_id AND id = OLD.from_account_id;
    UPDATE public.accounts
      SET current_balance = current_balance - OLD.amount
      WHERE user_id = OLD.user_id AND id = OLD.to_account_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    UPDATE public.accounts
      SET current_balance = current_balance - NEW.amount
      WHERE user_id = NEW.user_id AND id = NEW.from_account_id;
    UPDATE public.accounts
      SET current_balance = current_balance + NEW.amount
      WHERE user_id = NEW.user_id AND id = NEW.to_account_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS update_account_balance_on_transfer_change ON public.transfers;
CREATE TRIGGER update_account_balance_on_transfer_change
  AFTER INSERT OR UPDATE OF user_id, from_account_id, to_account_id, amount OR DELETE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_account_balance_on_transfer_change();
