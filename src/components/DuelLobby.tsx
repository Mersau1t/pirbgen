import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { generateRoomCode, pickTwoDifferentTokens, pickDuelRarity, randomInRange, DUEL_TIMER_SECONDS } from '@/lib/duelConstants';
import { fetchPythPriceById } from '@/lib/pyth';
import { useWallet } from '@/contexts/WalletContext';
import imgJoinDuel from '@/assets/icons/join_duel.png';
import imgDuelClassic from '@/assets/icons/duel.png';

const Ico = ({ src, size = 16 }: { src: string; size?: number }) => (
  <img src={src} alt="" width={size} height={size} draggable={false}
    className="inline-block object-contain align-middle shrink-0"
    style={{ imageRendering: 'pixelated' }} />
);

interface DuelLobbyProps {
  onRoomReady: (roomId: string, playerSlot: 'p1' | 'p2') => void;
}

export default function DuelLobby({ onRoomReady }: DuelLobbyProps) {
  const { walletAddress, profile } = useWallet();
  const [mode, setMode] = useState<'menu' | 'creating' | 'joining' | 'waiting'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState('');

  const playerName = profile?.display_name || 'Anonymous';

  // Generate position params for a player
  const generatePositionParams = () => {
    const rarity = pickDuelRarity();
    const leverage = randomInRange(rarity.leverageRange[0], rarity.leverageRange[1]);
    const sl = -randomInRange(rarity.slRange[0], rarity.slRange[1]);
    const rr = randomInRange(rarity.rrRange[0], rarity.rrRange[1]);
    const tp = Math.abs(sl) * rr;
    const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    return { rarity: rarity.rarity, leverage, sl, tp, direction };
  };

  // Create room
  const handleCreate = async () => {
    setMode('creating');
    setError('');

    try {
      const { p1Token, p2Token } = pickTwoDifferentTokens();
      const p1Price = await fetchPythPriceById(p1Token.feedId);
      if (!p1Price) throw new Error('Failed to fetch price');
      
      const p2Price = await fetchPythPriceById(p2Token.feedId);
      if (!p2Price) throw new Error('Failed to fetch P2 price');

      const p1Params = generatePositionParams();
      const p2Params = generatePositionParams();
      const code = generateRoomCode();

      const { data, error: dbErr } = await supabase.from('duel_rooms').insert({
        room_code: code,
        ticker: p1Token.ticker,
        feed_id: p1Token.feedId,
        direction: p1Params.direction,
        leverage: p1Params.leverage,
        stop_loss: p1Params.sl,
        take_profit: p1Params.tp,
        rarity: p1Params.rarity,
        entry_price: p1Price,
        p1_ticker: p1Token.ticker,
        p1_feed_id: p1Token.feedId,
        p1_direction: p1Params.direction,
        p1_leverage: p1Params.leverage,
        p1_stop_loss: p1Params.sl,
        p1_take_profit: p1Params.tp,
        p1_rarity: p1Params.rarity,
        p1_entry_price: p1Price,
        p1_name: playerName,
        p1_wallet: walletAddress || null,
        p2_ticker: p2Token.ticker,
        p2_feed_id: p2Token.feedId,
        p2_direction: p2Params.direction,
        p2_leverage: p2Params.leverage,
        p2_stop_loss: p2Params.sl,
        p2_take_profit: p2Params.tp,
        p2_rarity: p2Params.rarity,
        p2_entry_price: p2Price,
        timer_seconds: DUEL_TIMER_SECONDS,
      } as any).select('id').single();

      if (dbErr) throw dbErr;

      setRoomCode(code);
      setRoomId(data.id);
      setMode('waiting');
    } catch (err: any) {
      console.error('Create room error:', err);
      setError(err.message || 'Failed to create room');
      setMode('menu');
    }
  };

  // Join room
  const handleJoin = async () => {
    if (inputCode.length < 4) { setError('Enter room code'); return; }
    setError('');
    setMode('joining');

    try {
      const { data: room, error: findErr } = await supabase
        .from('duel_rooms')
        .select('*')
        .eq('room_code', inputCode.toUpperCase())
        .eq('status', 'waiting')
        .single();

      if (findErr || !room) throw new Error('Room not found or already started');

      const startTime = new Date(Date.now() + 5000).toISOString();
      const { error: joinErr } = await supabase
        .from('duel_rooms')
        .update({
          p2_name: playerName,
          p2_wallet: walletAddress || null,
          status: 'playing',
          started_at: startTime,
        } as any)
        .eq('id', room.id);

      if (joinErr) throw joinErr;

      onRoomReady(room.id, 'p2');
    } catch (err: any) {
      console.error('Join room error:', err);
      setError(err.message || 'Failed to join room');
      setMode('menu');
    }
  };

  // Listen for P2 joining when waiting
  useEffect(() => {
    if (mode !== 'waiting' || !roomId) return;

    const channel = supabase
      .channel(`duel-lobby-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'duel_rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated.status === 'playing') {
          onRoomReady(roomId, 'p1');
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [mode, roomId]);

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="font-display text-3xl sm:text-4xl text-neon-green text-glow-green tracking-wider">
          ⚔️ PVP DUEL
        </h1>
        <p className="text-muted-foreground text-sm mt-2 font-mono">
          1v1 · Different tokens · 60 seconds · Higher PnL wins
        </p>
      </motion.div>

      {mode === 'menu' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col gap-4 w-full max-w-sm"
        >
          <button
            onClick={handleCreate}
            className="arcade-btn arcade-btn-primary text-sm py-4 tracking-wider flex items-center justify-center gap-2"
          >
            <Ico src={imgDuelClassic} size={40} />
            CREATE ROOM
          </button>

          <div className="glass-panel rounded-sm p-4 space-y-3">
            <p className="text-[10px] text-muted-foreground font-display tracking-wider text-center">
              OR JOIN WITH CODE
            </p>
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ENTER CODE"
              className="w-full bg-background/50 border border-border/30 rounded-sm px-4 py-3 text-center font-display text-xl tracking-[0.3em] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-neon-purple/50"
              maxLength={6}
            />
            <button
              onClick={handleJoin}
              disabled={inputCode.length < 4}
              className="arcade-btn w-full text-sm py-3 tracking-wider disabled:opacity-30 flex items-center justify-center gap-2" style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)' }}
            >
              <Ico src={imgJoinDuel} size={40} />
              JOIN DUEL
            </button>
          </div>

          {error && (
            <p className="text-neon-orange text-xs font-mono text-center">{error}</p>
          )}
        </motion.div>
      )}

      {(mode === 'creating' || mode === 'joining') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="text-neon-orange font-display text-sm tracking-wider"
        >
          {mode === 'creating' ? '⏳ CREATING ROOM...' : '⏳ JOINING...'}
        </motion.div>
      )}

      {mode === 'waiting' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="glass-panel rounded-sm p-6 text-center space-y-4">
            <p className="text-[10px] text-muted-foreground font-display tracking-wider">
              SHARE THIS CODE WITH YOUR OPPONENT
            </p>
            <div className="flex items-center justify-center gap-1">
              {roomCode.split('').map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="w-12 h-14 flex items-center justify-center bg-neon-purple/10 border border-neon-purple/30 font-display text-2xl text-neon-purple text-glow-purple"
                >
                  {char}
                </motion.span>
              ))}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(roomCode)}
              className="text-[10px] text-muted-foreground hover:text-neon-purple transition-colors font-mono"
            >
              📋 COPY CODE
            </button>
          </div>

          <motion.p
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-neon-orange font-display text-xs tracking-wider"
          >
            ⏳ WAITING FOR OPPONENT...
          </motion.p>

          <button
            onClick={() => setMode('menu')}
            className="text-[10px] text-muted-foreground hover:text-neon-orange transition-colors font-mono"
          >
            ✕ CANCEL
          </button>
        </motion.div>
      )}
    </div>
  );
}