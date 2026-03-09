import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import PriceChart, { type Candle } from '@/components/PriceChart';
import { streamPythPriceById, type PythPriceTick } from '@/lib/pyth';

interface SpectatorChartProps {
  ticker: string;
  feedId: string;
  entryPrice: number;
  initialCandles: Candle[];
  timerSeconds: number;
  started: boolean;
}

const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

function fmtPrice(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return '$' + p.toFixed(3);
  if (abs >= 100) return '$' + p.toFixed(4);
  if (abs >= 1) return '$' + p.toFixed(5);
  return '$' + p.toPrecision(6);
}

export default function SpectatorChart({ ticker, feedId, entryPrice, initialCandles, timerSeconds, started }: SpectatorChartProps) {
  const [currentPrice, setCurrentPrice] = useState(entryPrice);
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const [candles, setCandles] = useState<Candle[]>(() => {
    const history = initialCandles.filter(c => c.time < 0).slice(-27);
    return [
      ...history,
      { open: entryPrice, high: entryPrice, low: entryPrice, close: entryPrice, time: 0 },
    ];
  });
  const candleRef = useRef<{ ticks: PythPriceTick[] }>({ ticks: [] });

  // Price streaming
  useEffect(() => {
    let rafId = 0;
    let pendingPrice: number | null = null;
    const flushPrice = () => {
      if (pendingPrice !== null) { setCurrentPrice(pendingPrice); pendingPrice = null; }
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
    return () => { cleanup(); if (rafId) cancelAnimationFrame(rafId); clearInterval(candleTick); };
  }, [feedId]);

  // Countdown timer (mirrors LiveTradePanel)
  useEffect(() => {
    if (!started) return;
    setTimeLeft(timerSeconds);
    const iv = setInterval(() => {
      setTimeLeft(t => {
        const next = t - 1;
        if (next <= 0) { clearInterval(iv); return 0; }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [started, timerSeconds]);

  const positive = currentPrice >= entryPrice;
  const timerPct = (timeLeft / timerSeconds) * 100;
  const timerUrgent = timeLeft <= 15;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      {/* Header — mirrors LiveTradePanel structure but neutral */}
      <div className="glass-panel rounded-sm px-3 py-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-display text-muted-foreground tracking-wider uppercase">OPPONENT</span>
            <h2 className="font-display text-sm text-foreground text-glow-purple">{ticker}/USD</h2>
            <span className="px-1.5 py-0.5 text-[9px] font-display tracking-wider bg-muted/20 text-muted-foreground border border-border/30">
              🎲 ???
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[7px] text-muted-foreground/60 uppercase">Current</p>
              <p className="font-mono text-sm font-bold text-muted-foreground">
                {fmtPrice(currentPrice)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[7px] text-muted-foreground/60 uppercase">Entry</p>
              <p className="font-mono text-[10px] text-neon-purple">{fmtPrice(entryPrice)}</p>
            </div>
            <div className="text-center">
              <p className="text-[7px] text-muted-foreground/60 uppercase">PnL</p>
              <p className="font-mono text-sm font-bold text-muted-foreground">???</p>
            </div>
          </div>
        </div>

        {/* Timer bar — same as LiveTradePanel */}
        {started && timeLeft > 0 && (
          <div className="mt-1">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-display tracking-wider ${timerUrgent ? 'text-neon-red animate-pulse' : 'text-neon-orange'}`}>
                ⏱ {formatTime(timeLeft)}
              </span>
              <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden border border-border/20">
                <motion.div
                  className={`h-full rounded-full ${timerUrgent ? 'bg-neon-red' : 'bg-neon-orange'}`}
                  style={{ width: `${timerPct}%` }}
                  animate={timerUrgent ? { opacity: [0.5, 1, 0.5] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart — spectator mode, neutral colors */}
      <div className="relative rounded-sm overflow-hidden flex-1 min-h-0 border border-foreground/10">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent pointer-events-none" />
        <PriceChart
          candles={candles}
          entryPrice={entryPrice}
          positive={positive}
          direction="LONG"
          stopLoss={-9999}
          takeProfit={9999}
          leverage={1}
          duelMode
          spectator
        />
      </div>

      {/* Bottom bar — mirrors LiveTradePanel but no button */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 py-1">
          <span className="w-2 h-2 bg-muted-foreground/40 animate-blink" />
          <span className="font-display text-[10px] text-muted-foreground tracking-wider">
            PVP DUEL · OPPONENT
          </span>
        </div>
      </div>
    </div>
  );
}
