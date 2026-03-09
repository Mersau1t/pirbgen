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
  rare: 'text-neon-green',
  legendary: 'text-neon-orange',
  degen: 'text-neon-purple',
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
    <div className="h-screen bg-background grid-bg scanlines crt-vignette relative overflow-hidden animate-flicker flex flex-col">
      <header className="relative z-10 border-b-2 border-neon-purple/40 bg-background/90">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕹️</span>
            <span className="font-display text-[10px] sm:text-xs tracking-[0.3em] text-neon-purple text-glow-purple">PIRBGEN</span>
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
          className="flex flex-col gap-4 flex-1 min-h-0"
        >
          {/* Profile Card */}
          <div className="pixel-border p-4 space-y-4 bg-background/90 shrink-0">
            <div className="flex items-center gap-4">
              {/* Clickable Avatar */}
              <div className="relative">
                <button
                  onClick={() => setAvatarPickerOpen(!avatarPickerOpen)}
                  className="relative cursor-pointer group"
                >
                  {renderAvatar()}
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-display text-foreground">✏️</span>
                  </div>
                </button>

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
                    <h2 className="font-display text-xl text-foreground text-glow-purple">{profile.display_name}</h2>
                    <button onClick={() => setEditingName(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">✏️</button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground font-mono">{shortenAddress(walletAddress)}</p>
              </div>
              <button
                onClick={() => { disconnectWallet(); navigate('/'); }}
                className="text-xs text-neon-orange font-display tracking-wider hover:text-glow-orange transition-all"
              >
                DISCONNECT
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Trades', value: totalTrades.toString(), color: 'text-foreground', borderColor: 'border-neon-purple/20', bgColor: 'bg-neon-purple/5', labelColor: 'text-neon-purple/50' },
                { label: 'Win Rate', value: `${winRate}%`, color: Number(winRate) >= 50 ? 'text-neon-green' : 'text-neon-orange', borderColor: 'border-neon-green/20', bgColor: 'bg-neon-green/5', labelColor: 'text-neon-green/50' },
                { label: 'Best Trade', value: `${bestTrade >= 0 ? '+' : ''}${bestTrade.toFixed(1)}%`, color: bestTrade >= 0 ? 'text-neon-green' : 'text-neon-orange', borderColor: 'border-neon-orange/20', bgColor: 'bg-neon-orange/5', labelColor: 'text-neon-orange/50' },
                { label: 'Total PnL', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`, color: totalPnl >= 0 ? 'text-neon-green' : 'text-neon-orange', borderColor: 'border-neon-purple/20', bgColor: 'bg-neon-purple/5', labelColor: 'text-neon-purple/50' },
              ].map(stat => (
                <div key={stat.label} className={`border-2 ${stat.borderColor} p-2 text-center ${stat.bgColor}`}>
                  <p className={`text-[8px] font-display ${stat.labelColor} uppercase tracking-wider`}>{stat.label}</p>
                  <p className={`text-base font-mono font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trade History */}
          <div className="pixel-border-green flex flex-col min-h-0 flex-1 bg-background/90">
            <div className="px-4 py-2 border-b-2 border-neon-green/20 bg-neon-green/5 shrink-0">
              <h3 className="font-display text-[10px] tracking-[0.2em] text-neon-green text-glow-green uppercase">📜 TRADE HISTORY</h3>
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
              </div>
            ) : (
              <div className="divide-y divide-border/10 overflow-y-auto flex-1 min-h-0">
                {trades.map((trade, i) => (
                  <motion.div
                    key={trade.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-display tracking-wider ${
                        trade.direction === 'LONG' ? 'text-neon-green' : 'text-neon-orange'
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
                        trade.pnl_percent >= 0 ? 'text-neon-green' : 'text-neon-orange'
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

          <div className="shrink-0 text-center py-2">
            <Link to="/" className="arcade-btn arcade-btn-primary text-[10px] py-2.5 px-8 inline-block">
              🎲 BACK TO TERMINAL
            </Link>
          </div>
        </motion.div>
      </main>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {avatarPickerOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center bg-background/85 backdrop-blur-sm p-4"
              onClick={() => setAvatarPickerOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="pixel-border p-8 w-full max-w-2xl space-y-6 bg-background/95"
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-[10px] sm:text-xs tracking-[0.2em] text-neon-purple text-glow-purple uppercase">SELECT AVATAR</p>
                  <button onClick={() => setAvatarPickerOpen(false)} className="text-neon-orange hover:text-glow-orange text-xl font-display">✕</button>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {AVATARS.map(av => (
                    <motion.button
                      key={av.id}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSelectAvatar(av.id)}
                      className={`flex flex-col items-center gap-2 p-4 border-2 transition-all cursor-pointer ${
                        profile.avatar === av.id && !profile.avatar_url
                          ? 'border-neon-green bg-neon-green/10 box-glow-green'
                          : 'border-muted-foreground/20 bg-muted/10 hover:border-neon-purple/40'
                      }`}
                    >
                      <span className="text-3xl">{av.emoji}</span>
                      <span className="text-[8px] text-muted-foreground font-display tracking-wider">{av.label}</span>
                    </motion.button>
                  ))}
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="arcade-btn arcade-btn-secondary w-full text-[10px] py-3 disabled:opacity-50"
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

                <button
                  onClick={() => setAvatarPickerOpen(false)}
                  className="arcade-btn arcade-btn-primary w-full text-[10px] py-2.5"
                >
                  ← BACK
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}