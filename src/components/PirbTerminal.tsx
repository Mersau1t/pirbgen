import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import pirbMascot from '@/assets/pirb-mascot.png';
import { playGenerateClick, playCoinSound, startBgMusic, stopBgMusic, isBgMusicPlaying } from '@/lib/sounds';
import { type Candle } from '@/components/PriceChart';
import { pickVolatileFeed, fetchHistoricalCandles } from '@/lib/pyth';
import { useWallet } from '@/contexts/WalletContext';
import { getAvatarEmoji } from '@/pages/Profile';
import LiveTradePanel from '@/components/LiveTradePanel';

// --- TYPES ---
type TradeDirection = 'LONG' | 'SHORT';
type GameStatus = 'IDLE' | 'GENERATING' | 'PLAYING' | 'WIN' | 'REKT';

interface DegenPosition {
  id: number;
  asset: string;
  ticker: string;
  feedId: string;
  direction: TradeDirection;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  rarity: 'common' | 'rare' | 'legendary' | 'degen';
}

// --- RARITY CONFIG (determines leverage/risk) ---
// Risk:Reward ratio from 1:2 to 1:20 (SL always smaller than TP)
const RARITY_CONFIG = [
  { rarity: 'common' as const, weight: 40, leverageRange: [20, 50], slRange: [5, 10], rrRange: [2, 4] },
  { rarity: 'rare' as const, weight: 30, leverageRange: [50, 100], slRange: [5, 8], rrRange: [3, 8] },
  { rarity: 'legendary' as const, weight: 20, leverageRange: [100, 150], slRange: [4, 7], rrRange: [5, 12] },
  { rarity: 'degen' as const, weight: 10, leverageRange: [150, 200], slRange: [3, 6], rrRange: [8, 20] },
];

function pickRarity() {
  const total = RARITY_CONFIG.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RARITY_CONFIG) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return RARITY_CONFIG[0];
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const RARITY_STYLES: Record<string, { border: string; text: string; bg: string; label: string }> = {
  common: { border: 'border-muted-foreground/30', text: 'text-muted-foreground', bg: 'bg-muted/20', label: 'COMMON' },
  rare: { border: 'border-neon-cyan/50', text: 'text-neon-cyan', bg: 'bg-neon-cyan/10', label: 'RARE' },
  legendary: { border: 'border-neon-amber/50', text: 'text-neon-amber', bg: 'bg-neon-amber/10', label: 'LEGENDARY' },
  degen: { border: 'border-neon-magenta/50', text: 'text-neon-magenta', bg: 'bg-neon-magenta/10', label: '☠ DEGEN ☠' },
};

