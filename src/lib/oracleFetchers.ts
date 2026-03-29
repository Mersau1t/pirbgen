/**
 * Oracle price fetchers for duel abilities.
 * Pyth is already used as default via streamPythPriceById.
 * Chainlink and Redstone are alternative sources used as abilities.
 */

export type OracleSource = 'pyth' | 'chainlink' | 'redstone';

// ── Token mappings ──────────────────────────────────────────────────
// Maps SOLO_TOKEN tickers to Chainlink/Redstone symbols.
// Tokens NOT in these maps → freeze price when switched.

const CHAINLINK_SYMBOLS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', AVAX: 'avalanche-2',
  DOGE: 'dogecoin', LINK: 'chainlink', UNI: 'uniswap', MATIC: 'matic-network',
  ARB: 'arbitrum', OP: 'optimism', DOT: 'polkadot', ATOM: 'cosmos',
  NEAR: 'near', FTM: 'fantom', AAVE: 'aave', MKR: 'maker',
  SNX: 'havven', CRV: 'curve-dao-token', LDO: 'lido-dao', APE: 'apecoin',
  PEPE: 'pepe', WIF: 'dogwifcoin', BONK: 'bonk', RENDER: 'render-token',
  FET: 'fetch-ai', INJ: 'injective-protocol', TIA: 'celestia',
  SUI: 'sui', SEI: 'sei-network', STX: 'blockstack', RUNE: 'thorchain',
  XRP: 'ripple', ADA: 'cardano', TRX: 'tron', TON: 'the-open-network',
};

const REDSTONE_SYMBOLS: Record<string, string> = {
  BTC: 'BTC', ETH: 'ETH', SOL: 'SOL', AVAX: 'AVAX',
  DOGE: 'DOGE', LINK: 'LINK', UNI: 'UNI', MATIC: 'MATIC',
  ARB: 'ARB', OP: 'OP', DOT: 'DOT', ATOM: 'ATOM',
  NEAR: 'NEAR', FTM: 'FTM', AAVE: 'AAVE', MKR: 'MKR',
  SNX: 'SNX', CRV: 'CRV', LDO: 'LDO', APE: 'APE',
  PEPE: 'PEPE', WIF: 'WIF', BONK: 'BONK',
  SUI: 'SUI', SEI: 'SEI', STX: 'STX',
  XRP: 'XRP', ADA: 'ADA', TRX: 'TRX',
};

// Pyth-exclusive tokens (no Chainlink/Redstone equivalent)
const PYTH_EXCLUSIVE = new Set(['PYTHOIL']);

/**
 * Check if a ticker is available on a given oracle.
 * Returns the mapped symbol or null.
 */
export function getOracleSymbol(ticker: string, source: OracleSource): string | null {
  const upper = ticker.toUpperCase();
  if (PYTH_EXCLUSIVE.has(upper)) return null;

  switch (source) {
    case 'chainlink': return CHAINLINK_SYMBOLS[upper] || null;
    case 'redstone': return REDSTONE_SYMBOLS[upper] || null;
    case 'pyth': return upper; // Always available
    default: return null;
  }
}

/**
 * Fetch price from Chainlink via DeFi Llama API (free, no key needed).
 * Returns price in USD or null on error.
 */
export async function fetchChainlinkPrice(ticker: string): Promise<number | null> {
  const symbol = CHAINLINK_SYMBOLS[ticker.toUpperCase()];
  if (!symbol) return null;

  try {
    const res = await fetch(
      `https://coins.llama.fi/prices/current/coingecko:${symbol}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const coin = data.coins?.[`coingecko:${symbol}`];
    return coin?.price ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch price from Redstone API.
 * Returns price in USD or null on error.
 */
export async function fetchRedstonePrice(ticker: string): Promise<number | null> {
  const symbol = REDSTONE_SYMBOLS[ticker.toUpperCase()];
  if (!symbol) return null;

  try {
    const res = await fetch(
      `https://api.redstone.finance/prices?symbol=${symbol}&provider=redstone-primary&limit=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Redstone returns array of price objects
    if (Array.isArray(data) && data.length > 0) {
      return data[0]?.value ?? null;
    }
    // Or it might return an object with symbol key
    if (data[symbol]?.value) return data[symbol].value;
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a polling price stream for an alternative oracle.
 * Calls onPrice with the latest price every intervalMs.
 * Calls onError if price unavailable.
 * Returns cleanup function.
 */
export function startOraclePolling(
  source: OracleSource,
  ticker: string,
  onPrice: (price: number) => void,
  onError: (reason: 'no_token' | 'api_error') => void,
  intervalMs: number = 2000,
): () => void {
  const symbol = getOracleSymbol(ticker, source);
  if (!symbol) {
    onError('no_token');
    return () => {};
  }

  let active = true;

  const fetchFn = source === 'chainlink' ? fetchChainlinkPrice : fetchRedstonePrice;

  const poll = async () => {
    if (!active) return;
    const price = await fetchFn(ticker);
    if (!active) return;
    if (price !== null && price > 0) {
      onPrice(price);
    } else {
      onError('api_error');
    }
  };

  // First fetch immediately
  poll();
  const id = setInterval(poll, intervalMs);

  return () => {
    active = false;
    clearInterval(id);
  };
}
