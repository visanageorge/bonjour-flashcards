-- Deck pause is shared between devices and never changes cards or SRS history.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
NOTIFY pgrst, 'reload schema';
COMMIT;
