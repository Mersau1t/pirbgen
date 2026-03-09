import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

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

    // Realtime subscription
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
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="h-screen bg-background grid-bg scanlines crt-vignette relative overflow-hidden animate-flicker flex flex-col">
      <header className="relative z-10 border-b-2 border-neon-green/40 bg-background/90 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕹️</span>
            <span className="font-display text-[10px] sm:text-xs tracking-[0.3em] text-neon-green text-glow-green">PIRBGEN</span>
          </div>
          <Link to="/" className="arcade-btn arcade-btn-primary text-[8px] sm:text-[10px] py-2 px-3">
            ← TERMINAL
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-4 flex-1 flex flex-col min-h-0 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col flex-1 min-h-0 gap-3"
        >
          <div className="text-center space-y-1 shrink-0">
            <h1 className="font-display text-2xl sm:text-3xl tracking-wider text-neon-orange text-glow-orange">
              🏆 HIGH SCORES
            </h1>
            <p className="font-display text-[8px] text-neon-green text-glow-green tracking-[0.2em]">
              TOP DEGENS RANKED BY PNL
            </p>
          </div>

          <div className="pixel-border-orange flex flex-col flex-1 min-h-0 bg-background/90">
            {/* Table header */}
            <div className="grid grid-cols-[40px_1fr_70px_60px_70px_100px_80px] sm:grid-cols-[50px_1fr_80px_70px_80px_120px_90px] gap-1 px-4 py-2 bg-neon-green/5 border-b-2 border-neon-green/20 text-[8px] font-display tracking-wider text-neon-green/60 uppercase shrink-0">
              <span>#</span>
              <span>Player</span>
              <span>Ticker</span>
              <span>Side</span>
              <span>Lev</span>
              <span className="text-right">PnL %</span>
              <span className="text-right">When</span>
            </div>

            {loading ? (
              <div className="py-16 text-center">
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
              <div className="py-16 text-center space-y-3">
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
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`grid grid-cols-[40px_1fr_70px_60px_70px_100px_80px] sm:grid-cols-[50px_1fr_80px_70px_80px_120px_90px] gap-1 px-4 py-2.5 items-center hover:bg-muted/20 transition-colors ${
                      i < 3 ? 'bg-neon-green/[0.02]' : ''
                    }`}
                  >
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
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 text-center py-2">
            <Link to="/" className="arcade-btn arcade-btn-primary text-[10px] py-2.5 px-8 inline-block">
              🎲 BACK TO TERMINAL
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}