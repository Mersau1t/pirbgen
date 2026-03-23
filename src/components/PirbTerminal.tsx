import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { getMascot } from '@/lib/mascots';
import { playGenerateClick, playCoinSound, startBgMusic, stopBgMusic, isBgMusicPlaying } from '@/lib/sounds';
import { type Candle } from '@/components/PriceChart';
import { pickVolatileFeed, fetchHistoricalCandles, fetchPythPriceById, getTopVolatileTokens, fetchAllPythFeeds } from '@/lib/pyth';
import { SOLO_TOKENS, pickSoloToken } from '@/lib/soloTokens';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/contexts/WalletContext';
import { getAvatarEmoji } from '@/pages/Profile';
import LiveTradePanel from '@/components/LiveTradePanel';
import StreakBadge from '@/components/StreakBadge';
import pythoilBarrel from '@/assets/pythoil-barrel.png';

import { getStreak, recordWin, recordLoss, getStreakMultiplier, type StreakData } from '@/lib/streaks';
import { hasDoneDaily, markDailyDone, getDailyParams } from '@/lib/dailyChallenge';
import { useEntropy, derivePosition, type EntropySeed } from '@/hooks/useEntropy';

// --- TYPES ---
type TradeDirection = 'LONG' | 'SHORT';
type GameStatus = 'IDLE' | 'GENERATING' | 'PREVIEW' | 'PLAYING' | 'WIN' | 'REKT';

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

const MarqueeStrip = ({ ariaHidden }: { ariaHidden?: boolean }) => (
  <div
    className="flex whitespace-nowrap gap-20 pr-20 text-[10px] sm:text-[12px] font-display"
    aria-hidden={ariaHidden}
  >
    {MARQUEE_LINES.map((t, i) => {
      const colorClass = i % 3 === 0 ? 'text-neon-purple text-glow-purple' : i % 3 === 1 ? 'text-neon-orange' : 'text-neon-green';
      return (
        <span key={i} className={colorClass}>
          {t}
        </span>
      );
    })}
  </div>
);

