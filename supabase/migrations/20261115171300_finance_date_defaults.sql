ALTER TABLE public.loans
  ALTER COLUMN created_at SET DEFAULT (
    to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

ALTER TABLE public.transfers
  ALTER COLUMN date SET DEFAULT (CURRENT_DATE::text);

ALTER TABLE public.transactions
  ALTER COLUMN date SET DEFAULT (CURRENT_DATE::text);
