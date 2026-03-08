// Pyth Network Hermes API integration for real-time price feeds

const HERMES_URL = 'https://hermes.pyth.network';

// Pyth Price Feed IDs (Stable feeds)
export const PRICE_FEED_IDS: Record<string, string> = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  DOGE: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  PEPE: '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
  AVAX: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
};

export interface PythPrice {
  price: number;
  confidence: number;
  expo: number;
  publishTime: number;
}

/**
 * Parse a Pyth price object into a human-readable number
 */
function parsePythPrice(priceObj: { price: string; expo: number }): number {
  return Number(priceObj.price) * Math.pow(10, priceObj.expo);
}

/**
 * Fetch the latest price for a given ticker from Pyth Hermes
 */
export async function fetchPythPrice(ticker: string): Promise<number | null> {
  const feedId = PRICE_FEED_IDS[ticker];
  if (!feedId) {
    console.warn(`No Pyth feed ID for ticker: ${ticker}`);
    return null;
  }

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
    console.error(`Failed to fetch Pyth price for ${ticker}:`, err);
    return null;
  }
}

/**
 * Create a streaming connection to Pyth Hermes SSE for real-time price updates
 * Returns a cleanup function to close the connection
 */
export function streamPythPrice(
  ticker: string,
  onPrice: (price: number) => void
): () => void {
  const feedId = PRICE_FEED_IDS[ticker];
  if (!feedId) {
    console.warn(`No Pyth feed ID for ticker: ${ticker}`);
    return () => {};
  }

  const url = `${HERMES_URL}/v2/updates/price/stream?ids[]=${feedId}&parsed=true`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const parsed = data.parsed?.[0]?.price;
      if (parsed) {
        const price = parsePythPrice(parsed);
        onPrice(price);
      }
    } catch (err) {
      console.error('Error parsing Pyth stream data:', err);
    }
  };

  eventSource.onerror = (err) => {
    console.error('Pyth SSE stream error:', err);
  };

  return () => {
    eventSource.close();
  };
}