const TickerMarquee = () => {
  const tickers = ['PYTH LIVE FEEDS 🔴', '500+ CRYPTO PAIRS', 'VOLATILITY WEIGHTED 📊', 'ANY TOKEN ANY TIME', 'POWERED BY PYTH NETWORK ⚡'];
  const doubled = [...tickers, ...tickers];
  return (
    <div className="overflow-hidden border-b-2 border-neon-purple/30 bg-background/80 py-1.5">
      <div className="animate-marquee flex whitespace-nowrap gap-10 text-[10px] font-display">
        {doubled.map((t, i) => (
          <span key={i} className={t.includes('PYTH') ? 'text-neon-purple text-glow-purple' : 'text-neon-green text-glow-green'}>
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
  const [initialCandles, setInitialCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<GameStatus>('IDLE');
  const [finalPnl, setFinalPnl] = useState(0);
  const [musicOn, setMusicOn] = useState(false);

  const toggleMusic = () => {
    if (isBgMusicPlaying()) {
      stopBgMusic();
      setMusicOn(false);
    } else {
      startBgMusic();
      setMusicOn(true);
    }
  };

  // Stop music when leaving IDLE
  useEffect(() => {
    if (status !== 'IDLE' && isBgMusicPlaying()) {
      stopBgMusic();
      setMusicOn(false);
    }
  }, [status]);

  const [particles] = useState(() =>
    Array.from({ length: 25 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 15,
      duration: 10 + Math.random() * 15,
      size: 12 + Math.random() * 14,
      opacity: 0.4 + Math.random() * 0.4,
    }))
  );

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem('pirbgenSession');
    if (saved) {
      const { pos, price, savedStatus } = JSON.parse(saved);
      if (savedStatus === 'PLAYING') {
        setActivePos(pos);
        setEntryPrice(price);
        setStatus('PLAYING');
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

  const generatePosition = useCallback(async () => {
    playGenerateClick();
    setStatus('GENERATING');

    // Pick a volatile feed from all Pyth crypto feeds
    const picked = await pickVolatileFeed();
    if (!picked) {
      console.error('Could not pick a Pyth feed');
      setStatus('IDLE');
      return;
    }

    const { feed, price } = picked;
    const rarity = pickRarity();
    const direction: TradeDirection = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    const leverage = randInt(rarity.leverageRange[0], rarity.leverageRange[1]);
    const stopLoss = randInt(rarity.slRange[0], rarity.slRange[1]);
    const takeProfit = randInt(rarity.tpRange[0], rarity.tpRange[1]);

    const pos: DegenPosition = {
      id: Date.now(),
      asset: feed.ticker,
      ticker: feed.ticker,
      feedId: feed.id,
      direction,
      leverage,
      stopLoss,
      takeProfit,
      rarity: rarity.rarity,
    };

    // Fetch real historical candles from Pyth Benchmarks
    let historyCandles: Candle[] = [];
    try {
      historyCandles = await fetchHistoricalCandles(picked.feed.id, 10, 5);
    } catch (err) {
      console.error('Failed to load history, using fallback:', err);
    }
    
    // Fallback to synthetic candles if API fails
    if (historyCandles.length < 3) {
      const histCount = 8;
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
        rawCandles.unshift({ open, high: Math.max(...ticks), low: Math.min(...ticks), close });
      }
      historyCandles = rawCandles.map((c, i) => ({ ...c, time: -(histCount - i) * 2 }));
    }

    setActivePos(pos);
    setEntryPrice(price);
    setInitialCandles(historyCandles);
    setFinalPnl(0);
    setStatus('PLAYING');
  }, []);

  const handleTradeResult = useCallback((result: 'WIN' | 'REKT', pnl: number) => {
    setFinalPnl(pnl);
    setStatus(result);
  }, []);

  const handleExitEarly = useCallback((pnl: number) => {
    setFinalPnl(pnl);
    setStatus(pnl >= 0 ? 'WIN' : 'REKT');
  }, []);

  const resetTerminal = () => {
    setStatus('IDLE');
    setActivePos(null);
    setEntryPrice(null);
    setInitialCandles([]);
    setFinalPnl(0);
  };

  const rarityStyle = activePos ? RARITY_STYLES[activePos.rarity] : RARITY_STYLES.common;

  return (
    <div className="h-screen bg-background grid-bg scanlines crt-vignette relative overflow-hidden animate-flicker flex flex-col">
      {/* Pigeon poop particles — only on IDLE */}
      {status === 'IDLE' && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
          {particles.map((p, i) => (
            <div
              key={i}
              className="absolute animate-star-fall"
              style={{
                left: `${p.left}%`,
                top: '-20px',
                fontSize: `${p.size}px`,
                opacity: p.opacity,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
                filter: `drop-shadow(0 0 4px hsl(var(--neon-purple) / 0.5))`,
              }}
            >
              💩
            </div>
          ))}
        </div>
      )}
      {/* Top bar */}
      <header className="relative z-10 border-b-2 border-neon-purple/40 bg-background/90">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕹️</span>
            <span className="font-display text-[10px] sm:text-xs tracking-[0.3em] text-neon-purple text-glow-purple">PIRBGEN</span>
            <button
              onClick={toggleMusic}
              className="text-lg opacity-70 hover:opacity-100 transition-opacity"
              title={musicOn ? 'Mute music' : 'Play music'}
            >
              {musicOn ? '🔊' : '🔇'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-display text-neon-cyan">
              <span className="w-2 h-2 bg-neon-purple animate-blink" />
              <span>BASE</span>
            </div>
            {walletAddress && profile ? (
              <button
                onClick={() => { playCoinSound(); navigate('/profile'); }}
                className="arcade-btn text-[8px] sm:text-[10px] py-2 px-3 flex items-center gap-2" style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)', boxShadow: 'var(--glow-green)' }}
              >
                <span>{getAvatarEmoji(profile.avatar)}</span>
                <span>{profile.display_name}</span>
              </button>
            ) : (
              <button
                onClick={() => { playCoinSound(); connectWallet(); }}
                disabled={isConnecting}
                className="arcade-btn arcade-btn-primary text-[8px] sm:text-[10px] py-2 px-3 disabled:opacity-50"
              >
                {isConnecting ? '⏳ CONNECTING...' : '🔗 CONNECT'}
              </button>
            )}
          </div>
        </div>
      </header>

      <TickerMarquee />

      {/* Main content */}
      <main className={`relative z-10 mx-auto px-4 py-2 flex-1 min-h-0 overflow-hidden flex flex-col ${(status === 'PLAYING' || status === 'WIN' || status === 'REKT') ? 'max-w-7xl' : 'max-w-4xl'}`}>
        <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait">
          {status === 'IDLE' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center gap-4 flex-1"
            >
              <motion.img
                src={pirbMascot}
                alt="Pirb the pigeon"
                className="w-24 h-24 sm:w-32 sm:h-32 object-contain drop-shadow-[0_0_40px_hsl(265,66%,55%,0.4)]"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />

              <div className="text-center space-y-2">
                <h1 className="font-display text-3xl sm:text-5xl tracking-wider text-neon-purple text-glow-purple">
                  <GlitchText>PIRBGEN</GlitchText>
                </h1>
                <p className="font-display text-[8px] sm:text-[10px] text-neon-orange text-glow-orange tracking-[0.2em]">
                  INSERT COIN TO PLAY
                </p>
              </div>

              <div className="pixel-border p-4 sm:p-6 w-full max-w-md space-y-3 bg-background/90">
                <button
                  onClick={generatePosition}
                  className="arcade-btn arcade-btn-primary w-full text-sm sm:text-base py-3"
                >
                  🎲 GENERATE
                </button>
                <Link to="/leaderboard" onClick={() => playCoinSound()} className="arcade-btn arcade-btn-secondary w-full text-[10px] py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(25 95% 53% / 0.1)' }}>
                  🏆 LEADERBOARD
                </Link>
                {walletAddress && (
                  <Link to="/profile" onClick={() => playCoinSound()} className="arcade-btn w-full text-[10px] py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)', boxShadow: 'var(--glow-green)' }}>
                    👤 PROFILE
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2 text-[8px] font-display text-muted-foreground/40">
                <span className="text-neon-purple/40">●</span>
                <span>PYTH ENTROPY</span>
                <span className="text-neon-orange/40">●</span>
                <span>PYTH NETWORK</span>
                <span className="text-neon-cyan/40">●</span>
                <span>BASE L2</span>
              </div>
            </motion.div>
          )}

          {status === 'GENERATING' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-6 flex-1"
            >
              <motion.img
                src={pirbMascot}
                alt="Pirb pecking"
                className="w-32 h-32 object-contain drop-shadow-[0_0_30px_hsl(265,66%,55%,0.4)]"
                animate={{ rotate: [-5, 5, -10, 8, -5], y: [0, 3, 0, 2, 0] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <div className="text-center space-y-3">
                <p className="font-display text-sm sm:text-lg text-neon-purple text-glow-purple tracking-wider">PIRB IS PECKING...</p>
                <p className="font-display text-[8px] text-neon-orange animate-blink tracking-widest">REQUESTING ENTROPY</p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map(i => (
                  <motion.div
                    key={i}
                    className="w-3 h-8 bg-neon-purple"
                    animate={{ scaleY: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {(status === 'PLAYING' || status === 'WIN' || status === 'REKT') && activePos && entryPrice && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col flex-1 min-h-0"
            >
              {status === 'PLAYING' ? (
                <LiveTradePanel
                  position={activePos}
                  entryPrice={entryPrice}
                  initialCandles={initialCandles}
                  onResult={handleTradeResult}
                  onExitEarly={handleExitEarly}
                  playerName={profile?.display_name || 'Anonymous'}
                  walletAddress={walletAddress || null}
                />
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 gap-4">
                  <p className={`font-display text-2xl ${status === 'WIN' ? 'text-neon-green text-glow-green animate-rainbow' : 'text-neon-red text-glow-red'}`}>
                    {status === 'WIN' ? `🎯 TARGET HIT! +${finalPnl.toFixed(2)}%` : `💀 LIQUIDATED ${finalPnl.toFixed(2)}%`}
                  </p>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3"
                  >
                    <button onClick={generatePosition} className="arcade-btn arcade-btn-primary text-[10px] py-2.5 px-6">
                      🎲 ROLL AGAIN
                    </button>
                    <button
                      onClick={() => { playCoinSound(); resetTerminal(); }}
                      className="arcade-btn text-[10px] py-2.5 px-6" style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.1)', boxShadow: 'var(--glow-orange)' }}
                    >
                      🏠 HOME
                    </button>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>

      {/* Bottom info */}
      <footer className="relative z-10 border-t-2 border-neon-purple/20 bg-background/90 py-2 px-4 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-[8px] font-display text-muted-foreground/40 tracking-wider">
          <span>PIRBGEN v0.1</span>
          <span className="text-neon-purple/30 animate-pulse-neon">● LIVE</span>
          <span className="hidden sm:inline">BASE L2</span>
        </div>
      </footer>
    </div>
  );
}
