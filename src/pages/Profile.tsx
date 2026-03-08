import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useWallet, shortenAddress } from '@/contexts/WalletContext';

const AVATARS = [
  { id: 'pigeon', emoji: '🐦', label: 'Pirb' },
  { id: 'skull', emoji: '💀', label: 'Skull' },
  { id: 'rocket', emoji: '🚀', label: 'Rocket' },
  { id: 'diamond', emoji: '💎', label: 'Diamond' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'alien', emoji: '👽', label: 'Alien' },
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'ghost', emoji: '👻', label: 'Ghost' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
  { id: 'clown', emoji: '🤡', label: 'Clown' },
  { id: 'frog', emoji: '🐸', label: 'Pepe' },
  { id: 'moon', emoji: '🌙', label: 'Moon' },
];

export function getAvatarEmoji(id: string): string {
  return AVATARS.find(a => a.id === id)?.emoji || '🐦';
}

interface TradeEntry {
  id: string;
  ticker: string;
  direction: string;
  leverage: number;
  pnl_percent: number;
  rarity: string;
  created_at: string;
}

const RARITY_COLORS: Record<string, string> = {
  common: 'text-muted-foreground',
  rare: 'text-neon-cyan',
  legendary: 'text-neon-amber',
  degen: 'text-neon-magenta',
};

