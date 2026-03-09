import { useState, useEffect, useRef, useCallback } from 'react';
import PriceChart, { type Candle } from '@/components/PriceChart';
import { streamPythPriceById, type PythPriceTick } from '@/lib/pyth';

interface SpectatorChartProps {
  ticker: string;
  feedId: string;
  entryPrice: number;
  initialCandles: Candle[];
}

/** Read-only price chart — shows only ticker, live price, and chart. No PnL, no direction, no leverage. */
export default function SpectatorChart({ ticker, feedId, entryPrice, initialCandles }: SpectatorChartProps) {
  const [currentPrice, setCurrentPrice] = useState(entryPrice);
  const [candles, setCandles] = useState<Candle[]>(() => {
    const history = initialCandles.filter(c => c.time < 0).slice(-27);
    return [
      ...history,
      { open: entryPrice, high: entryPrice, low: entryPrice, close: entryPrice, time: 0 },
    ];
  });
  const candleRef = useRef<{ ticks: PythPriceTick[] }>({ ticks: [] });

  useEffect(() => {
    let rafId = 0;
    let pendingPrice: number | null = null;

    const flushPrice = () => {
      if (pendingPrice !== null) {
        setCurrentPrice(pendingPrice);
        pendingPrice = null;
      }
      rafId = 0;
    };

    const cleanup = streamPythPriceById(feedId, (tick) => {
      candleRef.current.ticks.push(tick);
      pendingPrice = tick.price;
      if (!rafId) rafId = requestAnimationFrame(flushPrice);
    });

    const candleTick = setInterval(() => {
      if (candleRef.current.ticks.length >= 2) {
        const ticks = candleRef.current.ticks;
        const nextCandle: Candle = {
          open: ticks[0].price,
          high: Math.max(...ticks.map(t => t.price + t.confidence)),
          low: Math.min(...ticks.map(t => t.price - t.confidence)),
          close: ticks[ticks.length - 1].price,
          time: 0,
        };
        setCandles(prev => {
          const lastLiveTime = [...prev].reverse().find(c => c.time >= 0)?.time ?? 0;
          return [...prev.slice(-27), { ...nextCandle, time: lastLiveTime + 2 }];
        });
        candleRef.current.ticks = [];
      }
    }, 1000);

    return () => {
      cleanup();
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(candleTick);
    };
  }, [feedId]);

  const fmtPrice = (p: number) => {
    const abs = Math.abs(p);
    if (abs >= 10000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 1000) return '$' + p.toFixed(3);
    if (abs >= 100) return '$' + p.toFixed(4);
    if (abs >= 1) return '$' + p.toFixed(5);
    return '$' + p.toPrecision(6);
  };

  const positive = currentPrice >= entryPrice;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      {/* Minimal header: just ticker + price */}
      <div className="glass-panel rounded-sm px-3 py-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-display text-muted-foreground tracking-wider uppercase">OPPONENT</span>
            <h2 className="font-display text-sm text-foreground text-glow-purple">{ticker}/USD</h2>
            <span className="text-[9px] font-display text-muted-foreground/40 tracking-wider">🎲 ???</span>
          </div>
          <div className="text-right">
            <p className="text-[7px] text-muted-foreground/60 uppercase">Price</p>
            <p className="font-mono text-sm font-bold text-muted-foreground">
              {fmtPrice(currentPrice)}
            </p>
          </div>
        </div>
      </div>

      {/* Chart — neutral colors, duelMode hides SL/TP */}
      <div className="glass-panel rounded-sm overflow-hidden flex-1 min-h-0 border border-border/20">
        <PriceChart
          candles={candles}
          entryPrice={entryPrice}
          positive={positive}
          direction="LONG"
          stopLoss={-9999}
          takeProfit={9999}
          leverage={1}
          duelMode
        />
      </div>
    </div>
  );
}
