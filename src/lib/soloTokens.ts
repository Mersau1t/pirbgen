// 20 major tokens for solo mode with verified Pyth Hermes feed IDs
export const SOLO_TOKENS = [
  { ticker: 'BTC', pair: 'BTC/USD', feedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
  { ticker: 'ETH', pair: 'ETH/USD', feedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
  { ticker: 'SOL', pair: 'SOL/USD', feedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' },
  { ticker: 'BNB', pair: 'BNB/USD', feedId: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f' },
  { ticker: 'XRP', pair: 'XRP/USD', feedId: '0xec5d399846a9209f3fe5881d70aae9268c94339ff9817c4aa6058cb3c545f9c8' },
  { ticker: 'DOGE', pair: 'DOGE/USD', feedId: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c' },
  { ticker: 'ADA', pair: 'ADA/USD', feedId: '0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d' },
  { ticker: 'AVAX', pair: 'AVAX/USD', feedId: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7' },
  { ticker: 'MATIC', pair: 'MATIC/USD', feedId: '0x5de33440f6c8ee590c0735f10b47d91f64392cc0fbdbe8c35e50416b4651d60c' },
  { ticker: 'NEAR', pair: 'NEAR/USD', feedId: '0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750' },
  { ticker: 'APT', pair: 'APT/USD', feedId: '0x03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5' },
  { ticker: 'ARB', pair: 'ARB/USD', feedId: '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5' },
  { ticker: 'OP', pair: 'OP/USD', feedId: '0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf' },
  
  { ticker: 'TIA', pair: 'TIA/USD', feedId: '0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723' },
  { ticker: 'WIF', pair: 'WIF/USD', feedId: '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc' },
  { ticker: 'PEPE', pair: 'PEPE/USD', feedId: '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4' },
];

/** Pick a random token from the solo pool */
export function pickSoloToken() {
  return SOLO_TOKENS[Math.floor(Math.random() * SOLO_TOKENS.length)];
}