export default function Profile() {
  const { walletAddress, profile, updateProfile, disconnectWallet } = useWallet();
  const navigate = useNavigate();
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!walletAddress) {
      navigate('/');
      return;
    }

    const fetchTrades = async () => {
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) setTrades(data as TradeEntry[]);
      setLoading(false);
    };

    fetchTrades();
  }, [walletAddress, navigate]);

  useEffect(() => {
    if (profile) setNameInput(profile.display_name);
  }, [profile]);


  if (!walletAddress || !profile) return null;

  const totalTrades = trades.length;
  const wins = trades.filter(t => t.pnl_percent > 0).length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0';
  const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.pnl_percent)) : 0;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl_percent, 0);

  const handleSaveName = async () => {
    if (nameInput.trim() && nameInput !== profile.display_name) {
      await updateProfile({ display_name: nameInput.trim() });
    }
    setEditingName(false);
  };

  const handleSelectAvatar = async (avatarId: string) => {
    await updateProfile({ avatar: avatarId, avatar_url: null });
    setAvatarPickerOpen(false);
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !walletAddress) return;

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${walletAddress}.${ext}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (!error) {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Add cache buster
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      await updateProfile({ avatar: 'custom', avatar_url: url });
    }

    setUploading(false);
    setAvatarPickerOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const renderAvatar = () => {
    if (profile.avatar === 'custom' && profile.avatar_url) {
      return (
        <img
          src={profile.avatar_url}
          alt="Avatar"
          className="w-16 h-16 rounded-full object-cover border-2 border-primary/40"
        />
      );
    }
    return <span className="text-5xl">{getAvatarEmoji(profile.avatar)}</span>;
  };

  return (
    <div className="min-h-screen bg-background grid-bg scanlines relative overflow-hidden animate-flicker">
      <header className="relative z-10 border-b border-border/30 bg-muted/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐦</span>
            <span className="font-display text-sm tracking-[0.3em] text-foreground text-glow-green">PIRBGEN</span>
          </div>
          <Link
            to="/"
            className="glass-panel px-4 py-1.5 text-xs font-display tracking-wider text-foreground hover:box-glow-green transition-all duration-300"
          >
            ← TERMINAL
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Profile Card */}
          <div className="glass-panel rounded-sm border border-border/30 p-6 space-y-6">
            <div className="flex items-center gap-4">
              {/* Clickable Avatar */}
              <div className="relative" ref={pickerRef}>
                <button
                  onClick={() => setAvatarPickerOpen(!avatarPickerOpen)}
                  className="relative cursor-pointer group"
                >
                  {renderAvatar()}
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-display text-foreground">✏️</span>
                  </div>
                </button>

                {/* Avatar Picker Modal */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
                      onClick={() => setAvatarPickerOpen(false)}
                    >
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        className="glass-panel border border-border/40 rounded-sm p-8 w-full max-w-md space-y-5"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-display text-sm tracking-[0.2em] text-foreground text-glow-green uppercase">Choose Avatar</p>
                          <button onClick={() => setAvatarPickerOpen(false)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {AVATARS.map(av => (
                            <motion.button
                              key={av.id}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleSelectAvatar(av.id)}
                              className={`flex flex-col items-center gap-1.5 p-4 rounded-sm border transition-all cursor-pointer ${
                                profile.avatar === av.id && !profile.avatar_url
                                  ? 'border-primary/60 bg-primary/10 box-glow-green'
                                  : 'border-border/20 bg-muted/10 hover:border-border/40'
                              }`}
                            >
                              <span className="text-3xl">{av.emoji}</span>
                              <span className="text-[9px] text-muted-foreground font-display tracking-wider">{av.label}</span>
                            </motion.button>
                          ))}
                        </div>

                        {/* Upload photo */}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="w-full py-3 bg-primary/10 border border-primary/40 text-foreground font-display text-xs tracking-[0.2em] hover:bg-primary/20 hover:box-glow-green transition-all cursor-pointer disabled:opacity-50"
                        >
                          {uploading ? '⏳ UPLOADING...' : '📷 UPLOAD PHOTO'}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleUploadAvatar}
                        />

                        {/* Back */}
                        <button
                          onClick={() => setAvatarPickerOpen(false)}
                          className="w-full py-2.5 bg-muted/30 border border-border/30 text-muted-foreground font-display text-xs tracking-[0.2em] hover:text-foreground hover:border-border/60 transition-all cursor-pointer"
                        >
                          ← BACK
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1 space-y-1">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      maxLength={20}
                      className="bg-muted/30 border border-border/40 px-3 py-1.5 text-sm font-mono text-foreground rounded-sm outline-none focus:border-primary/60 w-48"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                    />
                    <button onClick={handleSaveName} className="text-xs text-neon-green font-display tracking-wider hover:text-glow-green">SAVE</button>
                    <button onClick={() => setEditingName(false)} className="text-xs text-muted-foreground font-display tracking-wider">CANCEL</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl text-foreground text-glow-green">{profile.display_name}</h2>
                    <button onClick={() => setEditingName(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">✏️</button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground font-mono">{shortenAddress(walletAddress)}</p>
              </div>
              <button
                onClick={() => { disconnectWallet(); navigate('/'); }}
                className="text-xs text-neon-red font-display tracking-wider hover:text-glow-red transition-all"
              >
                DISCONNECT
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Trades', value: totalTrades.toString(), color: 'text-foreground' },
                { label: 'Win Rate', value: `${winRate}%`, color: Number(winRate) >= 50 ? 'text-neon-green' : 'text-neon-red' },
                { label: 'Best Trade', value: `${bestTrade >= 0 ? '+' : ''}${bestTrade.toFixed(1)}%`, color: bestTrade >= 0 ? 'text-neon-green' : 'text-neon-red' },
                { label: 'Total PnL', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`, color: totalPnl >= 0 ? 'text-neon-green' : 'text-neon-red' },
              ].map(stat => (
                <div key={stat.label} className="bg-muted/20 border border-border/20 p-3 rounded-sm text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  <p className={`text-lg font-mono font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trade History */}
          <div className="glass-panel rounded-sm border border-border/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/20 bg-muted/20">
              <h3 className="font-display text-sm tracking-[0.2em] text-muted-foreground uppercase">📜 Trade History</h3>
            </div>

            {loading ? (
              <div className="py-12 text-center">
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
                <p className="text-xs text-muted-foreground">Loading trades...</p>
              </div>
            ) : trades.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-3xl">🎲</p>
                <p className="text-sm text-muted-foreground">No trades yet. Go roll some positions!</p>
                <Link
                  to="/"
                  className="inline-block mt-2 px-6 py-2 bg-primary/10 border border-primary/40 text-foreground font-display text-xs tracking-wider hover:bg-primary/20 hover:box-glow-green transition-all"
                >
                  🎲 START TRADING
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/10">
                {trades.map((trade, i) => (
                  <motion.div
                    key={trade.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-display tracking-wider ${
                        trade.direction === 'LONG' ? 'text-neon-green' : 'text-neon-red'
                      }`}>
                        {trade.direction}
                      </span>
                      <span className={`text-sm font-display ${RARITY_COLORS[trade.rarity] || 'text-foreground'}`}>
                        {trade.ticker}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{trade.leverage}x</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm font-mono font-bold ${
                        trade.pnl_percent >= 0 ? 'text-neon-green' : 'text-neon-red'
                      }`}>
                        {trade.pnl_percent >= 0 ? '+' : ''}{Number(trade.pnl_percent).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 font-mono">
                        {timeAgo(trade.created_at)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Back */}
          <div className="text-center pt-4">
            <Link
              to="/"
              className="inline-block px-8 py-3 bg-primary/10 border border-primary/40 text-foreground font-display text-sm tracking-wider hover:bg-primary/20 hover:box-glow-green transition-all duration-300"
            >
              🎲 BACK TO TERMINAL
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
