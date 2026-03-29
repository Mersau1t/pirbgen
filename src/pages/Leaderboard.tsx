import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { playCoinSound } from '@/lib/sounds';
import iconPirb from '@/assets/icons/icon_pirb.png';

interface LeaderboardEntry {
  id: string;
  player_name: string;
  ticker: string;
  direction: string;
  leverage: number;
  pnl_percent: number;
  rarity: string;
  created_at: string;
}

const RARITY_COLORS: Record<string, string> = {
  common: 'text-muted-foreground',
  rare: 'text-neon-green',
  legendary: 'text-neon-orange',
  degen: 'text-neon-purple',
};

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('pnl_percent', { ascending: false })
        .limit(50);

      if (!error && data) {
        setEntries(data as LeaderboardEntry[]);
      }
      setLoading(false);
    };

    fetchLeaderboard();

    const channel = supabase
      .channel('leaderboard-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leaderboard' }, (payload) => {
        setEntries(prev => {
          const newEntry = payload.new as LeaderboardEntry;
          const updated = [...prev, newEntry].sort((a, b) => b.pnl_percent - a.pnl_percent).slice(0, 50);
          return updated;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getMedal = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div className="h-screen bg-background grid-bg scanlines crt-vignette relative overflow-hidden animate-flicker flex flex-col">
      <header className="relative z-10 border-b-2 border-neon-purple/40 bg-background/90 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-center px-3 sm:px-4 py-2 sm:py-3 relative min-h-[56px] sm:min-h-[64px]">
          <Link to="/" onClick={() => playCoinSound()} className="font-display text-sm text-muted-foreground hover:text-neon-purple transition-colors absolute left-3 sm:left-4 z-10">
            ← BACK
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <img src={iconPirb} alt="LEADERBOARD" width={40} height={40} className="object-contain shrink-0" />
            <span className="font-display text-[8px] sm:text-xs tracking-[0.3em] text-neon-purple text-glow-purple">LEADERBOARD</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-2 sm:px-4 py-3 sm:py-4 flex-1 flex flex-col min-h-0 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col flex-1 min-h-0 gap-2 sm:gap-3"
        >
          <div className="text-center space-y-1 shrink-0">
            <h1 className="font-display text-xl sm:text-3xl tracking-wider text-neon-orange text-glow-orange">
              🏆 HIGH SCORES
            </h1>
            <p className="font-display text-[7px] sm:text-[8px] text-neon-purple text-glow-purple tracking-[0.2em]">
              TOP DEGENS RANKED BY PNL
            </p>
          </div>

          <div className="pixel-border flex flex-col flex-1 min-h-0 bg-background/90">
            {/* Desktop header - hidden on mobile */}
            <div className="hidden sm:grid grid-cols-[50px_1fr_80px_70px_80px_120px_90px] gap-1 px-4 py-2 bg-neon-purple/5 border-b-2 border-neon-purple/20 text-[8px] font-display tracking-wider text-neon-purple/60 uppercase shrink-0">
              <span>#</span>
              <span>Player</span>
              <span>Ticker</span>
              <span>Side</span>
              <span>Lev</span>
              <span className="text-right">PnL %</span>
              <span className="text-right">When</span>
            </div>

            {/* Mobile header */}
            <div className="grid sm:hidden grid-cols-[32px_1fr_50px_70px] gap-1 px-2 py-1.5 bg-neon-purple/5 border-b-2 border-neon-purple/20 text-[7px] font-display tracking-wider text-neon-purple/60 uppercase shrink-0">
              <span>#</span>
              <span>Player</span>
              <span>Asset</span>
              <span className="text-right">PnL</span>
            </div>

            {loading ? (
              <div className="py-12 sm:py-16 text-center">
                <div className="flex justify-center gap-1 mb-4">
                  {[0, 1, 2, 3, 4].map(i => (
                    <motion.div
                      key={i}
                      className="w-2 h-6 bg-primary/60"
                      animate={{ scaleY: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Loading leaderboard...</p>
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 sm:py-16 text-center space-y-3">
                <p className="text-3xl">🐦</p>
                <p className="text-sm text-muted-foreground">No trades yet. Be the first degen!</p>
                <Link
                  to="/"
                  className="inline-block mt-2 px-6 py-2 bg-primary/10 border border-primary/40 text-foreground font-display text-xs tracking-wider hover:bg-primary/20 hover:box-glow-green transition-all"
                >
                  🎲 START TRADING
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/10 overflow-y-auto flex-1 min-h-0">
                {entries.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: i * 0.06, type: "spring", stiffness: 120, damping: 18 }}
                  >
                    {/* Desktop row */}
                    <div className={`hidden sm:grid grid-cols-[50px_1fr_80px_70px_80px_120px_90px] gap-1 px-4 py-2.5 items-center hover:bg-muted/20 transition-colors ${
                      i < 3 ? 'bg-neon-green/[0.02]' : ''
                    }`}>
                      <span className={`text-sm ${i < 3 ? 'text-lg' : 'text-xs text-muted-foreground font-mono'}`}>
                        {getMedal(i)}
                      </span>
                      <span className={`text-xs font-mono truncate ${RARITY_COLORS[entry.rarity] || 'text-foreground'}`}>
                        {entry.player_name}
                      </span>
                      <span className="text-xs font-display text-foreground">{entry.ticker}</span>
                      <span className={`text-[10px] font-display tracking-wider ${
                        entry.direction === 'LONG' ? 'text-neon-green' : 'text-neon-orange'
                      }`}>
                        {entry.direction}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">{entry.leverage}x</span>
                      <span className={`text-sm font-mono text-right font-bold ${
                        entry.pnl_percent >= 0 ? 'text-neon-green text-glow-green' : 'text-neon-orange'
                      }`}>
                        {entry.pnl_percent >= 0 ? '+' : ''}{Number(entry.pnl_percent).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 font-mono text-right">
                        {timeAgo(entry.created_at)}
                      </span>
                    </div>

                    {/* Mobile row — compact 4 columns */}
                    <div className={`grid sm:hidden grid-cols-[32px_1fr_50px_70px] gap-1 px-2 py-2 items-center active:bg-muted/20 ${
                      i < 3 ? 'bg-neon-green/[0.02]' : ''
                    }`}>
                      <span className={`${i < 3 ? 'text-base' : 'text-[10px] text-muted-foreground font-mono'}`}>
                        {getMedal(i)}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-[11px] font-mono truncate ${RARITY_COLORS[entry.rarity] || 'text-foreground'}`}>
                          {entry.player_name}
                        </p>
                        <p className="text-[8px] text-muted-foreground/50">
                          <span className={entry.direction === 'LONG' ? 'text-neon-green/60' : 'text-neon-orange/60'}>{entry.direction}</span>
                          {' · '}{entry.leverage}x · {timeAgo(entry.created_at)}
                        </p>
                      </div>
                      <span className="text-[10px] font-display text-foreground text-center">{entry.ticker}</span>
                      <span className={`text-xs font-mono text-right font-bold ${
                        entry.pnl_percent >= 0 ? 'text-neon-green' : 'text-neon-orange'
                      }`}>
                        {entry.pnl_percent >= 0 ? '+' : ''}{Number(entry.pnl_percent).toFixed(1)}%
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

        </motion.div>
      </main>
    </div>
  );
}