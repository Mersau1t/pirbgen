
ALTER TABLE public.duel_rooms
  ADD COLUMN p1_ticker text,
  ADD COLUMN p1_feed_id text,
  ADD COLUMN p1_direction text,
  ADD COLUMN p1_leverage integer,
  ADD COLUMN p1_stop_loss numeric,
  ADD COLUMN p1_take_profit numeric,
  ADD COLUMN p1_rarity text DEFAULT 'common',
  ADD COLUMN p1_entry_price numeric,
  ADD COLUMN p2_ticker text,
  ADD COLUMN p2_feed_id text,
  ADD COLUMN p2_direction text,
  ADD COLUMN p2_leverage integer,
  ADD COLUMN p2_stop_loss numeric,
  ADD COLUMN p2_take_profit numeric,
  ADD COLUMN p2_rarity text DEFAULT 'common',
  ADD COLUMN p2_entry_price numeric;

-- Migrate existing data from shared columns to p1 columns
UPDATE public.duel_rooms SET
  p1_ticker = ticker,
  p1_feed_id = feed_id,
  p1_direction = direction,
  p1_leverage = leverage,
  p1_stop_loss = stop_loss,
  p1_take_profit = take_profit,
  p1_rarity = rarity,
  p1_entry_price = entry_price,
  p2_ticker = ticker,
  p2_feed_id = feed_id,
  p2_direction = direction,
  p2_leverage = leverage,
  p2_stop_loss = stop_loss,
  p2_take_profit = take_profit,
  p2_rarity = rarity,
  p2_entry_price = entry_price;
