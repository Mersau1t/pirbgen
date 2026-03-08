import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
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

export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnecting: wagmiConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  const [profile, setProfile] = useState<Profile | null>(null);

  const walletAddress = address ? address.toLowerCase() : null;

  // Fetch or create profile when wallet changes
  useEffect(() => {
    if (!walletAddress) {
      setProfile(null);
      return;
    }

    const fetchOrCreateProfile = async () => {
      // Try to find existing profile
      const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      if (existing) {
        setProfile(existing as Profile);
        return;
      }

      // Create new profile
      const { data: created } = await supabase
        .from('profiles')
        .insert({ wallet_address: walletAddress, display_name: shortenAddress(walletAddress) })
        .select()
        .single();

      if (created) setProfile(created as Profile);
    };

    fetchOrCreateProfile();
  }, [walletAddress]);

  const connectWallet = useCallback(async () => {
    openConnectModal?.();
  }, [openConnectModal]);

  const disconnectWallet = useCallback(() => {
    disconnect();
    setProfile(null);
  }, [disconnect]);

  const updateProfile = useCallback(async (updates: { display_name?: string; avatar?: string; avatar_url?: string | null }) => {
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
    <WalletContext.Provider value={{ walletAddress, profile, isConnecting: wagmiConnecting, connectWallet, disconnectWallet, updateProfile }}>
      {children}
    </WalletContext.Provider>
  );
}
