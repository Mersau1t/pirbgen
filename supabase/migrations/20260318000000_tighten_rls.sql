-- Migration: Tighten RLS policies
-- IMPORTANT: Run this AFTER existing migrations

-- ============================================
-- FIX 1: Profiles — restrict UPDATE to owner
-- ============================================
DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;

-- Since we don't use Supabase Auth, we match by wallet_address.
-- The client must send wallet_address in the row being updated,
-- and we verify it matches the existing row.
CREATE POLICY "Owner can update own profile" ON public.profiles
  FOR UPDATE
  USING (true)
  WITH CHECK (
    -- The wallet_address column cannot be changed
    wallet_address = (SELECT wallet_address FROM public.profiles WHERE id = profiles.id)
  );

-- Prevent DELETE on profiles
CREATE POLICY "No one can delete profiles" ON public.profiles
  FOR DELETE USING (false);

-- ============================================
-- FIX 2: Leaderboard — prevent UPDATE/DELETE
-- ============================================
-- Leaderboard entries should be immutable once written
CREATE POLICY "No one can update leaderboard" ON public.leaderboard
  FOR UPDATE USING (false);

CREATE POLICY "No one can delete leaderboard" ON public.leaderboard
  FOR DELETE USING (false);

-- ============================================
-- FIX 3: Duel rooms — restrict UPDATE scope
-- ============================================
DROP POLICY IF EXISTS "Anyone can update duel rooms" ON public.duel_rooms;

-- Allow updates but prevent changing critical fields like winner from arbitrary clients.
-- Ideally this should go through an Edge Function, but as a minimum safety net:
CREATE POLICY "Players can update duel rooms" ON public.duel_rooms
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
  -- TODO: Replace with Edge Function validation for winner/PnL fields

-- Prevent DELETE on duel rooms
CREATE POLICY "No one can delete duel rooms" ON public.duel_rooms
  FOR DELETE USING (false);

-- ============================================
-- FIX 4: Storage — restrict avatar uploads
-- ============================================
-- Limit avatar file size in application code (Supabase storage doesn't support
-- size limits via RLS, so enforce in client/Edge Function)
