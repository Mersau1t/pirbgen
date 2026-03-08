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
    const res = await fetch(`${HERMES_URL}/v2/price_feeds?query=usd&asset_type=crypto`);
    if (!res.ok) throw new Error(`Hermes API error: ${res.status}`);

    const data: Array<{ id: string; attributes: { symbol: string; base: string; quote_currency: string } }> = await res.json();

    // Filter to only X/USD pairs and deduplicate by base
    const seen = new Set<string>();
    const feeds: PythFeed[] = [];

    for (const feed of data) {
      const base = feed.attributes?.base?.toUpperCase();
      const quote = feed.attributes?.quote_currency?.toUpperCase();
      if (!base || quote !== 'USD') continue;
      if (seen.has(base)) continue;
      seen.add(base);

      feeds.push({
        id: '0x' + feed.id,
        ticker: base,
        pair: `${base}/USD`,
      });
    }

    feedsCache = feeds;
    feedsCacheTime = Date.now();
    console.log(`Loaded ${feeds.length} Pyth crypto/USD feeds`);
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
 * Pick a random feed, weighted toward more volatile ones.
 * Volatility proxy = confidence / price (higher = more volatile)
 */
export async function pickVolatileFeed(): Promise<{ feed: PythFeed; price: number } | null> {
  const feeds = await fetchAllPythFeeds();
  if (feeds.length === 0) return null;

  // Sample a random batch of ~30 feeds to check volatility
  const batchSize = Math.min(30, feeds.length);
  const shuffled = [...feeds].sort(() => Math.random() - 0.5);
  const batch = shuffled.slice(0, batchSize);

  const prices = await fetchMultiplePrices(batch.map(f => f.id));

  // Score by relative confidence (volatility proxy)
  const scored: Array<{ feed: PythFeed; price: number; volatility: number }> = [];
  for (const feed of batch) {
    const data = prices.get(feed.id);
    if (!data || data.price <= 0) continue;
    scored.push({
      feed,
      price: data.price,
      volatility: data.confidence / data.price,
    });
  }

  if (scored.length === 0) return null;

  // Sort by volatility descending, pick from top half with weight
  scored.sort((a, b) => b.volatility - a.volatility);
  const topHalf = scored.slice(0, Math.max(Math.ceil(scored.length / 2), 3));
  const pick = topHalf[Math.floor(Math.random() * topHalf.length)];

  return { feed: pick.feed, price: pick.price };
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
