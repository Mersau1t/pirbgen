import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import pirbMascot from '@/assets/pirb-mascot.png';
import { playGenerateClick, playWinSound, playRektSound } from '@/lib/sounds';
import PriceChart, { type Candle } from '@/components/PriceChart';
import { useWallet, shortenAddress } from '@/contexts/WalletContext';
import { getAvatarEmoji } from '@/pages/Profile';

// --- TYPES ---
type TradeDirection = 'LONG' | 'SHORT';
type GameStatus = 'IDLE' | 'GENERATING' | 'PLAYING' | 'WIN' | 'REKT';

interface DegenPosition {
  id: number;
  asset: string;
  ticker: string;
  direction: TradeDirection;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  rarity: 'common' | 'rare' | 'legendary' | 'degen';
}

// --- POSITION DATABASE ---
const POSITIONS: DegenPosition[] = [
  { id: 1, asset: 'Bitcoin', ticker: 'BTC', direction: 'LONG', leverage: 5, stopLoss: -20, takeProfit: 100, rarity: 'common' },
  { id: 2, asset: 'Ethereum', ticker: 'ETH', direction: 'LONG', leverage: 10, stopLoss: -10, takeProfit: 100, rarity: 'common' },
  { id: 3, asset: 'Solana', ticker: 'SOL', direction: 'SHORT', leverage: 20, stopLoss: -50, takeProfit: 200, rarity: 'rare' },
  { id: 4, asset: 'Dogecoin', ticker: 'DOGE', direction: 'LONG', leverage: 50, stopLoss: -100, takeProfit: 500, rarity: 'rare' },
  { id: 5, asset: 'Bitcoin', ticker: 'BTC', direction: 'SHORT', leverage: 100, stopLoss: -100, takeProfit: 500, rarity: 'legendary' },
  { id: 6, asset: 'Ethereum', ticker: 'ETH', direction: 'SHORT', leverage: 75, stopLoss: -100, takeProfit: 300, rarity: 'legendary' },
  { id: 7, asset: 'Dogecoin', ticker: 'DOGE', direction: 'SHORT', leverage: 125, stopLoss: -100, takeProfit: 1000, rarity: 'degen' },
  { id: 8, asset: 'Solana', ticker: 'SOL', direction: 'LONG', leverage: 100, stopLoss: -100, takeProfit: 800, rarity: 'degen' },
  { id: 9, asset: 'Pepe', ticker: 'PEPE', direction: 'LONG', leverage: 125, stopLoss: -100, takeProfit: 1250, rarity: 'degen' },
  { id: 10, asset: 'Avalanche', ticker: 'AVAX', direction: 'SHORT', leverage: 30, stopLoss: -30, takeProfit: 150, rarity: 'rare' },
];

const RARITY_STYLES: Record<string, { border: string; text: string; bg: string; label: string }> = {
  common: { border: 'border-muted-foreground/30', text: 'text-muted-foreground', bg: 'bg-muted/20', label: 'COMMON' },
  rare: { border: 'border-neon-cyan/50', text: 'text-neon-cyan', bg: 'bg-neon-cyan/10', label: 'RARE' },
  legendary: { border: 'border-neon-amber/50', text: 'text-neon-amber', bg: 'bg-neon-amber/10', label: 'LEGENDARY' },
  degen: { border: 'border-neon-magenta/50', text: 'text-neon-magenta', bg: 'bg-neon-magenta/10', label: '☠ DEGEN ☠' },
};

