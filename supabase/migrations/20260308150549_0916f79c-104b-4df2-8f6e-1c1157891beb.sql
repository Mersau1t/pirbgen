
-- Create profiles table for wallet-based users
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT 'Anonymous',
  avatar text NOT NULL DEFAULT 'pigeon',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can view profiles
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);

-- Anyone can insert their profile
CREATE POLICY "Anyone can insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);

-- Anyone can update their own profile (matched by wallet_address)
CREATE POLICY "Anyone can update profiles" ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);

-- Add wallet_address to leaderboard
ALTER TABLE public.leaderboard ADD COLUMN wallet_address text;

-- Enable realtime for profiles
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
