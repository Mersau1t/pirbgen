import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  wallet_address: string;
  display_name: string;
  avatar: string;
  avatar_url: string | null;
  created_at: string;
}

interface WalletContextType {
  walletAddress: string | null;
  profile: Profile | null;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  updateProfile: (updates: { display_name?: string; avatar?: string; avatar_url?: string | null }) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

function generateWalletAddress(): string {
  const chars = '0123456789abcdef';
  let addr = '0x';
  for (let i = 0; i < 40; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export { shortenAddress };

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Restore wallet from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pirbWallet');
    if (saved) {
      setWalletAddress(saved);
    }
  }, []);

  // Fetch profile when wallet changes
  useEffect(() => {
    if (!walletAddress) {
      setProfile(null);
      return;
    }

    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      if (data) {
        setProfile(data as Profile);
      }
    };

    fetchProfile();
  }, [walletAddress]);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    // Simulate wallet connection delay
    await new Promise(r => setTimeout(r, 1200));

    const addr = generateWalletAddress();
    localStorage.setItem('pirbWallet', addr);
    setWalletAddress(addr);

    // Create profile in DB
    const { data } = await supabase
      .from('profiles')
      .insert({ wallet_address: addr, display_name: shortenAddress(addr) })
      .select()
      .single();

    if (data) setProfile(data as Profile);
    setIsConnecting(false);
  }, []);

  const disconnectWallet = useCallback(() => {
    localStorage.removeItem('pirbWallet');
    setWalletAddress(null);
    setProfile(null);
  }, []);

  const updateProfile = useCallback(async (updates: { display_name?: string; avatar?: string }) => {
    if (!walletAddress) return;

    const { data } = await supabase
      .from('profiles')
      .update(updates)
      .eq('wallet_address', walletAddress)
      .select()
      .single();

    if (data) setProfile(data as Profile);
  }, [walletAddress]);

  return (
    <WalletContext.Provider value={{ walletAddress, profile, isConnecting, connectWallet, disconnectWallet, updateProfile }}>
      {children}
    </WalletContext.Provider>
  );
}
