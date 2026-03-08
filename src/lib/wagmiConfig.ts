import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, arbitrum, optimism, base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'PIRB.GEN',
  projectId: '04b863be73c6671b9e6c2bb36fd7e0c8', // WalletConnect projectId
  chains: [mainnet, polygon, arbitrum, optimism, base],
  ssr: false,
});