const TickerMarquee = () => {
  const tickers = ['BTC $67,432.10 ▲2.3%', 'ETH $3,521.88 ▼0.8%', 'SOL $178.42 ▲5.1%', 'DOGE $0.1823 ▲12.4%', 'PEPE $0.00001337 ▲42.0%', 'AVAX $38.92 ▼1.2%'];
  const doubled = [...tickers, ...tickers];
  return (
    <div className="overflow-hidden border-b border-border/30 bg-muted/30 py-1">
      <div className="animate-marquee flex whitespace-nowrap gap-8 text-xs text-muted-foreground font-mono">
        {doubled.map((t, i) => (
          <span key={i} className={t.includes('▲') ? 'text-neon-green' : 'text-neon-red'}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
};

const GlitchText = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`relative inline-block ${className}`}>
    <span className="relative z-10">{children}</span>
    <span className="absolute inset-0 text-neon-magenta/50 animate-glitch z-0" aria-hidden>{children}</span>
  </span>
);

export default function PirbTerminal() {
  const { walletAddress, profile, isConnecting, connectWallet } = useWallet();
  const navigate = useNavigate();
  const [activePos, setActivePos] = useState<DegenPosition | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<GameStatus>('IDLE');
  const [pnl, setPnl] = useState(0);
  const [pnlPercent, setPnlPercent] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [candles, setCandles] = useState<Candle[]>([]);
  const candleRef = useRef<{ ticks: number[]; }>({ ticks: [] });

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem('pirbgenSession');
    if (saved) {
      const { pos, price, savedStatus } = JSON.parse(saved);
      if (savedStatus === 'PLAYING') {
        setActivePos(pos);
        setEntryPrice(price);
        setStatus('PLAYING');
        setCurrentPrice(price);
      }
    }
  }, []);

  // Save session
  useEffect(() => {
    if (activePos && status === 'PLAYING') {
      localStorage.setItem('pirbgenSession', JSON.stringify({ pos: activePos, price: entryPrice, savedStatus: status }));
    } else if (status !== 'PLAYING') {
      localStorage.removeItem('pirbgenSession');
    }
  }, [activePos, entryPrice, status]);

  // Price simulation — tick every 1s, candle every 2 ticks
  useEffect(() => {
    if (status !== 'PLAYING' || !activePos) return;
    const interval = setInterval(() => {
      setCurrentPrice(prev => {
        if (!prev) return 100;
        const volatility = prev * (0.002 + (activePos.leverage / 5000));
        const newPrice = prev + (Math.random() - 0.5) * volatility;

        candleRef.current.ticks.push(newPrice);

        if (candleRef.current.ticks.length >= 2) {
          const ticks = candleRef.current.ticks;
          const candle: Candle = {
            open: ticks[0],
            high: Math.max(...ticks),
            low: Math.min(...ticks),
            close: ticks[ticks.length - 1],
            time: 0, // will be set below
          };
          setCandles(c => {
            const liveCount = c.filter(x => x.time >= 0).length;
            candle.time = (liveCount + 1) * 2;
            return [...c.slice(-27), candle];
          });
          candleRef.current.ticks = [];
        }

        return newPrice;
      });
      setElapsedTime(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [status, activePos]);

  // PnL calculation
  useEffect(() => {
    if (status !== 'PLAYING' || !currentPrice || !entryPrice || !activePos) return;
    const diff = ((currentPrice - entryPrice) / entryPrice) * 100;
    const calculatedPnl = activePos.direction === 'LONG' ? diff * activePos.leverage : -diff * activePos.leverage;
    setPnl(calculatedPnl);
    setPnlPercent(diff);

    if (calculatedPnl <= activePos.stopLoss) {
      setStatus('REKT');
      playRektSound();
      supabase.from('leaderboard').insert({
        player_name: profile?.display_name || 'Anonymous',
        ticker: activePos.ticker,
        direction: activePos.direction,
        leverage: activePos.leverage,
        pnl_percent: Number(calculatedPnl.toFixed(1)),
        rarity: activePos.rarity,
        wallet_address: walletAddress || null,
      }).then(() => {});
    } else if (calculatedPnl >= activePos.takeProfit) {
      setStatus('WIN');
      playWinSound();
      supabase.from('leaderboard').insert({
        player_name: profile?.display_name || 'Anonymous',
        ticker: activePos.ticker,
        direction: activePos.direction,
        leverage: activePos.leverage,
        pnl_percent: Number(calculatedPnl.toFixed(1)),
        rarity: activePos.rarity,
        wallet_address: walletAddress || null,
      }).then(() => {});
    }
  }, [currentPrice, entryPrice, activePos, status]);

  const generatePosition = useCallback(() => {
    playGenerateClick();
    setStatus('GENERATING');
    setElapsedTime(0);
    setTimeout(() => {
      const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
      const price = Math.random() * 1000 + 100;

      // Generate pre-history candles leading up to entry price
      const historyCandles: Candle[] = [];
      const histCount = 8;
      // Work backwards from entry price
      let histPrice = price;
      const rawCandles: { open: number; high: number; low: number; close: number }[] = [];
      for (let i = 0; i < histCount; i++) {
        const vol = histPrice * 0.004;
        const close = histPrice;
        const ticks = [close];
        for (let t = 0; t < 4; t++) {
          histPrice += (Math.random() - 0.5) * vol;
          ticks.push(histPrice);
        }
        const open = histPrice;
        rawCandles.unshift({
          open,
          high: Math.max(...ticks),
          low: Math.min(...ticks),
          close,
        });
      }
      rawCandles.forEach((c, i) => {
        historyCandles.push({ ...c, time: -(histCount - i) * 2 });
      });

      setActivePos(pos);
      setEntryPrice(price);
      setCurrentPrice(price);
      setPnl(0);
      setPnlPercent(0);
      setCandles(historyCandles);
      candleRef.current = { ticks: [] };
      setStatus('PLAYING');
    }, 2000);
  }, []);

  const exitEarly = useCallback(() => {
    if (status !== 'PLAYING' || !activePos) return;
    // Save to leaderboard
    supabase.from('leaderboard').insert({
      player_name: profile?.display_name || 'Anonymous',
      ticker: activePos.ticker,
      direction: activePos.direction,
      leverage: activePos.leverage,
      pnl_percent: Number(pnl.toFixed(1)),
      rarity: activePos.rarity,
      wallet_address: walletAddress || null,
    }).then(() => {});
    if (pnl >= 0) {
      setStatus('WIN');
      playWinSound();
    } else {
      setStatus('REKT');
      playRektSound();
    }
  }, [status, pnl, activePos]);

  const resetTerminal = () => {
    setStatus('IDLE');
    setActivePos(null);
    setEntryPrice(null);
    setCurrentPrice(null);
    setPnl(0);
    setCandles([]);
    candleRef.current = { ticks: [] };
    setElapsedTime(0);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const rarityStyle = activePos ? RARITY_STYLES[activePos.rarity] : RARITY_STYLES.common;

  return (
    <div className="min-h-screen bg-background grid-bg scanlines relative overflow-hidden animate-flicker">
      {/* Top bar */}
      <header className="relative z-10 border-b border-border/30 bg-muted/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐦</span>
            <span className="font-display text-sm tracking-[0.3em] text-foreground text-glow-green">PIRBGEN</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse-neon" />
              <span>BASE MAINNET</span>
            </div>
            <button className="glass-panel px-4 py-1.5 text-xs font-display tracking-wider text-foreground hover:box-glow-green transition-all duration-300 cursor-pointer">
              CONNECT WALLET
            </button>
          </div>
        </div>
      </header>

      <TickerMarquee />

      {/* Main content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {status === 'IDLE' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-8 pt-12"
            >
              <motion.img
                src={pirbMascot}
                alt="Pirb the pigeon"
                className="w-40 h-40 object-contain drop-shadow-[0_0_30px_hsl(150,100%,50%,0.3)]"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />

              <div className="text-center space-y-3">
                <h1 className="font-display text-5xl sm:text-6xl tracking-wider text-foreground text-glow-green">
                  <GlitchText>PIRBGEN</GlitchText>
                </h1>
                <p className="text-sm text-muted-foreground tracking-widest uppercase">
                  Stop analyzing. Start rolling. Fate is the ultimate alpha.
                </p>
              </div>

              <div className="glass-panel p-8 rounded-sm w-full max-w-md space-y-4">
                <button
                  onClick={generatePosition}
                  className="w-full py-4 bg-primary/10 border border-primary/40 text-foreground font-display text-lg tracking-[0.2em] hover:bg-primary/20 hover:box-glow-green transition-all duration-300 cursor-pointer active:scale-95"
                >
                  🎲 GENERATE
                </button>
                <Link to="/leaderboard" className="w-full py-3 bg-muted/30 border border-border/30 text-muted-foreground font-display text-xs tracking-[0.2em] hover:text-foreground hover:border-border/60 transition-all duration-300 cursor-pointer text-center block">
                  🏆 LEADERBOARD
                </Link>
              </div>

              <p className="text-[10px] text-muted-foreground/50 text-center max-w-sm">
                powered by pyth entropy · price feeds by pyth network · built on base
              </p>
            </motion.div>
          )}

          {status === 'GENERATING' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-6 pt-24"
            >
              <motion.img
                src={pirbMascot}
                alt="Pirb pecking"
                className="w-32 h-32 object-contain"
                animate={{ rotate: [-5, 5, -10, 8, -5], y: [0, 3, 0, 2, 0] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <div className="text-center space-y-2">
                <p className="font-display text-xl text-foreground text-glow-green tracking-wider">PIRB IS PECKING...</p>
                <p className="text-xs text-muted-foreground animate-pulse-neon">Requesting entropy from Pyth Oracle</p>
              </div>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map(i => (
                  <motion.div
                    key={i}
                    className="w-2 h-6 bg-primary/60"
                    animate={{ scaleY: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {(status === 'PLAYING' || status === 'WIN' || status === 'REKT') && activePos && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className={`space-y-6 ${status === 'REKT' ? 'animate-rekt-shake' : ''}`}
            >
              {/* Position Card */}
              <div className={`glass-panel rounded-sm border ${rarityStyle.border} overflow-hidden`}>
                <div className={`px-4 py-2 ${rarityStyle.bg} flex items-center justify-between`}>
                  <span className={`text-[10px] font-display tracking-[0.3em] ${rarityStyle.text}`}>
                    {rarityStyle.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    #{activePos.id.toString().padStart(3, '0')}
                  </span>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-3xl text-foreground text-glow-green">{activePos.ticker}</h2>
                      <p className="text-xs text-muted-foreground">{activePos.asset}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <span className={`inline-block px-3 py-1 text-xs font-display tracking-wider ${
                        activePos.direction === 'LONG'
                          ? 'bg-neon-green/10 text-neon-green border border-neon-green/30'
                          : 'bg-neon-red/10 text-neon-red border border-neon-red/30'
                      }`}>
                        {activePos.direction}
                      </span>
                      <p className={`text-2xl font-display ${rarityStyle.text}`}>{activePos.leverage}x</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-neon-red/5 border border-neon-red/20 p-3 rounded-sm">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stop Loss</p>
                      <p className="text-lg font-mono text-neon-red">{activePos.stopLoss}%</p>
                    </div>
                    <div className="bg-neon-green/5 border border-neon-green/20 p-3 rounded-sm">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Take Profit</p>
                      <p className="text-lg font-mono text-neon-green">+{activePos.takeProfit}%</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Price Feed */}
              <div className="glass-panel rounded-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse-neon" />
                    <span className="text-[10px] font-display tracking-[0.2em] text-muted-foreground">PYTH PRICE FEED</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{formatTime(elapsedTime)}</span>
                </div>

                <div className="text-center py-4">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Current Price</p>
                  <p className={`font-mono text-4xl sm:text-5xl ${pnl >= 0 ? 'text-neon-green text-glow-green' : 'text-neon-red text-glow-red'}`}>
                    ${currentPrice?.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Entry: ${entryPrice?.toFixed(2)}
                  </p>
                </div>

                {/* Price Chart */}
                {entryPrice && (
                  <div className="border border-border/20 rounded-sm overflow-hidden bg-muted/10">
                    <PriceChart candles={candles} entryPrice={entryPrice} positive={pnl >= 0} direction={activePos.direction} stopLoss={activePos.stopLoss} takeProfit={activePos.takeProfit} leverage={activePos.leverage} />
                  </div>
                )}

                {/* PnL Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">PnL</span>
                    <span className={`font-mono font-bold ${pnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-3 bg-muted/20 rounded-full overflow-hidden relative border border-border/20">
                    {/* Center line */}
                    <div className="absolute left-1/2 top-0 w-0.5 h-full bg-muted-foreground/40 z-10 -translate-x-1/2" />
                    {/* PnL fill from center */}
                    {pnl !== 0 && (
                      <motion.div
                        className={`absolute top-0 h-full ${pnl >= 0 ? 'bg-neon-green' : 'bg-neon-red'} rounded-full`}
                        style={{
                          width: `${Math.min(Math.abs(pnl) / (pnl >= 0 ? activePos.takeProfit : Math.abs(activePos.stopLoss)) * 50, 50)}%`,
                          left: pnl >= 0 ? '50%' : undefined,
                          right: pnl < 0 ? '50%' : undefined,
                        }}
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className="text-neon-red">{activePos.stopLoss}%</span>
                    <span className="text-neon-green">+{activePos.takeProfit}%</span>
                  </div>
                </div>

                {/* Status */}
                {status === 'PLAYING' && (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-neon-amber animate-pulse-neon" />
                      <span className="text-xs text-neon-amber font-display tracking-wider">AWAITING RESOLUTION...</span>
                    </div>
                    <button
                      onClick={exitEarly}
                      className="w-full py-2.5 bg-secondary/10 border border-secondary/40 text-secondary font-display text-xs tracking-[0.2em] hover:bg-secondary/20 hover:shadow-[0_0_15px_hsl(var(--secondary)/0.3)] transition-all duration-300 cursor-pointer active:scale-95"
                    >
                      ⚡ CLOSE POSITION
                    </button>
                  </div>
                )}

                {status === 'WIN' && (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center py-4 space-y-2"
                  >
                    <p className="font-display text-3xl text-neon-green text-glow-green tracking-wider">🎯 TARGET HIT!</p>
                    <p className="text-neon-green text-sm font-mono">+{pnl.toFixed(2)}% PROFIT</p>
                  </motion.div>
                )}

                {status === 'REKT' && (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center py-4 space-y-2"
                  >
                    <p className="font-display text-3xl text-neon-red text-glow-red tracking-wider">💀 LIQUIDATED</p>
                    <p className="text-neon-red text-sm font-mono">{pnl.toFixed(2)}% — REKT</p>
                  </motion.div>
                )}

                {(status === 'WIN' || status === 'REKT') && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 mt-2"
                  >
                    <button
                      onClick={generatePosition}
                      className="flex-1 py-3 bg-primary/10 border border-primary/40 text-foreground font-display text-sm tracking-[0.2em] hover:bg-primary/20 hover:box-glow-green transition-all duration-300 cursor-pointer active:scale-95"
                    >
                      🎲 ROLL AGAIN
                    </button>
                    <button
                      onClick={resetTerminal}
                      className="flex-1 py-3 bg-muted/30 border border-border/30 text-muted-foreground font-display text-sm tracking-[0.2em] hover:text-foreground hover:border-border/60 transition-all duration-300 cursor-pointer active:scale-95"
                    >
                      🏠 HOME
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom info */}
      <footer className="fixed bottom-0 inset-x-0 z-10 border-t border-border/20 bg-muted/10 backdrop-blur-sm py-2 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-[10px] text-muted-foreground/50">
          <span>PIRBGEN v0.1.0-alpha</span>
          <span>ENTROPY: PYTH NETWORK</span>
          <span className="hidden sm:inline">CHAIN: BASE L2</span>
        </div>
      </footer>
    </div>
  );
}
