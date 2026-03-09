import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import PriceChart, { type Candle } from '@/components/PriceChart';
import PixelConfetti from '@/components/PixelConfetti';
import { streamPythPriceById, type PythPriceTick } from '@/lib/pyth';
import { playWinSound, playRektSound, playCoinSound } from '@/lib/sounds';
import { playTimerTick, playTimerUrgent } from '@/lib/timerSounds';
import { startTensionAudio, setTensionIntensity, stopTensionAudio } from '@/lib/tensionSounds';
import { getPirbTrashTalkCycled } from '@/lib/pirbTalk';

interface DegenPosition {
  id: number;
  asset: string;
  ticker: string;
  feedId: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  rarity: 'common' | 'rare' | 'legendary' | 'degen';
}

const RARITY_STYLES: Record<string, { border: string; text: string; bg: string; label: string }> = {
  common: { border: 'border-muted-foreground/30', text: 'text-muted-foreground', bg: 'bg-muted/20', label: 'COMMON' },
  rare: { border: 'border-neon-green/50', text: 'text-neon-green', bg: 'bg-neon-green/10', label: 'RARE' },
  legendary: { border: 'border-neon-orange/50', text: 'text-neon-orange', bg: 'bg-neon-orange/10', label: 'LEGENDARY' },
  degen: { border: 'border-neon-purple/50', text: 'text-neon-purple', bg: 'bg-neon-purple/10', label: '☠ DEGEN ☠' },
};

interface LiveTradePanelProps {
  position: DegenPosition;
  entryPrice: number;
  initialCandles: Candle[];
  onResult: (status: 'WIN' | 'REKT', pnl: number) => void;
  onExitEarly: (pnl: number) => void;
  playerName: string;
  walletAddress: string | null;
  timerSeconds?: number;
  duelMode?: boolean; // disables SL/TP hit, hides SL/TP UI
  onPnlChange?: (pnl: number) => void; // real-time PnL callback
  compact?: boolean; // compact header for split-screen
  readOnly?: boolean; // no close button, no leaderboard save
  label?: string; // label like "YOU" or opponent name
}

const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

function fmtPrice(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return '$' + p.toFixed(3);
  if (abs >= 100) return '$' + p.toFixed(4);
  if (abs >= 1) return '$' + p.toFixed(5);
  if (abs >= 0.01) return '$' + p.toFixed(7);
  if (abs >= 0.0001) return '$' + p.toFixed(9);
  return '$' + p.toPrecision(6);
}

