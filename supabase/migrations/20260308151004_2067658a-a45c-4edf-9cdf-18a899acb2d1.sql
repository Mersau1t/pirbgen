
-- Create storage bucket for avatar uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Allow anyone to upload avatars
CREATE POLICY "Anyone can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');

-- Allow anyone to view avatars
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

-- Allow anyone to update their avatars
CREATE POLICY "Anyone can update avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');

-- Add avatar_url column for custom uploads
ALTER TABLE public.profiles ADD COLUMN avatar_url text;
