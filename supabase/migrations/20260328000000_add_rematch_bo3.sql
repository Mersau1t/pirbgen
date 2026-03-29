-- Add rematch + best-of-3 support to duel_rooms

ALTER TABLE public.duel_rooms
  ADD COLUMN IF NOT EXISTS rematch_p1 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rematch_p2 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS p1_left boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS p2_left boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS best_of integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_round integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS p1_round_wins integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p2_round_wins integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS series_winner text DEFAULT null,
  ADD COLUMN IF NOT EXISTS entropy_mode boolean DEFAULT false;
