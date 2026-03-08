import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HERMES_URL = 'https://hermes.pyth.network';

interface PythFeedRaw {
  id: string;
  attributes: { base: string; quote_currency: string };
}

const STABLECOINS = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'FRAX', 'LUSD', 'USDD', 'GUSD',
  'PYUSD', 'USDP', 'SUSD', 'CRVUSD', 'GHO', 'MKUSD', 'USDE', 'EUSD', 'DOLA', 'MIM',
  'USDJ', 'ALUSD', 'FEUSD', 'SUIUSDE', 'EZETH', 'MSOL', 'BBSOL', 'KHYPE',
  'SATS', 'USDU', 'XSGD', 'CBETH', 'STETH', 'WSTETH', 'RETH', 'AFSUI',
  'BSOL', 'JITOSOL', 'USDB', 'UST', 'USTC', 'CUSD', 'FLEXUSD',
]);

function parsePythPrice(priceObj: { price: string; expo: number }): number {
  return Number(priceObj.price) * Math.pow(10, priceObj.expo);
}

async function fetchAllFeeds() {
  const feeds: Array<{ id: string; ticker: string; pair: string }> = [];
  const seen = new Set<string>();

  const dayOfWeek = new Date().getUTCDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const assetTypes = isWeekend ? ['crypto'] : ['crypto', 'equity', 'fx', 'metal'];
  console.log(`Day: ${dayOfWeek}, weekend: ${isWeekend}, asset types: ${assetTypes.join(', ')}`);

  for (const assetType of assetTypes) {
    try {
      const res = await fetch(`${HERMES_URL}/v2/price_feeds?query=usd&asset_type=${assetType}`);
      if (!res.ok) continue;
      const data: PythFeedRaw[] = await res.json();
      for (const feed of data) {
        const base = feed.attributes?.base?.toUpperCase();
        const quote = feed.attributes?.quote_currency?.toUpperCase();
        if (!base || quote !== 'USD' || STABLECOINS.has(base) || seen.has(base)) continue;
        seen.add(base);
        feeds.push({ id: '0x' + feed.id, ticker: base, pair: `${base}/USDT` });
      }
    } catch { /* skip */ }
  }
  return feeds;
}

async function fetchPricesAtTime(feedIds: string[], timestamp: number): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (feedIds.length === 0) return result;
  try {
    const params = feedIds.map(id => `ids[]=${id}`).join('&');
    const res = await fetch(`${HERMES_URL}/v2/updates/price/${timestamp}?${params}&parsed=true`);
    if (!res.ok) return result;
    const data = await res.json();
    for (const item of data.parsed || []) {
      const price = parsePythPrice(item.price);
      if (price > 0) result.set('0x' + item.id, price);
    }
  } catch { /* */ }
  return result;
}

async function fetchCurrentPrices(feedIds: string[]): Promise<Map<string, { price: number; confidence: number }>> {
  const result = new Map<string, { price: number; confidence: number }>();
  if (feedIds.length === 0) return result;
  try {
    const params = feedIds.map(id => `ids[]=${id}`).join('&');
    const res = await fetch(`${HERMES_URL}/v2/updates/price/latest?${params}&parsed=true`);
    if (!res.ok) return result;
    const data = await res.json();
    for (const item of data.parsed || []) {
      const price = parsePythPrice(item.price);
      const conf = Number(item.price.conf) * Math.pow(10, item.price.expo);
      result.set('0x' + item.id, { price, confidence: conf });
    }
  } catch { /* */ }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('Fetching all feeds...');
    const allFeeds = await fetchAllFeeds();
    console.log(`Found ${allFeeds.length} feeds`);

    // Process in batches of 50
    const batchSize = 50;
    const allResults: Array<{ feed_id: string; ticker: string; pair: string; price: number; volatility: number }> = [];

    for (let b = 0; b < allFeeds.length; b += batchSize) {
      const batch = allFeeds.slice(b, b + batchSize);
      const ids = batch.map(f => f.id);

      const now = Math.floor(Date.now() / 1000);
      const intervals = 8;
      const step = Math.floor(86400 / intervals);
      const timestamps = Array.from({ length: intervals }, (_, i) => now - (intervals - i) * step);

      // Fetch current + historical prices
      const [currentPrices, ...historicalSnapshots] = await Promise.all([
        fetchCurrentPrices(ids),
        ...timestamps.map(ts => fetchPricesAtTime(ids, ts)),
      ]);

      for (const feed of batch) {
        const cur = currentPrices.get(feed.id);
        if (!cur || cur.price <= 0) continue;

        // Collect price points
        const prices: number[] = [];
        for (const snapshot of historicalSnapshots) {
          const p = snapshot.get(feed.id);
          if (p && p > 0) prices.push(p);
        }
        prices.push(cur.price);

        let vol: number;
        if (prices.length >= 3) {
          // Stddev of log-returns
          const returns: number[] = [];
          for (let i = 1; i < prices.length; i++) {
            returns.push(Math.log(prices[i] / prices[i - 1]));
          }
          const mean = returns.reduce((a, r) => a + r, 0) / returns.length;
          const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
          vol = Math.sqrt(variance) * 53; // annualize
        } else {
          vol = cur.confidence / cur.price;
        }

        allResults.push({
          feed_id: feed.id,
          ticker: feed.ticker,
          pair: feed.pair,
          price: cur.price,
          volatility: vol,
        });
      }

      // Small delay between batches
      if (b + batchSize < allFeeds.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Sort by volatility and keep top 50
    allResults.sort((a, b) => b.volatility - a.volatility);
    const top = allResults.slice(0, 50);

    console.log(`Top 5: ${top.slice(0, 5).map(t => `${t.ticker} ${(t.volatility * 100).toFixed(0)}%`).join(', ')}`);

    // Clear old data and insert new
    await supabase.from('volatile_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (top.length > 0) {
      const rows = top.map(t => ({
        feed_id: t.feed_id,
        ticker: t.ticker,
        pair: t.pair,
        price: t.price,
        volatility: t.volatility,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('volatile_tokens').insert(rows);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true, count: top.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
