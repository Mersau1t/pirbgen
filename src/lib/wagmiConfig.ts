import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, arbitrum, optimism, base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'PIRB.GEN',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
  chains: [mainnet, polygon, arbitrum, optimism, base],
  ssr: false,
});