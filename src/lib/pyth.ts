// Pyth Network Hermes API integration for real-time price feeds

const HERMES_URL = 'https://hermes.pyth.network';

export interface PythFeed {
  id: string;
  ticker: string;    // e.g. "BTC"
  pair: string;      // e.g. "BTC/USD"
}

// Cache of available feeds
let feedsCache: PythFeed[] | null = null;
let feedsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Fetch all crypto/USD price feeds from Pyth Hermes
 */
export async function fetchAllPythFeeds(): Promise<PythFeed[]> {
  if (feedsCache && Date.now() - feedsCacheTime < CACHE_TTL) {
    return feedsCache;
  }

  try {
    // Skip equity/fx/metal on weekends (they don't trade)
    const dayOfWeek = new Date().getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const assetTypes = isWeekend
      ? ['crypto']
      : ['crypto', 'equity', 'fx', 'metal'];

    const responses = await Promise.all(
      assetTypes.map(t => fetch(`${HERMES_URL}/v2/price_feeds?query=usd&asset_type=${t}`))
    );

    const allData: Array<{ id: string; attributes: { symbol: string; base: string; quote_currency: string } }> = [];
    for (const res of responses) {
      if (res.ok) {
        const d = await res.json();
        allData.push(...d);
      }
    }

    // Stablecoins & pegged assets to exclude
    const STABLECOINS = new Set([
      'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'FRAX', 'LUSD', 'USDD', 'GUSD',
      'PYUSD', 'USDP', 'SUSD', 'CRVUSD', 'GHO', 'MKUSD', 'USDE', 'EUSD', 'DOLA', 'MIM',
      'USDJ', 'ALUSD', 'FEUSD', 'SUIUSDE', 'EZETH', 'MSOL', 'BBSOL', 'KHYPE',
      'SATS', 'USDU', 'XSGD', 'CBETH', 'STETH', 'WSTETH', 'RETH', 'AFSUI',
      'BSOL', 'JITOSOL', 'USDB', 'UST', 'USTC', 'CUSD', 'FLEXUSD',
    ]);
    const seen = new Set<string>();
    const feeds: PythFeed[] = [];

    for (const feed of allData) {
      const base = feed.attributes?.base?.toUpperCase();
      const quote = feed.attributes?.quote_currency?.toUpperCase();
      if (!base || quote !== 'USD') continue;
      if (STABLECOINS.has(base)) continue;
      if (seen.has(base)) continue;
      seen.add(base);

      feeds.push({
        id: '0x' + feed.id,
        ticker: base,
        pair: `${base}/USDT`,
      });
    }

    feedsCache = feeds;
    feedsCacheTime = Date.now();
    console.log(`Loaded ${feeds.length} Pyth feeds (crypto + equity + fx + metal)`);
    return feeds;
  } catch (err) {
    console.error('Failed to fetch Pyth feeds:', err);
    return feedsCache || [];
  }
}

/**
 * Parse a Pyth price object into a human-readable number
 */
function parsePythPrice(priceObj: { price: string; expo: number }): number {
  return Number(priceObj.price) * Math.pow(10, priceObj.expo);
}

/**
 * Fetch the latest price for a feed by its Pyth feed ID
 */
