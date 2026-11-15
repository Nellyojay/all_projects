ALTER TABLE public.loans
  ALTER COLUMN created_at SET DEFAULT (
    to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS created_at text;

UPDATE public.transfers
SET created_at = date || 'T00:00:00.000Z'
WHERE created_at IS NULL;

ALTER TABLE public.transfers
  ALTER COLUMN created_at SET DEFAULT (
    to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.transfers
  ALTER COLUMN date SET DEFAULT (CURRENT_DATE::text);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS created_at text;

UPDATE public.transactions
SET created_at = date || 'T00:00:00.000Z'
WHERE created_at IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN created_at SET DEFAULT (
    to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.transactions
  ALTER COLUMN date SET DEFAULT (CURRENT_DATE::text);
