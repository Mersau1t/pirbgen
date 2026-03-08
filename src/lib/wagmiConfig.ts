import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, arbitrum, optimism, base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'PIRB.GEN',
  projectId: 'a]', // WalletConnect Cloud project ID — public/free tier
  chains: [mainnet, polygon, arbitrum, optimism, base],
  ssr: false,
});
