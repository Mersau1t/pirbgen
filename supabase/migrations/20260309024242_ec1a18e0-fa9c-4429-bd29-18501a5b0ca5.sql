
-- Duel rooms for PvP mode
CREATE TABLE public.duel_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'waiting', -- waiting, playing, finished
  
  -- Position (same for both players)
  ticker text NOT NULL,
  feed_id text NOT NULL,
  direction text NOT NULL, -- LONG or SHORT
  leverage integer NOT NULL,
  stop_loss numeric NOT NULL,
  take_profit numeric NOT NULL,
  rarity text NOT NULL DEFAULT 'common',
  entry_price numeric,
  
  -- Player 1 (creator)
  p1_name text NOT NULL DEFAULT 'Player 1',
  p1_wallet text,
  p1_pnl numeric DEFAULT 0,
  p1_closed boolean DEFAULT false,
  p1_closed_at timestamp with time zone,
  
  -- Player 2 (joiner)  
  p2_name text,
  p2_wallet text,
  p2_pnl numeric DEFAULT 0,
  p2_closed boolean DEFAULT false,
  p2_closed_at timestamp with time zone,
  
  -- Timer
  timer_seconds integer NOT NULL DEFAULT 60,
  started_at timestamp with time zone,
  
  -- Winner
  winner text, -- 'p1', 'p2', 'draw'
  
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.duel_rooms ENABLE ROW LEVEL SECURITY;

-- Anyone can create rooms
CREATE POLICY "Anyone can create duel rooms" ON public.duel_rooms
  FOR INSERT WITH CHECK (true);

-- Anyone can view rooms
CREATE POLICY "Anyone can view duel rooms" ON public.duel_rooms
  FOR SELECT USING (true);

-- Anyone can update rooms (for joining, PnL updates)
CREATE POLICY "Anyone can update duel rooms" ON public.duel_rooms
  FOR UPDATE USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_rooms;