export async function fetchPythPriceById(feedId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${HERMES_URL}/v2/updates/price/latest?ids[]=${feedId}&parsed=true`
    );
    if (!res.ok) throw new Error(`Hermes API error: ${res.status}`);

    const data = await res.json();
    const parsed = data.parsed?.[0]?.price;
    if (!parsed) throw new Error('No price data returned');

    return parsePythPrice(parsed);
  } catch (err) {
    console.error(`Failed to fetch Pyth price for ${feedId}:`, err);
    return null;
  }
}

/**
 * Fetch prices for multiple feeds at once — used to find volatile ones
 */
export async function fetchMultiplePrices(feedIds: string[]): Promise<Map<string, { price: number; confidence: number }>> {
  const result = new Map<string, { price: number; confidence: number }>();
  if (feedIds.length === 0) return result;

  try {
    const params = feedIds.map(id => `ids[]=${id}`).join('&');
    const res = await fetch(`${HERMES_URL}/v2/updates/price/latest?${params}&parsed=true`);
    if (!res.ok) throw new Error(`Hermes API error: ${res.status}`);

    const data = await res.json();
    for (const item of data.parsed || []) {
      const price = parsePythPrice(item.price);
      const conf = Number(item.price.conf) * Math.pow(10, item.price.expo);
      result.set('0x' + item.id, { price, confidence: conf });
    }
  } catch (err) {
    console.error('Failed to fetch multiple Pyth prices:', err);
  }

  return result;
}

/**
 * Fetch prices at a specific timestamp for multiple feeds
 */
async function fetchPricesAtTime(feedIds: string[], timestamp: number): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (feedIds.length === 0) return result;

  // Hermes timestamp endpoint only takes one set of ids, batch them
  try {
    const params = feedIds.map(id => `ids[]=${id}`).join('&');
    const res = await fetch(`${HERMES_URL}/v2/updates/price/${timestamp}?${params}&parsed=true`);
    if (!res.ok) return result;

    const data = await res.json();
    for (const item of data.parsed || []) {
      const price = parsePythPrice(item.price);
      if (price > 0) result.set('0x' + item.id, price);
    }
  } catch {
    // silent fail
  }
  return result;
}

// Volatility cache — refreshed every 10 min
export interface VolatileToken { feed: PythFeed; price: number; volatility: number }
let volatilityCache: VolatileToken[] = [];
let volatilityCacheTime = 0;
const VOLATILITY_CACHE_TTL = 10 * 60 * 1000;

/**
 * Compute true volatility: standard deviation of log-returns
 * sampled at 8 points over the last 24h.
 */
async function computeVolatility(feedIds: string[]): Promise<Map<string, number>> {
  const now = Math.floor(Date.now() / 1000);
  const intervals = 8;
  const step = Math.floor(86400 / intervals); // ~3h apart

  // Fetch prices at 8 time points + current (in parallel)
  const timestamps = Array.from({ length: intervals }, (_, i) => now - (intervals - i) * step);
  
  const [currentPrices, ...historicalPrices] = await Promise.all([
    fetchMultiplePrices(feedIds),
    ...timestamps.map(ts => fetchPricesAtTime(feedIds, ts)),
  ]);

  const result = new Map<string, number>();

  for (const id of feedIds) {
    // Collect all price points for this feed
    const prices: number[] = [];
    for (const snapshot of historicalPrices) {
      const p = snapshot.get(id);
      if (p && p > 0) prices.push(p);
    }
    const cur = currentPrices.get(id);
    if (cur && cur.price > 0) prices.push(cur.price);

    if (prices.length < 3) {
      // Fallback to confidence ratio
      if (cur) result.set(id, cur.confidence / cur.price);
      continue;
    }

    // Compute log-returns
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }

    // Standard deviation of returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    const stddev = Math.sqrt(variance);

    // Annualize (roughly): stddev * sqrt(365 * 24 / 3) ≈ * 53
    result.set(id, stddev * 53);
  }

  return result;
}

/**
 * Get top volatile tokens (cached). Used for display + feed picking.
 */
export async function getTopVolatileTokens(): Promise<VolatileToken[]> {
  if (volatilityCache.length > 0 && Date.now() - volatilityCacheTime < VOLATILITY_CACHE_TTL) {
    return volatilityCache;
  }

  const feeds = await fetchAllPythFeeds();
  if (feeds.length === 0) return [];

  // Sample a batch of ~50
  const batchSize = Math.min(50, feeds.length);
  const shuffled = [...feeds].sort(() => Math.random() - 0.5);
  const batch = shuffled.slice(0, batchSize);
  const ids = batch.map(f => f.id);

  const [currentPrices, volScores] = await Promise.all([
    fetchMultiplePrices(ids),
    computeVolatility(ids),
  ]);

  const scored: VolatileToken[] = [];
  for (const feed of batch) {
    const cur = currentPrices.get(feed.id);
    if (!cur || cur.price <= 0) continue;
    const vol = volScores.get(feed.id) || 0;
    scored.push({ feed, price: cur.price, volatility: vol });
  }

  scored.sort((a, b) => b.volatility - a.volatility);
  volatilityCache = scored;
  volatilityCacheTime = Date.now();

  console.log(`Top volatile (annualized): ${scored.slice(0, 5).map(s => `${s.feed.ticker} ${(s.volatility * 100).toFixed(0)}%`).join(', ')}`);

  return scored;
}

/**
 * Pick a feed weighted toward most volatile (stddev of 24h returns).
 */
export async function pickVolatileFeed(): Promise<{ feed: PythFeed; price: number } | null> {
  const scored = await getTopVolatileTokens();
  if (scored.length === 0) return null;

  const top = scored.slice(0, Math.max(Math.ceil(scored.length / 3), 5));
  const pick = top[Math.floor(Math.random() * top.length)];
  return { feed: pick.feed, price: pick.price };
}

/**
 * Fetch historical price candles from Hermes timestamp API (CORS-friendly).
 * Returns ~count candles of ~intervalSec seconds each, ending at now.
 */
export async function fetchHistoricalCandles(
  feedId: string,
  count: number = 10,
  intervalSec: number = 5
): Promise<Array<{ open: number; high: number; low: number; close: number; time: number }>> {
  const candles: Array<{ open: number; high: number; low: number; close: number; time: number }> = [];
  const now = Math.floor(Date.now() / 1000);
  const totalSpan = count * intervalSec;
  const startTs = now - totalSpan;

  try {
    const promises: Promise<{ idx: number; price: number | null }>[] = [];

    for (let i = 0; i < count; i++) {
      const ts = startTs + i * intervalSec;
      const url = `${HERMES_URL}/v2/updates/price/${ts}?ids[]=${feedId}&parsed=true`;
      
      promises.push(
        fetch(url)
          .then(async (res) => {
            if (!res.ok) return { idx: i, price: null };
            const data = await res.json();
            const parsed = data.parsed?.[0]?.price;
            if (!parsed) return { idx: i, price: null };
            return { idx: i, price: parsePythPrice(parsed) };
          })
          .catch(() => ({ idx: i, price: null }))
      );
    }

    const results = await Promise.all(promises);
    results.sort((a, b) => a.idx - b.idx);

    // Build candles from consecutive price points
    for (let i = 0; i < results.length - 1; i++) {
      const open = results[i].price;
      const close = results[i + 1].price;
      if (open === null || close === null) continue;
      
      candles.push({
        open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close,
        time: -(count - i) * 2,
      });
    }
    
    console.log(`Loaded ${candles.length} historical candles from Hermes for ${feedId}`);
  } catch (err) {
    console.error('Failed to fetch historical candles:', err);
  }

  return candles;
}

/**
 * Create a streaming connection to Pyth Hermes SSE by feed ID
 */
export function streamPythPriceById(
  feedId: string,
  onPrice: (price: number) => void
): () => void {
  const url = `${HERMES_URL}/v2/updates/price/stream?ids[]=${feedId}&parsed=true`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const parsed = data.parsed?.[0]?.price;
      if (parsed) {
        onPrice(parsePythPrice(parsed));
      }
    } catch (err) {
      console.error('Error parsing Pyth stream data:', err);
    }
  };

  eventSource.onerror = () => {
    console.error('Pyth SSE stream error for feed:', feedId);
  };

  return () => eventSource.close();
}