const TickerMarquee = () => {
  return (
    <div className="overflow-hidden border-b-2 border-neon-purple/30 bg-background/80 py-1 sm:py-1.5">
      <div className="animate-marquee flex w-max">
        <MarqueeStrip />
        <MarqueeStrip ariaHidden />
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
  const [isGainzy, setIsGainzy] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<number | undefined>(undefined);

  // ── Entropy mode ────────────────────────────────────────────────────
  const [entropyMode, setEntropyMode] = useState<'classic' | 'entropy'>('classic');
  const entropy = useEntropy();
  // Entropy reroll tracking: seed + nonce counter + locked params
  const [eSeed, setESeed] = useState<`0x${string}` | null>(null);
  const [eNonce, setENonce] = useState(0);           // increments on every reroll
  const [ePreRerolls, setEPreRerolls] = useState(0);  // 0-3 pre-game rerolls used
  const [ePostRerolls, setEPostRerolls] = useState(0); // 0-3 post-game rerolls used
  const [ePreview, setEPreview] = useState<EntropySeed | null>(null); // current preview position
  const [lockedFeed, setLockedFeed] = useState<{ id: string; ticker: string; pair: string } | null>(null);
  const [eGainzy, setEGainzy] = useState(false); // gainzy locks leverage=200

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
    
    const attempts = [
      { count: 10, interval: 5 },
      { count: 15, interval: 3 },
      { count: 20, interval: 2 },
    ];
    
    for (const { count, interval } of attempts) {
      try {
        historyCandles = await fetchHistoricalCandles(feedId, count, interval);
        if (historyCandles.length >= 3) break;
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    }

    if (historyCandles.length < 1) {
      console.warn('No Pyth historical data available for', feedId);
    }
    
    return historyCandles;
  };

  const generatePosition = useCallback(async (specificFeed?: { id: string; ticker: string; pair: string }, gainzyMode = false) => {
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
      const shuffled = [...SOLO_TOKENS].sort(() => Math.random() - 0.5);
      let found = false;
      for (const token of shuffled) {
        const livePrice = await fetchPythPriceById(token.feedId);
        if (livePrice) {
          feed = { id: token.feedId, ticker: token.ticker, pair: token.pair };
          price = livePrice;
          found = true;
          break;
        }
        console.warn(`Token ${token.ticker} feed failed, trying next...`);
      }
      if (!found) { setStatus('IDLE'); return; }
    }

    let rarity, direction: TradeDirection, leverage, sl, rr;

    setIsGainzy(gainzyMode);

    if (gainzyMode) {
      rarity = RARITY_CONFIG[3];
      direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
      leverage = 200;
      sl = randInt(3, 5);
      rr = randInt(10, 20);
    } else {
      const picked = pickRarity();
      rarity = picked;
      direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
      leverage = randInt(picked.leverageRange[0], picked.leverageRange[1]);
      sl = randInt(picked.slRange[0], picked.slRange[1]);
      rr = randInt(picked.rrRange[0], picked.rrRange[1]);
    }

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

  // ── ENTROPY: request seed (1 tx) then show preview ─────────────────
  const startEntropy = useCallback(async (feed?: { id: string; ticker: string; pair: string }, gainzy = false) => {
    if (!walletAddress) { connectWallet(); return; }
    playGenerateClick();
    setStatus('GENERATING');
    setIsDaily(false);
    setTimerSeconds(undefined);
    setLockedFeed(feed || null);
    setEGainzy(gainzy);
    setIsGainzy(gainzy);
    setESeed(null);
    setENonce(0);
    setEPreRerolls(0);
    setEPostRerolls(0);
    setEPreview(null);
    entropy.reset();
    await entropy.requestSolo();
  }, [walletAddress, connectWallet, entropy]);

  // When seed arrives → derive initial position → show PREVIEW
  useEffect(() => {
    if (entropy.status !== 'ready' || !entropy.seed) return;
    if (status !== 'GENERATING') return;

    const seed = entropy.seed;
    setESeed(seed);
    setENonce(0);

    // Derive position from seed+nonce=0
    const lockToken = lockedFeed
      ? SOLO_TOKENS.findIndex(t => t.feedId === lockedFeed.id)
      : undefined;
    const lockLev = eGainzy ? 200 : undefined;
    const pos = derivePosition(seed, 0, lockToken !== undefined && lockToken >= 0 ? lockToken : undefined, lockLev);
    setEPreview(pos);
    setStatus('PREVIEW');
  }, [entropy.status, entropy.seed, status, lockedFeed, eGainzy]);

  // Pre-game reroll: reroll a single param (token/dir/lev/sl/tp)
  const preReroll = useCallback((paramIndex: 1 | 2 | 3 | 4 | 5) => {
    if (!eSeed || !ePreview || ePreRerolls >= 3) return;
    // Locked params: skip if trying to reroll locked param
    if (lockedFeed && paramIndex === 1) return; // token locked (PYTHOIL)
    if (eGainzy && paramIndex === 3) return;    // leverage locked (200)

    const newNonce = eNonce + 1;
    setENonce(newNonce);
    setEPreRerolls(prev => prev + 1);

    // Derive new random for this single param
    const derived = derivePosition(eSeed, newNonce,
      lockedFeed ? (SOLO_TOKENS.findIndex(t => t.feedId === lockedFeed.id)) : undefined,
      eGainzy ? 200 : undefined,
    );

    // Apply only the rerolled param, keep the rest from current preview
    const updated = { ...ePreview };
    switch (paramIndex) {
      case 1: updated.tokenIndex = derived.tokenIndex; break;
      case 2: updated.direction = derived.direction; break;
      case 3: updated.leverage = derived.leverage; updated.rarity = derived.rarity; break;
      case 4: updated.stopLoss = derived.stopLoss; updated.takeProfit = derived.stopLoss * updated.rrRatio; break;
      case 5: updated.rrRatio = derived.rrRatio; updated.takeProfit = updated.stopLoss * derived.rrRatio; break;
    }
    setEPreview(updated as EntropySeed);
  }, [eSeed, ePreview, ePreRerolls, eNonce, lockedFeed, eGainzy]);

  // Confirm preview → start playing (with token fallback if feed fails)
  const confirmPreview = useCallback(async () => {
    if (!ePreview) return;
    setStatus('GENERATING'); // brief loading

    // Determine token — locked feed or from preview index
    let token = lockedFeed
      ? { ticker: lockedFeed.ticker, feedId: lockedFeed.id, pair: lockedFeed.pair }
      : SOLO_TOKENS[ePreview.tokenIndex] || SOLO_TOKENS[0];

    let livePrice = await fetchPythPriceById(token.feedId);

    // Fallback: if token feed fails, try other tokens (skip locked feeds)
    if (!livePrice && !lockedFeed) {
      for (let i = 0; i < SOLO_TOKENS.length; i++) {
        if (i === ePreview.tokenIndex) continue;
        const fallback = SOLO_TOKENS[i];
        const p = await fetchPythPriceById(fallback.feedId);
        if (p) {
          token = { ticker: fallback.ticker, feedId: fallback.feedId, pair: fallback.pair };
          livePrice = p;
          console.warn(`Token ${SOLO_TOKENS[ePreview.tokenIndex]?.ticker} feed failed, using ${fallback.ticker}`);
          break;
        }
      }
    }

    if (!livePrice) { setStatus('IDLE'); return; }

    setActivePos({
      id: Date.now(),
      asset: token.ticker, ticker: token.ticker, feedId: token.feedId,
      direction: ePreview.direction, leverage: ePreview.leverage,
      stopLoss: -ePreview.stopLoss, takeProfit: ePreview.takeProfit,
      rarity: ePreview.rarity,
    });
    setEntryPrice(livePrice);
    setInitialCandles(await buildHistoricalCandles(token.feedId, livePrice));
    setFinalPnl(0);
    setStatus('PLAYING');
  }, [ePreview, lockedFeed]);

  // Post-game reroll: derive new position → go to PREVIEW for param tweaking
  const postReroll = useCallback(() => {
    if (!eSeed || ePostRerolls >= 3) return;

    const newNonce = eNonce + 1;
    setENonce(newNonce);
    setEPostRerolls(prev => prev + 1);
    // Reset pre-rerolls for the new preview round
    setEPreRerolls(0);

    const lockToken = lockedFeed
      ? SOLO_TOKENS.findIndex(t => t.feedId === lockedFeed.id)
      : undefined;
    const lockLev = eGainzy ? 200 : undefined;
    const pos = derivePosition(eSeed, newNonce, lockToken !== undefined && lockToken >= 0 ? lockToken : undefined, lockLev);

    setEPreview(pos);
    setStatus('PREVIEW');
  }, [eSeed, eNonce, ePostRerolls, lockedFeed, eGainzy]);

  // If entropy errors, fall back to IDLE
  useEffect(() => {
    if (entropy.status === 'error' && status === 'GENERATING') {
      setStatus('IDLE');
    }
  }, [entropy.status, status]);

  const generateDaily = useCallback(async () => {
    if (allVolatile.length === 0) return;
    playGenerateClick();
    setStatus('GENERATING');
    setIsDaily(true);

    const { feedIndex, params } = getDailyParams(allVolatile.length);
    const token = allVolatile[feedIndex % allVolatile.length];

    let livePrice = await fetchPythPriceById(token.feed_id);
    let usedToken = token;
    
    if (!livePrice) {
      for (let i = 1; i < allVolatile.length; i++) {
        usedToken = allVolatile[(feedIndex + i) % allVolatile.length];
        livePrice = await fetchPythPriceById(usedToken.feed_id);
        if (livePrice) break;
      }
    }
    
    if (!livePrice) { setStatus('IDLE'); return; }

    const pos: DegenPosition = {
      id: Date.now(),
      asset: usedToken.ticker,
      ticker: usedToken.ticker,
      feedId: usedToken.feed_id,
      direction: params.direction,
      leverage: params.leverage,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      rarity: params.rarity,
    };

    const historyCandles = await buildHistoricalCandles(usedToken.feed_id, livePrice);
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
    setTimeout(() => setStatus(result), 3000);
  }, [isDaily]);

  const handleExitEarly = useCallback((pnl: number) => {
    setFinalPnl(pnl);
    const r = pnl >= 0 ? 'WIN' : 'REKT';
    if (r === 'WIN') setStreak(recordWin());
    else setStreak(recordLoss());
    if (isDaily) markDailyDone();
    setDailyDone(hasDoneDaily());
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
    setESeed(null); setENonce(0); setEPreRerolls(0); setEPostRerolls(0);
    setEPreview(null); setLockedFeed(null); setEGainzy(false);
    entropy.reset();
  };

  const rarityStyle = activePos ? RARITY_STYLES[activePos.rarity] : RARITY_STYLES.common;

  return (
    <div className="h-screen bg-background grid-bg scanlines crt-vignette relative overflow-hidden flex flex-col">
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
        <div className="max-w-6xl mx-auto flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xl sm:text-2xl">🕹️</span>
            <span className="font-display text-[9px] sm:text-xs tracking-[0.3em] text-neon-purple text-glow-purple">PIRBGEN</span>
            <button onClick={toggleMusic} className="text-base sm:text-lg opacity-70 hover:opacity-100 transition-opacity" title={musicOn ? 'Mute music' : 'Play music'}>
              {musicOn ? '🔊' : '🔇'}
            </button>
            <StreakBadge streak={streak} />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-display text-neon-green">
              <span className="w-2 h-2 bg-neon-green animate-blink" />
              <span>BASE</span>
            </div>
            {walletAddress && profile ? (
              <button
                onClick={() => { playCoinSound(); navigate('/profile'); }}
                className="arcade-btn text-[8px] sm:text-[10px] py-1.5 sm:py-2 px-2 sm:px-3 flex items-center gap-1 sm:gap-2" style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)', boxShadow: 'var(--glow-green)' }}
              >
                <span>{getAvatarEmoji(profile.avatar)}</span>
                <span className="hidden sm:inline">{profile.display_name}</span>
              </button>
            ) : (
              <button
                onClick={() => { playCoinSound(); connectWallet(); }}
                disabled={isConnecting}
                className="arcade-btn arcade-btn-primary text-[8px] sm:text-[10px] py-1.5 sm:py-2 px-2 sm:px-3 disabled:opacity-50"
              >
                {isConnecting ? '⏳' : '🔗 CONNECT'}
              </button>
            )}
          </div>
        </div>
      </header>

      <TickerMarquee />

      {/* Main content */}
      <main className={`relative z-10 mx-auto px-3 sm:px-4 py-1 sm:py-2 flex-1 min-h-0 overflow-hidden flex flex-col w-full ${(status === 'PLAYING' || status === 'WIN' || status === 'REKT') ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="sync">
          {status === 'IDLE' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center gap-1 sm:gap-2 lg:gap-3 flex-1 py-1 sm:py-2"
              style={{ overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* Daily Challenge — above mascot */}
              {!dailyDone && allVolatile.length > 0 && (
                <motion.button
                  onClick={() => generateDaily()}
                  className="arcade-btn text-[8px] sm:text-[9px] py-1.5 sm:py-2 px-4 sm:px-5 tracking-wider shrink-0"
                  style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.1)', boxShadow: 'var(--glow-orange)' }}
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  📅 DAILY CHALLENGE (90s)
                </motion.button>
              )}
              {dailyDone && (
                <span className="font-display text-[7px] sm:text-[8px] text-muted-foreground/50 tracking-wider shrink-0">✅ DAILY DONE — COME BACK TOMORROW</span>
              )}

              <motion.img
                src={getMascot('idle', isGainzy)}
                alt="Pirb the pigeon"
                className="w-20 h-20 sm:w-24 sm:h-24 lg:w-36 lg:h-36 xl:w-48 xl:h-48 object-contain drop-shadow-[0_0_40px_hsl(265,66%,55%,0.4)] shrink-0"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Floating PYTHOIL barrel — transparent over buttons, visible in empty zones */}
              <motion.button
                onClick={() => {
                  const pf = { id: '0x67784f72e95ac01337edb7d7bd5bbd1c03669101b7068a620df228ed4e52ef14', ticker: 'PYTHOIL', pair: 'PYTHOIL/USD' };
                  entropyMode === 'entropy' ? startEntropy(pf) : generatePosition(pf);
                }}
                className="fixed z-[1] cursor-pointer group"
                initial={{ left: '8%', top: '35%' }}
                animate={{
                  left:    ['8%',  '25%', '68%', '80%', '55%', '12%', '72%', '35%', '18%', '8%'],
                  top:     ['35%', '22%', '30%', '55%', '68%', '50%', '22%', '60%', '45%', '35%'],
                  rotate:  [-2,    3,     -3,    4,     -2,    3,     -4,    2,     -2,    -2],
                  opacity: [0.9,   0.85,  0.9,   0.15,  0.15,  0.15,  0.85,  0.15,  0.8,   0.9],
                }}
                transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
                whileHover={{ scale: 1.15, opacity: 1 }}
                whileTap={{ scale: 0.9 }}
                title="🛢️ PYTHOIL — Click to trade!"
              >
                <img
                  src={pythoilBarrel}
                  alt="PYTHOIL Barrel"
                  className="w-12 h-10 sm:w-16 sm:h-12 lg:w-20 lg:h-14 object-contain group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    filter: 'drop-shadow(0 0 8px hsl(265 66% 55% / 0.4)) drop-shadow(0 0 16px hsl(265 66% 55% / 0.2))',
                  }}
                  draggable={false}
                />
                <span
                  className="absolute -bottom-4 left-1/2 -translate-x-1/2 font-display text-[6px] sm:text-[7px] text-neon-purple/0 group-hover:text-neon-purple group-hover:text-glow-purple tracking-wider whitespace-nowrap transition-colors duration-300"
                >
                  PYTHOIL 24/7
                </span>
              </motion.button>

              <div className="text-center space-y-1 sm:space-y-2 shrink-0">
                <h1 className="font-display text-xl sm:text-2xl lg:text-4xl xl:text-5xl tracking-wider text-neon-purple text-glow-purple">
                  <GlitchText>PIRBGEN</GlitchText>
                </h1>
                <p className="font-display text-[7px] sm:text-[8px] lg:text-[10px] text-neon-orange text-glow-orange tracking-[0.2em]">
                  INSERT COIN TO PLAY
                </p>
              </div>

              <div className="pixel-border p-3 sm:p-4 lg:p-6 w-full max-w-md space-y-2 sm:space-y-3 bg-background/90 shrink-0">
                {/* ── Mode Toggle: ENTROPY / CLASSIC ────────────────── */}
                <div className="flex items-center justify-center gap-0 font-display text-[8px] sm:text-[9px] tracking-wider">
                  <button
                    onClick={() => setEntropyMode('entropy')}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 border transition-all duration-200 ${
                      entropyMode === 'entropy'
                        ? 'bg-neon-purple/20 border-neon-purple/60 text-neon-purple text-glow-purple'
                        : 'bg-transparent border-muted-foreground/20 text-muted-foreground/50 hover:text-muted-foreground/80'
                    }`}
                    style={{ borderRadius: '2px 0 0 2px' }}
                  >
                    🔗 ENTROPY
                  </button>
                  <button
                    onClick={() => setEntropyMode('classic')}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 border border-l-0 transition-all duration-200 ${
                      entropyMode === 'classic'
                        ? 'bg-neon-green/20 border-neon-green/60 text-neon-green text-glow-green'
                        : 'bg-transparent border-muted-foreground/20 text-muted-foreground/50 hover:text-muted-foreground/80'
                    }`}
                    style={{ borderRadius: '0 2px 2px 0' }}
                  >
                    🎲 CLASSIC
                  </button>
                </div>
                {entropyMode === 'entropy' && (
                  <div className="text-center font-display text-[6px] sm:text-[7px] text-neon-purple/50 tracking-wider">
                    ON-CHAIN · PYTH ENTROPY · BASE L2
                    {entropy.fee && (
                      <span className="ml-2 text-neon-orange/50">FEE: {entropy.feeFormatted}</span>
                    )}
                    {entropy.error && (
                      <div className="text-neon-orange mt-1">{entropy.error}</div>
                    )}
                  </div>
                )}
                {entropyMode === 'classic' && (
                  <div className="text-center font-display text-[6px] sm:text-[7px] text-neon-green/50 tracking-wider">
                    OFF-CHAIN · INSTANT · NO FEES
                  </div>
                )}

                <button
                  onClick={() => entropyMode === 'entropy' ? startEntropy() : generatePosition()}
                  className="arcade-btn arcade-btn-primary w-full text-xs sm:text-sm lg:text-base py-2 sm:py-3"
                >
                  🎲 GENERATE
                </button>
                
                <button
                  onClick={() => entropyMode === 'entropy' ? startEntropy(undefined, true) : generatePosition(undefined, true)}
                  className="arcade-btn w-full text-[9px] sm:text-[10px] py-2 sm:py-3"
                  style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.15)', boxShadow: 'var(--glow-orange)' }}
                >
                  🔥 GAINZY MODE (200× MAX)
                </button>

                <Link to="/duel" onClick={() => playCoinSound()} className="arcade-btn w-full text-[9px] sm:text-[10px] py-2 sm:py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)', boxShadow: 'var(--glow-green)' }}>
                  ⚔️ PVP DUEL (1v1)
                </Link>

                <Link to="/leaderboard" onClick={() => playCoinSound()} className="arcade-btn arcade-btn-secondary w-full text-[9px] sm:text-[10px] py-2 sm:py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(25 95% 53% / 0.1)' }}>
                  🏆 LEADERBOARD
                </Link>

                <Link to="/benchmark" onClick={() => playCoinSound()} className="arcade-btn w-full text-[9px] sm:text-[10px] py-2 sm:py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-purple))', color: 'hsl(var(--neon-purple))', background: 'hsl(var(--neon-purple) / 0.1)', boxShadow: 'var(--glow-purple)' }}>
                  💩 ORACLE SPEED BENCHMARK
                </Link>
                {walletAddress && (
                  <Link to="/profile" onClick={() => playCoinSound()} className="arcade-btn w-full text-[9px] sm:text-[10px] py-2 sm:py-3 text-center block" style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)', boxShadow: 'var(--glow-green)' }}>
                    👤 PROFILE
                  </Link>
                )}
              </div>


              <div className="flex items-center gap-2 text-[7px] sm:text-[8px] font-display text-muted-foreground/40 shrink-0">
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
            <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center gap-4 sm:gap-6 flex-1">
              <motion.img src={getMascot(isDaily ? 'daily-generating' : 'generating', isGainzy)} alt="Pirb pecking" className="w-24 h-24 sm:w-32 sm:h-32 object-contain drop-shadow-[0_0_30px_hsl(265,66%,55%,0.4)]"
                animate={{ rotate: [-5, 5, -10, 8, -5], y: [0, 3, 0, 2, 0] }} transition={{ duration: 0.6, repeat: Infinity }} />
              <div className="text-center space-y-2 sm:space-y-3">
               <p className="font-display text-xs sm:text-lg text-neon-purple text-glow-purple tracking-wider">
                  {isDaily ? '📅 DAILY CHALLENGE LOADING...' : 'PIRB IS PECKING...'}
                </p>
                <p className="font-display text-[7px] sm:text-[8px] text-neon-orange animate-blink tracking-widest">
                  {entropyMode === 'entropy'
                    ? entropy.status === 'requesting' ? '⛓ SENDING TX TO BASE...'
                    : entropy.status === 'waiting_callback' ? '🔮 WAITING FOR PYTH CALLBACK...'
                    : '🔗 REQUESTING ENTROPY'
                    : '🎲 GENERATING POSITION...'
                  }
                </p>
                {entropy.error && entropyMode === 'entropy' && (
                  <p className="font-display text-[7px] text-neon-orange">{entropy.error}</p>
                )}
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map(i => {
                  const barColor = i % 3 === 0 ? 'bg-neon-purple' : i % 3 === 1 ? 'bg-neon-orange' : 'bg-neon-green';
                  return <motion.div key={i} className={`w-2 sm:w-3 h-6 sm:h-8 ${barColor}`} animate={{ scaleY: [0.3, 1, 0.3] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }} />;
                })}
              </div>
            </motion.div>
          )}

          {/* ── PREVIEW: entropy pre-game rerolls ────────────────────────── */}
          {status === 'PREVIEW' && ePreview && (
            <motion.div key="preview" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-2 sm:gap-3 flex-1 py-2"
              style={{ overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <motion.img src={getMascot('idle', isGainzy)} alt="Pirb" className="w-14 h-14 sm:w-20 sm:h-20 object-contain drop-shadow-[0_0_30px_hsl(265,66%,55%,0.4)]"
                animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />

              <div className="text-center">
                <h2 className="font-display text-sm sm:text-lg text-neon-purple text-glow-purple tracking-wider">
                  {ePostRerolls > 0 ? `REROLL ${ePostRerolls}/3` : 'YOUR POSITION'}
                </h2>
                <p className="font-display text-[7px] sm:text-[8px] text-neon-green/70 tracking-wider mt-0.5">
                  TAP ANY PARAM TO TWEAK · {3 - ePreRerolls}/3 TWEAKS LEFT
                </p>
              </div>

              {/* Param cards — tap to reroll */}
              <div className="pixel-border p-2 sm:p-3 w-full max-w-sm bg-background/90">
                <div className="grid grid-cols-5 gap-1">
                  {([
                    { idx: 1 as const, label: 'TOKEN', val: (SOLO_TOKENS[ePreview.tokenIndex] || SOLO_TOKENS[0]).ticker, icon: '🪙', locked: !!lockedFeed },
                    { idx: 2 as const, label: 'DIR', val: ePreview.direction, icon: '📈', locked: false, color: ePreview.direction === 'LONG' ? 'text-neon-green' : 'text-neon-orange' },
                    { idx: 3 as const, label: 'LEV', val: `${ePreview.leverage}×`, icon: '⚡', locked: eGainzy },
                    { idx: 4 as const, label: 'SL', val: `-${ePreview.stopLoss}%`, icon: '🛑', locked: false },
                    { idx: 5 as const, label: 'TP', val: `+${ePreview.takeProfit}%`, icon: '🎯', locked: false },
                  ]).map(p => {
                    const canReroll = !p.locked && ePreRerolls < 3;
                    return (
                      <motion.button key={p.idx} onClick={() => canReroll && preReroll(p.idx)}
                        whileTap={canReroll ? { scale: 0.9 } : {}}
                        className={`flex flex-col items-center gap-0.5 py-1.5 px-0.5 border font-display text-center transition-all duration-150 ${
                          p.locked
                            ? 'border-muted-foreground/10 text-muted-foreground/30 cursor-not-allowed'
                            : canReroll
                              ? 'border-neon-purple/40 text-neon-purple hover:bg-neon-purple/10 cursor-pointer'
                              : 'border-muted-foreground/15 text-muted-foreground/40 cursor-not-allowed'
                        }`} style={{ borderRadius: '2px' }}>
                        <span className="text-[9px] sm:text-[11px]">{p.icon}</span>
                        <span className="text-[5px] sm:text-[6px] tracking-wider opacity-50">{p.label}{p.locked ? ' 🔒' : ''}</span>
                        <span className={`text-[8px] sm:text-[9px] font-bold ${p.color || (canReroll ? 'text-neon-green' : '')}`}>{p.val}</span>
                      </motion.button>
                    );
                  })}
                </div>
                {/* Rarity badge */}
                <div className={`mt-1.5 text-center py-0.5 border ${RARITY_STYLES[ePreview.rarity].border} ${RARITY_STYLES[ePreview.rarity].bg}`}>
                  <span className={`font-display text-[7px] sm:text-[8px] tracking-wider ${RARITY_STYLES[ePreview.rarity].text}`}>
                    {RARITY_STYLES[ePreview.rarity].label}
                  </span>
                </div>
              </div>

              <p className="font-display text-[5px] sm:text-[6px] text-muted-foreground/30 tracking-wider">
                FREE · NO GAS · keccak256(seed, nonce)
              </p>

              <div className="flex gap-2 sm:gap-3">
                <button onClick={confirmPreview} className="arcade-btn arcade-btn-primary text-[10px] sm:text-xs py-2 sm:py-3 px-6 sm:px-8">
                  ▶ PLAY
                </button>
                <button onClick={() => { playCoinSound(); resetTerminal(); }}
                  className="arcade-btn text-[9px] sm:text-[10px] py-2 sm:py-3 px-4"
                  style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.1)' }}>
                  ✖ CANCEL
                </button>
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
                  gainzyMode={isGainzy}
                />
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 gap-2 sm:gap-3 p-2 sm:p-3 min-h-0"
                  style={{ overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 150 }}
                    className="text-center shrink-0"
                  >
                    <h1 className={`font-display text-2xl sm:text-3xl lg:text-5xl tracking-wider ${status === 'WIN' ? 'text-neon-green text-glow-green animate-rainbow' : 'text-neon-orange text-glow-orange'}`}>
                      {status === 'WIN' ? '🏆 YOU WIN!' : '💀 PIRBED!'}
                    </h1>
                  </motion.div>

                  <motion.div
                    initial={{ x: status === 'WIN' ? 300 : -300, opacity: 0, rotate: status === 'WIN' ? 15 : -15 }}
                    animate={{ x: 0, opacity: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 0.2 }}
                    className="relative shrink-0"
                  >
                    <motion.img src={getMascot(status === 'WIN' ? (streak.current >= 3 ? 'streak' : 'win') : (finalPnl <= -50 ? 'rage' : 'lose'), isGainzy)} alt="Pirb"
                      className="w-16 h-16 sm:w-24 sm:h-24 lg:w-36 lg:h-36 object-contain"
                      style={{
                        filter: status === 'WIN'
                          ? 'drop-shadow(0 0 20px #07e46e) drop-shadow(0 0 40px #07e46eaa)'
                          : 'drop-shadow(0 0 20px #f97316) drop-shadow(0 0 40px #f9731688)',
                        transform: status === 'REKT' ? 'scaleX(-1)' : undefined,
                      }}
                      animate={status === 'WIN'
                        ? { y: [0, -6, 0], rotate: [0, -5, 3, -2, 0] }
                        : { y: [0, 2, 0], rotate: [0, -3, 5, -8, 3, 0], scale: [1, 1.05, 1, 1.08, 1] }
                      }
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.7, type: 'spring', stiffness: 200 }}
                      className={`absolute -top-2 ${status === 'WIN' ? '-right-6' : '-left-6'} pixel-border px-2 py-1 text-[7px] sm:text-[9px] font-display tracking-wider whitespace-nowrap ${
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
                    <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="shrink-0">
                      <StreakBadge streak={streak} />
                    </motion.div>
                  )}

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="glass-panel rounded-sm p-2 sm:p-3 lg:p-4 w-full max-w-xs sm:max-w-sm mx-auto shrink-0"
                  >
                    <div className={`text-center p-2 sm:p-3 rounded-sm border ${
                      status === 'WIN' ? 'border-neon-green/40 bg-neon-green/5' : 'border-neon-orange/40 bg-neon-orange/5'
                    }`}>
                      <p className="text-[8px] sm:text-[9px] text-muted-foreground font-display tracking-wider mb-1">YOU · {activePos.ticker}</p>
                      <p className={`font-mono text-xl sm:text-3xl lg:text-4xl font-bold ${status === 'WIN' ? 'text-neon-green' : 'text-neon-orange'}`}>
                        {finalPnl >= 0 ? '+' : ''}{finalPnl.toFixed(2)}%
                      </p>
                      
                      {streak.current > 1 && status === 'WIN' && (
                        <p className="font-display text-[7px] sm:text-[8px] text-neon-orange tracking-wider mt-1 sm:mt-2">
                          🔥 STREAK BONUS: ×{getStreakMultiplier(streak.current).toFixed(1)}
                        </p>
                      )}
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex flex-wrap justify-center gap-2 sm:gap-3 shrink-0">
                    {/* Entropy mode: reroll → goes to PREVIEW for param tweaking */}
                    {entropyMode === 'entropy' && eSeed && ePostRerolls < 3 && (
                      <button onClick={() => postReroll()}
                        className="arcade-btn arcade-btn-primary text-[9px] sm:text-[10px] py-2 sm:py-3 px-4 sm:px-6"
                        style={isGainzy ? { borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.15)', boxShadow: 'var(--glow-orange)' } : {}}>
                        🎲 REROLL ({3 - ePostRerolls}/3)
                      </button>
                    )}
                    {/* Entropy mode: rerolls exhausted → new GENERATE */}
                    {entropyMode === 'entropy' && eSeed && ePostRerolls >= 3 && (
                      <button onClick={() => startEntropy(lockedFeed || undefined, eGainzy)}
                        className="arcade-btn arcade-btn-primary text-[9px] sm:text-[10px] py-2 sm:py-3 px-4 sm:px-6">
                        🎲 GENERATE (NEW SEED)
                      </button>
                    )}
                    {/* Classic mode: simple roll again */}
                    {entropyMode === 'classic' && (
                      <button onClick={() => generatePosition(undefined, isGainzy)} className="arcade-btn arcade-btn-primary text-[9px] sm:text-[10px] py-2 sm:py-3 px-4 sm:px-6"
                        style={isGainzy ? { borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.15)', boxShadow: 'var(--glow-orange)' } : {}}>
                        {isGainzy ? '🔥 GAINZY AGAIN' : '🎲 ROLL AGAIN'}
                      </button>
                    )}
                    <button onClick={() => { playCoinSound(); resetTerminal(); }}
                      className="arcade-btn text-[9px] sm:text-[10px] py-2 sm:py-3 px-4 sm:px-6" style={{ borderColor: 'hsl(var(--neon-orange))', color: 'hsl(var(--neon-orange))', background: 'hsl(var(--neon-orange) / 0.1)', boxShadow: 'var(--glow-orange)' }}>
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

      <footer className="relative z-10 border-t-2 border-neon-green/15 bg-background/90 py-1 sm:py-2 px-3 sm:px-4 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-[7px] sm:text-[8px] font-display text-muted-foreground/40 tracking-wider">
          <span className="text-neon-purple/40">PIRBGEN v0.1</span>
          <span className="text-neon-green/40 animate-pulse-neon">● LIVE</span>
          <span className="hidden sm:inline text-neon-orange/30">BASE L2</span>
        </div>
      </footer>
    </div>
  );
}