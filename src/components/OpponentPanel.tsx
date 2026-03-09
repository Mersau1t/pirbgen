import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import PriceChart, { type Candle } from '@/components/PriceChart';
import { streamPythPriceById, type PythPriceTick } from '@/lib/pyth';

interface OpponentPanelProps {
  ticker: string;
  feedId: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  rarity: string;
  entryPrice: number;
  initialCandles: Candle[];
  opponentName: string;
  opponentPnl: number;
  opponentClosed: boolean;
  started: boolean;
}

const RARITY_STYLES: Record<string, { text: string; label: string }> = {
  common: { text: 'text-muted-foreground', label: 'COMMON' },
  rare: { text: 'text-neon-cyan', label: 'RARE' },
  legendary: { text: 'text-neon-amber', label: 'LEGENDARY' },
  degen: { text: 'text-neon-magenta', label: '☠ DEGEN' },
};

export default function OpponentPanel({
  ticker, feedId, direction, leverage, stopLoss, takeProfit, rarity,
  entryPrice, initialCandles, opponentName, opponentPnl, opponentClosed, started,
}: OpponentPanelProps) {
  const [currentPrice, setCurrentPrice] = useState(entryPrice);
  const [candles, setCandles] = useState<Candle[]>(() => {
    const history = initialCandles.filter(c => c.time < 0).slice(-27);
    return [
      ...history,
      { open: entryPrice, high: entryPrice, low: entryPrice, close: entryPrice, time: 0 },
    ];
  });
  const candleRef = useRef<{ ticks: PythPriceTick[] }>({ ticks: [] });

  // Stream opponent's token price
  useEffect(() => {
    if (!started || opponentClosed) return;
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
  }, [feedId, started, opponentClosed]);

  const rarityStyle = RARITY_STYLES[rarity] || RARITY_STYLES.common;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1 opacity-90">
      {/* Opponent info bar */}
      <div className="glass-panel rounded-sm px-3 py-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm text-foreground">{opponentName}</span>
            <span className="text-[9px] font-mono text-muted-foreground/60">·</span>
            <span className="font-display text-sm text-foreground">{ticker}/USD</span>
            <span className={`text-[9px] px-1.5 py-0.5 font-display ${
              direction === 'LONG' ? 'text-neon-green bg-neon-green/10 border border-neon-green/30' : 'text-neon-red bg-neon-red/10 border border-neon-red/30'
            }`}>{direction}</span>
            <span className={`text-[9px] font-display ${rarityStyle.text}`}>{leverage}x</span>
          </div>
          <div className="flex items-center gap-3">
            <p className={`font-mono text-base font-bold ${opponentPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
              {opponentPnl >= 0 ? '+' : ''}{opponentPnl.toFixed(2)}%
            </p>
            {opponentClosed && (
              <span className="text-[8px] font-display tracking-wider px-2 py-0.5 bg-neon-red/10 border border-neon-red/30 text-neon-red">
                CLOSED
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Opponent chart */}
      <div className="glass-panel rounded-sm overflow-hidden flex-1 min-h-0 border border-border/20 relative">
        <PriceChart
          candles={candles}
          entryPrice={entryPrice}
          positive={opponentPnl >= 0}
          direction={direction}
          stopLoss={stopLoss}
          takeProfit={takeProfit}
          leverage={leverage}
        />
        {opponentClosed && (
          <div className="absolute inset-0 bg-background/40 flex items-center justify-center">
            <span className="font-display text-lg text-neon-red text-glow-red tracking-wider">POSITION CLOSED</span>
          </div>
        )}
      </div>
    </div>
  );
}
