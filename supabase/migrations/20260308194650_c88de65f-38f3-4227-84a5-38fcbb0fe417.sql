CREATE TABLE public.volatile_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id text NOT NULL,
  ticker text NOT NULL,
  pair text NOT NULL,
  price numeric NOT NULL,
  volatility numeric NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for quick sorting
CREATE INDEX idx_volatile_tokens_volatility ON public.volatile_tokens (volatility DESC);

-- RLS: anyone can read
ALTER TABLE public.volatile_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view volatile tokens"
  ON public.volatile_tokens
  FOR SELECT
  USING (true);

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;