function LiveTradePanel({ position, entryPrice: initialEntryPrice, initialCandles, onResult, onExitEarly, playerName, walletAddress, timerSeconds, duelMode, onPnlChange, compact, readOnly, label }: LiveTradePanelProps) {
  const [entryPrice] = useState(initialEntryPrice);
  const [currentPrice, setCurrentPrice] = useState(initialEntryPrice);
  const [pnl, setPnl] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timerSeconds ?? 0);
  const [candles, setCandles] = useState<Candle[]>(() => {
    const history = initialCandles.filter(c => c.time < 0).slice(-27);
    return [
      ...history,
      {
        open: initialEntryPrice,
        high: initialEntryPrice,
        low: initialEntryPrice,
        close: initialEntryPrice,
        time: 0,
      },
    ];
  });
  const [result, setResult] = useState<'WIN' | 'REKT' | null>(null);
  const [showResultAnim, setShowResultAnim] = useState(false);
  const candleRef = useRef<{ ticks: PythPriceTick[] }>({ ticks: [] });
  const resultFiredRef = useRef(false);
  const terminalTickAddedRef = useRef(false);

  const appendTerminalCandle = useCallback((price: number) => {
    if (terminalTickAddedRef.current) return;
    terminalTickAddedRef.current = true;

    setCandles(prev => {
      const lastLiveTime = [...prev].reverse().find(c => c.time >= 0)?.time ?? 0;
      const terminal: Candle = {
        open: price,
        high: price,
        low: price,
        close: price,
        time: lastLiveTime + 1,
      };
      return [...prev.slice(-27), terminal];
    });
  }, []);

  const hasTimer = !!timerSeconds && timerSeconds > 0;
  const rarityStyle = RARITY_STYLES[position.rarity];

  // Pyth streaming
  useEffect(() => {
    if (result) return;
    let rafId = 0;
    let pendingPrice: number | null = null;

    const flushPrice = () => {
      if (pendingPrice !== null) {
        setCurrentPrice(pendingPrice);
        pendingPrice = null;
      }
      rafId = 0;
    };

    const cleanup = streamPythPriceById(position.feedId, (tick) => {
      candleRef.current.ticks.push(tick);
      pendingPrice = tick.price;
      if (!rafId) {
        rafId = requestAnimationFrame(flushPrice);
      }
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

    const elapsedTimer = setInterval(() => setElapsedTime(t => t + 1), 1000);

    return () => {
      cleanup();
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(candleTick);
      clearInterval(elapsedTimer);
    };
  }, [position.ticker, result]);

  // Countdown timer
  useEffect(() => {
    if (!hasTimer || result) return;
    setTimeLeft(timerSeconds!);
    const iv = setInterval(() => {
      setTimeLeft(t => {
        const next = t - 1;
        if (next <= 0) {
          clearInterval(iv);
          return 0;
        }
        // Sound effects
        if (next <= 10) playTimerUrgent();
        else if (next % 10 === 0) playTimerTick();
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [hasTimer, timerSeconds, result]);

  // Auto-close on timer expiry
  useEffect(() => {
    if (hasTimer && timeLeft === 0 && !resultFiredRef.current && !result) {
      resultFiredRef.current = true;
      const finalResult = pnl >= 0 ? 'WIN' : 'REKT';
      setResult(finalResult);
      if (finalResult === 'WIN') playWinSound(); else playRektSound();
      saveToLeaderboard(pnl);
      onExitEarly(pnl);
      setTimeout(() => setShowResultAnim(true), 1500);
    }
  }, [timeLeft, hasTimer, result, pnl]);

  // Start tension audio on trade open, stop on result
  useEffect(() => {
    startTensionAudio();
    return () => stopTensionAudio();
  }, []);

  // PnL calculation + tension intensity
  useEffect(() => {
    if (result) {
      stopTensionAudio();
      return;
    }
    const diff = ((currentPrice - entryPrice) / entryPrice) * 100;
    const calculatedPnl = position.direction === 'LONG' ? diff * position.leverage : -diff * position.leverage;
    setPnl(calculatedPnl);
    onPnlChange?.(calculatedPnl);

    if (duelMode) return; // No SL/TP logic in duel mode

    // Tension intensity: how close are we to SL or TP (0..1)
    const slProximity = Math.abs(calculatedPnl / position.stopLoss);
    const tpProximity = Math.abs(calculatedPnl / position.takeProfit);
    const intensity = Math.max(slProximity, tpProximity);
    setTensionIntensity(intensity);

    if (!resultFiredRef.current) {
      if (calculatedPnl <= position.stopLoss) {
        resultFiredRef.current = true;
        appendTerminalCandle(currentPrice);
        setResult('REKT');
        playRektSound();
        onResult('REKT', calculatedPnl);
        if (!readOnly) saveToLeaderboard(calculatedPnl);
        setTimeout(() => setShowResultAnim(true), 1500);
      } else if (calculatedPnl >= position.takeProfit) {
        resultFiredRef.current = true;
        appendTerminalCandle(currentPrice);
        setResult('WIN');
        playWinSound();
        onResult('WIN', calculatedPnl);
        if (!readOnly) saveToLeaderboard(calculatedPnl);
        setTimeout(() => setShowResultAnim(true), 1500);
      }
    }
  }, [currentPrice, entryPrice, position, result, duelMode]);

  const saveToLeaderboard = (finalPnl: number) => {
    supabase.from('leaderboard').insert({
      player_name: playerName,
      ticker: position.ticker,
      direction: position.direction,
      leverage: position.leverage,
      pnl_percent: Number(finalPnl.toFixed(1)),
      rarity: position.rarity,
      wallet_address: walletAddress,
    }).then(() => {});
  };

  const handleExit = useCallback(() => {
    if (result || readOnly) return;
    playCoinSound();
    resultFiredRef.current = true;
    const finalResult = pnl >= 0 ? 'WIN' : 'REKT';
    setResult(finalResult);
    if (finalResult === 'WIN') playWinSound(); else playRektSound();
    if (!readOnly) saveToLeaderboard(pnl);
    onExitEarly(pnl);
    setTimeout(() => setShowResultAnim(true), 1500);
  }, [pnl, result, readOnly]);

  const timerPct = hasTimer ? (timeLeft / timerSeconds!) * 100 : 0;
  const timerUrgent = hasTimer && timeLeft <= 15;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      {/* Position info */}
      <div className="glass-panel rounded-sm px-3 py-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {label && <span className="text-[9px] font-display text-muted-foreground tracking-wider uppercase">{label}</span>}
            <h2 className={`font-display ${compact ? 'text-sm' : 'text-xl sm:text-2xl'} text-foreground text-glow-purple`}>{position.ticker}/USD</h2>
            <span className={`px-1.5 py-0.5 text-[9px] font-display tracking-wider ${
              position.direction === 'LONG'
                ? 'bg-neon-green/10 text-neon-green border border-neon-green/30'
                : 'bg-neon-orange/10 text-neon-orange border border-neon-orange/30'
            }`}>
              {position.direction}
            </span>
            <span className={`${compact ? 'text-[10px]' : 'text-sm'} font-display ${rarityStyle.text}`}>{position.leverage}x</span>
            <span className={`text-[8px] font-display tracking-[0.15em] px-1.5 py-0.5 border ${rarityStyle.border} ${rarityStyle.text} ${rarityStyle.bg}`}>{rarityStyle.label}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[7px] text-muted-foreground/60 uppercase">Current</p>
              <p className={`font-mono ${compact ? 'text-sm' : 'text-xl sm:text-2xl'} font-bold transition-colors duration-500 ease-in-out`}
                 style={{ color: pnl >= 0 ? '#07e46e' : '#f97316', textShadow: pnl >= 0 ? '0 0 12px #07e46e88' : '0 0 12px #f9731688' }}>
                {fmtPrice(currentPrice)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[7px] text-muted-foreground/60 uppercase">Entry</p>
              <p className={`font-mono ${compact ? 'text-[10px]' : 'text-sm'} text-neon-purple`}>{fmtPrice(entryPrice)}</p>
            </div>
            <div className="text-center">
              <p className="text-[7px] text-muted-foreground/60 uppercase">PnL</p>
              <p className={`font-mono ${compact ? 'text-sm' : 'text-lg'} font-bold transition-colors duration-500 ease-in-out`}
                 style={{ color: pnl >= 0 ? '#07e46e' : '#f97316' }}>
                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* SL/TP only in non-duel mode */}
          {!duelMode && (
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-[7px] text-muted-foreground/60 uppercase">SL</p>
                <p className="text-xs font-mono text-neon-orange font-bold">{position.stopLoss}%</p>
              </div>
              <div className="text-center">
                <p className="text-[7px] text-muted-foreground/60 uppercase">TP</p>
                <p className="text-xs font-mono text-neon-green font-bold">+{position.takeProfit}%</p>
              </div>
              <div className="text-center">
                <p className="text-[7px] text-muted-foreground/60 uppercase">Time</p>
                <p className="text-xs font-mono text-muted-foreground">{formatTime(elapsedTime)}</p>
              </div>
            </div>
          )}
        </div>

        {/* PnL progress bar - only in non-duel mode */}
        {!duelMode && (
          <div className="mt-2">
            <div className="h-2 bg-muted/20 rounded-full overflow-hidden relative border border-border/20">
              <div className="absolute left-1/2 top-0 w-0.5 h-full bg-muted-foreground/40 z-10 -translate-x-1/2" />
              {pnl !== 0 && (
                <motion.div
                  className={`absolute top-0 h-full ${pnl >= 0 ? 'bg-neon-green' : 'bg-neon-orange'} rounded-full`}
                  style={{
                    width: `${Math.min(Math.abs(pnl) / (pnl >= 0 ? position.takeProfit : Math.abs(position.stopLoss)) * 50, 50)}%`,
                    left: pnl >= 0 ? '50%' : undefined,
                    right: pnl < 0 ? '50%' : undefined,
                  }}
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </div>
            <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
              <span className="text-neon-red">{position.stopLoss}%</span>
              <span className="text-neon-green">+{position.takeProfit}%</span>
            </div>
          </div>
        )}

        {/* Timer bar */}
        {hasTimer && !result && (
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

      {/* Chart */}
      <div className="glass-panel rounded-sm overflow-hidden flex-1 min-h-0 border border-border/20">
        <PriceChart
          candles={candles}
          entryPrice={entryPrice}
          positive={pnl >= 0}
          direction={position.direction}
          stopLoss={duelMode ? -9999 : position.stopLoss}
          takeProfit={duelMode ? 9999 : position.takeProfit}
          leverage={position.leverage}
          result={result}
          duelMode={duelMode}
        />
      </div>

      {/* Bottom actions */}
      <div className="shrink-0">
        {!result && !readOnly && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 overflow-hidden">
              <span className="w-2 h-2 bg-neon-orange animate-blink shrink-0" />
              <span className="font-display text-[10px] text-neon-orange text-glow-orange tracking-wider truncate">
                {getPirbTrashTalkCycled(elapsedTime, duelMode ? 'duel' : hasTimer ? 'daily' : 'solo')}
              </span>
            </div>
            <button onClick={handleExit} className="arcade-btn arcade-btn-primary text-[10px] py-2 px-4">
              ⚡ CLOSE POSITION
            </button>
          </div>
        )}

        {readOnly && !result && (
          <div className="flex items-center gap-2 py-1">
            <span className="w-2 h-2 bg-neon-cyan animate-blink" />
            <span className="font-display text-[10px] text-neon-cyan tracking-wider">OPPONENT · LIVE</span>
          </div>
        )}

        {result && !showResultAnim && (
          <div className="text-center py-1">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className={`font-display text-sm tracking-wider ${result === 'WIN' ? 'text-neon-green' : 'text-neon-red'}`}
            >
              CLOSING...
            </motion.p>
          </div>
        )}

        {showResultAnim && result === 'WIN' && !duelMode && (
          <>
            <PixelConfetti active={true} />
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-1">
              <p className="font-display text-lg text-neon-green text-glow-green animate-rainbow inline-block">🎯 TARGET HIT! +{pnl.toFixed(2)}%</p>
            </motion.div>
          </>
        )}

        {showResultAnim && result === 'REKT' && !duelMode && (
          <>
            <PixelConfetti active={true} variant="rekt" />
            <motion.div
              initial={{ scale: 0.5, opacity: 0, x: 0 }}
              animate={{ scale: 1, opacity: 1, x: [0, -8, 8, -6, 6, -3, 3, 0] }}
              transition={{ x: { duration: 0.5, ease: 'easeOut' }, scale: { duration: 0.3 } }}
              className="text-center py-1"
            >
              <p className="font-display text-lg text-neon-red text-glow-red inline-block">💀 LIQUIDATED {pnl.toFixed(2)}%</p>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(LiveTradePanel);
export type { DegenPosition };
