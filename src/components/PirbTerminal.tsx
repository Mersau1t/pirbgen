import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import pirbMascot from '@/assets/pirb-mascot.png';
import { playGenerateClick, playCoinSound, startBgMusic, stopBgMusic, isBgMusicPlaying } from '@/lib/sounds';
import { type Candle } from '@/components/PriceChart';
import { pickVolatileFeed, fetchHistoricalCandles, fetchPythPriceById, getTopVolatileTokens, fetchAllPythFeeds } from '@/lib/pyth';
import { SOLO_TOKENS, pickSoloToken } from '@/lib/soloTokens';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/contexts/WalletContext';
import { getAvatarEmoji } from '@/pages/Profile';
import LiveTradePanel from '@/components/LiveTradePanel';
import StreakBadge from '@/components/StreakBadge';

import { getStreak, recordWin, recordLoss, getStreakMultiplier, type StreakData } from '@/lib/streaks';
import { hasDoneDaily, markDailyDone, getDailyParams } from '@/lib/dailyChallenge';

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

// --- RARITY CONFIG ---
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
  rare: { border: 'border-neon-green/50', text: 'text-neon-green', bg: 'bg-neon-green/10', label: 'RARE' },
  legendary: { border: 'border-neon-orange/50', text: 'text-neon-orange', bg: 'bg-neon-orange/10', label: 'LEGENDARY' },
  degen: { border: 'border-neon-purple/50', text: 'text-neon-purple', bg: 'bg-neon-purple/10', label: '☠ DEGEN ☠' },
};
function formatVolume(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}


const MARQUEE_LINES = [
  "PIRB: ur gonna get rekt so hard 💀",
  "PIRB: *aggressively poops on ur portfolio* 💩",
  "PIRB: ngmi energy detected fr fr 📡",
  "PIRB: this is called getting PIRBED bestie",
  "PIRB: ur the exit liquidity no cap",
  "PIRB: wen lambo? never for u kek 😂",
  "PIRB: cope harder anon",
  "PIRB: skill issue tbh",
  "PIRB: *PIRB pecks ur liquidation button*",
  "PIRB: ratio + L + PIRBED",
  "PIRB: touch grass after this L",
  "PIRB: sheeeesh that entry was mid",
  "PIRB: imagine fumbling this bag 😭",
  "PIRB: not even ur mom would long this",
  "PIRB: bro think he's a trader 💀💀💀",
  "PIRB: HFSP — have fun staying PIRBED",
  "PIRB: plot twist: u were the liquidity all along",
  "PIRB: *PIRB steals ur stop loss*",
  "PIRB: another degen down bad",
  "PIRB: enjoy being poor, anon",
  "PIRB: that candle is redder than ur face rn",
  "PIRB: *PIRB flies away with ur money*",
  "PIRB: ur portfolio called... it's crying fr",
  "PIRB: just close it bro. save urself",
  "PIRB: bro really thought he was built different",
  "PIRB: lmao u really went in? 💀",
  "PIRB: my nft trades better than u",
  "PIRB: rent free in PIRB's head now",
  "PIRB: get ratioed + PIRBED",
  "PIRB: ur down bad and it's beautiful",
  "PIRB: *aggressive cooing intensifies*",
  "PIRB: ur a degenerate and PIRB respects it... kinda",
  "PIRB: this is fine. ur fine. ur not fine.",
  "PIRB: certified W for PIRB, L for u",
  "PIRB: *PIRB counts ur liquidations like bread crumbs*",
  "PIRB: that leverage is not it chief",
  "PIRB: u can't be serious rn 💀",
  "PIRB: anon discovered the worst entry 🔍",
  "PIRB: sir this is a Wendy's not a trading desk",
  "PIRB: imagine not taking profit lmaooo",
  "PIRB: PIRB has seen better trades in a kindergarten",
  "PIRB: no thoughts, head empty, only loss",
  "PIRB: broooo 💀💀",
  "PIRB: PvE but the E is ur own bad decisions",
  "PIRB: it do be like that sometimes... for u",
  "PIRB: it's giving rekt energy",
  "PIRB: iykyk but u clearly don't",
  "PIRB: based on the vibes? ded account incoming",
  "PIRB: ur conviction is almost impressive. almost.",
  "PIRB: *PIRB documents ur demise for the archives* 📂",
];

const TickerMarquee = () => {
  const doubled = [...MARQUEE_LINES, ...MARQUEE_LINES];
  return (
    <div className="overflow-hidden border-b-2 border-neon-purple/30 bg-background/80 py-1.5">
      <div className="animate-marquee flex whitespace-nowrap gap-10 text-[10px] font-display">
        {doubled.map((t, i) => (
          <span key={i} className={i % 2 === 0 ? 'text-neon-orange text-glow-orange' : 'text-neon-purple'}>
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
    <span className="absolute inset-0 text-neon-purple/50 animate-glitch z-0" aria-hidden>{children}</span>
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
  const [streak, setStreak] = useState<StreakData>(getStreak());
  const [dailyDone, setDailyDone] = useState(hasDoneDaily());
  const [isDaily, setIsDaily] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<number | undefined>(undefined);

  const toggleMusic = () => {
    if (isBgMusicPlaying()) {
      stopBgMusic();
      setMusicOn(false);
    } else {
      startBgMusic();
      setMusicOn(true);
    }
  };

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

  interface DisplayToken { feed_id: string; ticker: string; pair: string; price: number; volume_24h: number }
  const [topVolatile, setTopVolatile] = useState<DisplayToken[]>([]);
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [allVolatile, setAllVolatile] = useState<DisplayToken[]>([]);
  
  useEffect(() => {
    // Use the hardcoded 20 solo tokens
    const mapped: DisplayToken[] = SOLO_TOKENS.map(t => ({
      feed_id: t.feedId,
      ticker: t.ticker,
      pair: t.pair,
      price: 0,
      volume_24h: 0,
    }));
    setAllVolatile(mapped);
    setTopVolatile(mapped.slice(0, 8));
  }, []);

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

  const buildHistoricalCandles = async (feedId: string, _price: number) => {
    let historyCandles: Candle[] = [];
    
    // Try with different intervals if first attempt yields too few candles
    const attempts = [
      { count: 10, interval: 5 },   // 10 candles, 5s apart
      { count: 15, interval: 3 },   // 15 candles, 3s apart (more recent data)
      { count: 20, interval: 2 },   // 20 candles, 2s apart
    ];
    
    for (const { count, interval } of attempts) {
      try {
        historyCandles = await fetchHistoricalCandles(feedId, count, interval);
        if (historyCandles.length >= 3) break;
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    }

    // If still no data, return empty — chart will start from entry point only
    if (historyCandles.length < 1) {
      console.warn('No Pyth historical data available for', feedId);
    }
    
    return historyCandles;
  };

  const generatePosition = useCallback(async (specificFeed?: { id: string; ticker: string; pair: string }) => {
    playGenerateClick();
    setStatus('GENERATING');
    setIsDaily(false);
    setTimerSeconds(undefined);

    let feed: { id: string; ticker: string; pair: string };
    let price: number;

    if (specificFeed) {
      const livePrice = await fetchPythPriceById(specificFeed.id);
      if (!livePrice) { setStatus('IDLE'); return; }
      feed = specificFeed;
      price = livePrice;
    } else {
      const token = pickSoloToken();
      const livePrice = await fetchPythPriceById(token.feedId);
      if (!livePrice) { setStatus('IDLE'); return; }
      feed = { id: token.feedId, ticker: token.ticker, pair: token.pair };
      price = livePrice;
    }

    const rarity = pickRarity();
    const direction: TradeDirection = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    const leverage = randInt(rarity.leverageRange[0], rarity.leverageRange[1]);
    const sl = randInt(rarity.slRange[0], rarity.slRange[1]);
    const rr = randInt(rarity.rrRange[0], rarity.rrRange[1]);

    const pos: DegenPosition = {
      id: Date.now(),
      asset: feed.ticker,
      ticker: feed.ticker,
      feedId: feed.id,
      direction,
      leverage,
      stopLoss: -sl,
      takeProfit: sl * rr,
      rarity: rarity.rarity,
    };

    const historyCandles = await buildHistoricalCandles(feed.id, price);
    setActivePos(pos);
    setEntryPrice(price);
    setInitialCandles(historyCandles);
    setFinalPnl(0);
    setStatus('PLAYING');
  }, []);

  const generateDaily = useCallback(async () => {
    if (allVolatile.length === 0) return;
    playGenerateClick();
    setStatus('GENERATING');
    setIsDaily(true);

    const { feedIndex, params } = getDailyParams(allVolatile.length);
    const token = allVolatile[feedIndex % allVolatile.length];

    const livePrice = await fetchPythPriceById(token.feed_id);
    if (!livePrice) { setStatus('IDLE'); return; }

    const pos: DegenPosition = {
      id: Date.now(),
      asset: token.ticker,
      ticker: token.ticker,
      feedId: token.feed_id,
      direction: params.direction,
      leverage: params.leverage,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      rarity: params.rarity,
    };

    const historyCandles = await buildHistoricalCandles(token.feed_id, livePrice);
    setActivePos(pos);
    setEntryPrice(livePrice);
    setInitialCandles(historyCandles);
    setTimerSeconds(params.timerSeconds);
    setFinalPnl(0);
    setStatus('PLAYING');
  }, [allVolatile]);

  const handleTradeResult = useCallback((result: 'WIN' | 'REKT', pnl: number) => {
    setFinalPnl(pnl);
    if (result === 'WIN') setStreak(recordWin());
    else setStreak(recordLoss());
    if (isDaily) markDailyDone();
    setDailyDone(hasDoneDaily());
    // Delay switching to result screen so user sees the chart hit TP/SL
    setTimeout(() => setStatus(result), 3000);
  }, [isDaily]);

  const handleExitEarly = useCallback((pnl: number) => {
    setFinalPnl(pnl);
    const r = pnl >= 0 ? 'WIN' : 'REKT';
    if (r === 'WIN') setStreak(recordWin());
    else setStreak(recordLoss());
    if (isDaily) markDailyDone();
    setDailyDone(hasDoneDaily());
    // Manual close — show result immediately
    setStatus(r);
  }, [isDaily]);

  const resetTerminal = () => {
    setStatus('IDLE');
    setActivePos(null);
    setEntryPrice(null);
    setInitialCandles([]);
    setFinalPnl(0);
    setIsDaily(false);
    setTimerSeconds(undefined);
  };

  const rarityStyle = activePos ? RARITY_STYLES[activePos.rarity] : RARITY_STYLES.common;

  return (
    <div className="h-screen bg-background grid-bg scanlines crt-vignette relative overflow-hidden animate-flicker flex flex-col">
      {/* Particles on IDLE */}
      {status === 'IDLE' && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
          {particles.map((p, i) => (
            <div key={i} className="absolute animate-star-fall" style={{
              left: `${p.left}%`, top: '-20px', fontSize: `${p.size}px`, opacity: p.opacity,
              animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
              filter: `drop-shadow(0 0 4px hsl(var(--neon-purple) / 0.5))`,
            }}>💩</div>
          ))}
        </div>
      )}

      {/* Top bar */}
      <header className="relative z-10 border-b-2 border-neon-purple/40 bg-background/90">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕹️</span>
            <span className="font-display text-[10px] sm:text-xs tracking-[0.3em] text-neon-purple text-glow-purple">PIRBGEN</span>
            <button onClick={toggleMusic} className="text-lg opacity-70 hover:opacity-100 transition-opacity" title={musicOn ? 'Mute music' : 'Play music'}>
              {musicOn ? '🔊' : '🔇'}
            </button>
            <StreakBadge streak={streak} />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-display text-neon-green">
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
                <button onClick={() => generatePosition()} className="arcade-btn arcade-btn-primary w-full text-sm sm:text-base py-3">
                  🎲 GENERATE
                </button>
                
                {/* Daily Challenge */}
                <button
                  onClick={() => generateDaily()}
                  disabled={dailyDone || allVolatile.length === 0}
                  className={`arcade-btn w-full text-[10px] py-3 ${dailyDone ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.1)' }}
                >
                  {dailyDone ? '✅ DAILY DONE' : '📅 DAILY CHALLENGE (90s)'}
                </button>

                <Link to="/duel" onClick={() => playCoinSound()} className="arcade-btn w-full text-[10px] py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-purple))', color: 'hsl(var(--neon-purple))', background: 'hsl(var(--neon-purple) / 0.1)' }}>
                  ⚔️ PVP DUEL (1v1)
                </Link>

                <Link to="/leaderboard" onClick={() => playCoinSound()} className="arcade-btn arcade-btn-secondary w-full text-[10px] py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(25 95% 53% / 0.1)' }}>
                  🏆 LEADERBOARD
                </Link>
                {walletAddress && (
                  <Link to="/profile" onClick={() => playCoinSound()} className="arcade-btn w-full text-[10px] py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)', boxShadow: 'var(--glow-green)' }}>
                    👤 PROFILE
                  </Link>
                )}
              </div>

              {/* Top Volume tokens */}
              {topVolatile.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="w-full max-w-md">
                  <div className="pixel-border bg-background/80 p-3 max-h-[280px] overflow-y-auto">
                    <p className="font-display text-[9px] text-neon-green tracking-wider mb-2 text-center">📊 TOP VOLUME · TAP TO TRADE</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(showAllTokens ? allVolatile : topVolatile).map((t, i) => (
                        <motion.button
                          key={t.feed_id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(0.4 + i * 0.04, 1) }}
                          onClick={() => generatePosition({ id: t.feed_id, ticker: t.ticker, pair: t.pair })}
                          className="flex items-center justify-between px-2 py-1.5 rounded bg-neon-purple/5 border border-neon-purple/10 hover:bg-neon-purple/15 hover:border-neon-purple/30 transition-colors cursor-pointer text-left"
                        >
                          <span className="font-display text-[10px] text-foreground/80 tracking-wider">{t.ticker}</span>
                          <span className="font-display text-[9px] tracking-wider text-neon-green/70">
                            {t.volume_24h > 0 ? formatVolume(t.volume_24h) : '—'}
                          </span>
                        </motion.button>
                      ))}
                    </div>
                    {allVolatile.length > 8 && (
                      <button onClick={() => setShowAllTokens(!showAllTokens)} className="w-full mt-2 font-display text-[8px] text-neon-green/60 hover:text-neon-green tracking-wider transition-colors">
                        {showAllTokens ? '▲ SHOW LESS' : `▼ SHOW ALL ${allVolatile.length} TOKENS`}
                      </button>
                    )}
                    <p className="font-display text-[7px] text-muted-foreground/30 text-center mt-1.5 tracking-wider">24H VOLUME · TAP ANY TOKEN</p>
                  </div>
                </motion.div>
              )}

              <div className="flex items-center gap-2 text-[8px] font-display text-muted-foreground/40">
                <span className="text-neon-purple/40">●</span>
                <span>PYTH ENTROPY</span>
                <span className="text-neon-orange/40">●</span>
                <span>PYTH NETWORK</span>
                <span className="text-neon-green/40">●</span>
                <span>BASE L2</span>
              </div>
            </motion.div>
          )}

          {status === 'GENERATING' && (
            <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center gap-6 flex-1">
              <motion.img src={pirbMascot} alt="Pirb pecking" className="w-32 h-32 object-contain drop-shadow-[0_0_30px_hsl(265,66%,55%,0.4)]"
                animate={{ rotate: [-5, 5, -10, 8, -5], y: [0, 3, 0, 2, 0] }} transition={{ duration: 0.6, repeat: Infinity }} />
              <div className="text-center space-y-3">
                <p className="font-display text-sm sm:text-lg text-neon-purple text-glow-purple tracking-wider">
                  {isDaily ? 'DAILY CHALLENGE LOADING...' : 'PIRB IS PECKING...'}
                </p>
                <p className="font-display text-[8px] text-neon-orange animate-blink tracking-widest">REQUESTING ENTROPY</p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map(i => (
                  <motion.div key={i} className="w-3 h-8 bg-neon-purple" animate={{ scaleY: [0.3, 1, 0.3] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }} />
                ))}
              </div>
            </motion.div>
          )}

          {(status === 'PLAYING' || status === 'WIN' || status === 'REKT') && activePos && entryPrice && (
            <motion.div key="playing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col flex-1 min-h-0">
              {status === 'PLAYING' ? (
                <LiveTradePanel
                  position={activePos}
                  entryPrice={entryPrice}
                  initialCandles={initialCandles}
                  onResult={handleTradeResult}
                  onExitEarly={handleExitEarly}
                  playerName={profile?.display_name || 'Anonymous'}
                  walletAddress={walletAddress || null}
                  timerSeconds={timerSeconds}
                />
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 gap-4 overflow-hidden">
                  <motion.div
                    initial={{ x: status === 'WIN' ? 300 : -300, opacity: 0, rotate: status === 'WIN' ? 15 : -15 }}
                    animate={{ x: 0, opacity: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 0.2 }}
                    className="relative"
                  >
                    <motion.img src={pirbMascot} alt="Pirb"
                      className="w-28 h-28 sm:w-36 sm:h-36 object-contain"
                      style={{
                        filter: status === 'WIN'
                          ? 'drop-shadow(0 0 20px #07e46e) drop-shadow(0 0 40px #07e46eaa)'
                          : 'drop-shadow(0 0 20px #f97316) drop-shadow(0 0 40px #f9731688)',
                        transform: status === 'REKT' ? 'scaleX(-1)' : undefined,
                      }}
                      animate={status === 'WIN'
                        ? { y: [0, -8, 0], rotate: [0, -5, 3, -2, 0] }
                        : { y: [0, 2, 0], rotate: [0, -3, 5, -8, 3, 0], scale: [1, 1.05, 1, 1.08, 1] }
                      }
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.7, type: 'spring', stiffness: 200 }}
                      className={`absolute -top-2 ${status === 'WIN' ? '-right-4' : '-left-4'} pixel-border px-3 py-1.5 text-[9px] sm:text-[11px] font-display tracking-wider whitespace-nowrap ${
                        status === 'WIN'
                          ? 'bg-neon-green/10 border-neon-green/40 text-neon-green'
                          : 'bg-neon-orange/10 border-neon-orange/40 text-neon-orange'
                      }`}
                    >
                      {status === 'WIN'
                        ? ['😏 LUCKY...', '🍀 JUST LUCK BRO', '😒 WHATEVER...', '🥱 EZ TRADE'][Math.floor(Math.random() * 4)]
                        : ['😡 REKT NOOB!', '🔥 GET REKT!', '💀 SKILL ISSUE', '😈 NGMI'][Math.floor(Math.random() * 4)]
                      }
                    </motion.div>
                  </motion.div>

                  {/* Streak display on result */}
                  {streak.current > 0 && status === 'WIN' && (
                    <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
                      <StreakBadge streak={streak} />
                    </motion.div>
                  )}

                  <div className="text-center">
                    <p className={`font-display text-3xl sm:text-4xl ${status === 'WIN' ? 'text-neon-green text-glow-green animate-rainbow' : 'text-neon-orange text-glow-orange'}`}>
                      {status === 'WIN' ? '🎯 TARGET HIT!' : '💀 PIRBED!'}
                    </p>
                    <p className={`font-mono text-4xl sm:text-5xl font-bold mt-1 ${status === 'WIN' ? 'text-neon-green' : 'text-neon-orange'}`}>
                      {finalPnl >= 0 ? '+' : ''}{finalPnl.toFixed(2)}%
                    </p>
                  </div>

                  {/* Streak multiplier note */}
                  {streak.current > 1 && status === 'WIN' && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="font-display text-[10px] text-neon-orange tracking-wider">
                      🔥 STREAK BONUS: ×{getStreakMultiplier(streak.current).toFixed(1)}
                    </motion.p>
                  )}

                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="flex gap-3">
                    <button onClick={() => generatePosition()} className="arcade-btn arcade-btn-primary text-[10px] py-2.5 px-6">
                      🎲 ROLL AGAIN
                    </button>
                    <button onClick={() => { playCoinSound(); resetTerminal(); }}
                      className="arcade-btn text-[10px] py-2.5 px-6" style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.1)', boxShadow: 'var(--glow-orange)' }}>
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
