import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { getMascot } from '@/lib/mascots';
import { getAvatarEmoji } from '@/pages/Profile';
import { REMATCH_TIMEOUT_SECONDS } from '@/lib/duelConstants';
import imgWin from '@/assets/icons/win.png';
import imgPirbed from '@/assets/icons/pirbed.png';
import imgDraw from '@/assets/icons/draw.png';
import imgRematch from '@/assets/icons/rematch.png';
import imgHome from '@/assets/icons/home.png';

const Ico = ({ src, size = 26 }: { src: string; size?: number }) => (
  <img src={src} alt="" width={size} height={size} draggable={false}
    className="inline-block object-contain align-middle shrink-0"
    style={{ imageRendering: 'pixelated' }} />
);

type RematchState = 'idle' | 'requested' | 'opponent_requested' | 'both_ready' | 'creating_room' | 'opponent_left' | 'timeout';

interface PlayerStats {
  trades: number;
  winRate: number;
  totalPnl: number;
}

interface DuelResultProps {
  myName: string;
  opponentName: string;
  myPnl: number;
  opponentPnl: number;
  winner: 'p1' | 'p2' | 'draw';
  playerSlot: 'p1' | 'p2';
  myTicker: string;
  opponentTicker: string;
  myWallet: string | null;
  opponentWallet: string | null;
  onPlayAgain: () => void;
  onHome: () => void;
  roomId?: string;
  /** P1 only: called to create a new room. Must return new roomId or null. */
  onCreateRematchRoom?: () => Promise<string | null>;
  /** P2 only: called when P1 created a room and broadcast the ID */
  onJoinRematchRoom?: (newRoomId: string) => void;
  bestOf?: number;
  currentRound?: number;
  myRoundWins?: number;
  oppRoundWins?: number;
}

export default function DuelResult({
  myName, opponentName, myPnl, opponentPnl, winner, playerSlot,
  myTicker, opponentTicker, myWallet, opponentWallet,
  onPlayAgain, onHome, roomId, onCreateRematchRoom, onJoinRematchRoom,
  bestOf = 1, currentRound = 1, myRoundWins = 0, oppRoundWins = 0,
}: DuelResultProps) {
  const iWon = winner === playerSlot;
  const isDraw = winner === 'draw';

  const [rematchState, setRematchState] = useState<RematchState>('idle');
  const [rematchTimer, setRematchTimer] = useState(REMATCH_TIMEOUT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isSeries = bestOf > 1;

  // ── Stats ─────────────────────────────────────────────────────────
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [oppStats, setOppStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    const fetchGlobalStats = async (wallet: string) => {
      const { data } = await supabase.from('leaderboard').select('pnl_percent').eq('wallet_address', wallet).limit(100);
      if (!data || data.length === 0) return { trades: 0, winRate: 0, totalPnl: 0 };
      const trades = data.length;
      const wins = data.filter(d => d.pnl_percent > 0).length;
      const totalPnl = data.reduce((acc, d) => acc + d.pnl_percent, 0);
      return { trades, winRate: (wins / trades) * 100, totalPnl };
    };
    if (myWallet) fetchGlobalStats(myWallet).then(setMyStats);
    if (opponentWallet) fetchGlobalStats(opponentWallet).then(setOppStats);
  }, [myWallet, opponentWallet]);

  // ── Broadcast channel ─────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`duel-rematch-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'rematch_request' }, (payload) => {
        if (payload.payload?.from !== playerSlot) {
          setRematchState(prev => prev === 'requested' ? 'both_ready' : 'opponent_requested');
        }
      })
      .on('broadcast', { event: 'rematch_accept' }, (payload) => {
        if (payload.payload?.from !== playerSlot) {
          setRematchState('both_ready');
        }
      })
      .on('broadcast', { event: 'new_room' }, (payload) => {
        // P2 receives new room ID from P1
        if (payload.payload?.from !== playerSlot && payload.payload?.newRoomId) {
          if (onJoinRematchRoom) {
            onJoinRematchRoom(payload.payload.newRoomId);
          }
        }
      })
      .on('broadcast', { event: 'player_left' }, (payload) => {
        if (payload.payload?.from !== playerSlot) {
          setRematchState('opponent_left');
          if (timerRef.current) clearInterval(timerRef.current);
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [roomId, playerSlot, onJoinRematchRoom]);

  // ── When both_ready: P1 creates room, P2 waits ───────────────────
  useEffect(() => {
    if (rematchState !== 'both_ready') return;
    if (timerRef.current) clearInterval(timerRef.current);

    // Only P1 creates the room
    if (playerSlot === 'p1' && onCreateRematchRoom) {
      setRematchState('creating_room');
      onCreateRematchRoom().then(newRoomId => {
        if (newRoomId && channelRef.current) {
          // Broadcast the new room ID to P2
          channelRef.current.send({
            type: 'broadcast', event: 'new_room',
            payload: { from: playerSlot, newRoomId },
          });
        } else if (!newRoomId) {
          // Failed — fallback to lobby
          onPlayAgain();
        }
      });
    }
    // P2 just waits for the 'new_room' broadcast (handled above)
  }, [rematchState, playerSlot, onCreateRematchRoom, onPlayAgain]);

  // ── Timeout timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (rematchState !== 'requested' && rematchState !== 'opponent_requested') return;
    setRematchTimer(REMATCH_TIMEOUT_SECONDS);
    timerRef.current = setInterval(() => {
      setRematchTimer(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setRematchState('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [rematchState]);

  // ── Request / Accept ──────────────────────────────────────────────
  const handleRematch = useCallback(() => {
    if (!roomId || !channelRef.current) { onPlayAgain(); return; }

    if (rematchState === 'opponent_requested') {
      channelRef.current.send({
        type: 'broadcast', event: 'rematch_accept',
        payload: { from: playerSlot },
      });
      setRematchState('both_ready');
    } else {
      channelRef.current.send({
        type: 'broadcast', event: 'rematch_request',
        payload: { from: playerSlot },
      });
      setRematchState('requested');
    }
  }, [roomId, playerSlot, rematchState, onPlayAgain]);

  // ── Leave ─────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast', event: 'player_left',
        payload: { from: playerSlot },
      });
    }
    onHome();
  }, [playerSlot, onHome]);

  // ── Stats card ────────────────────────────────────────────────────
  const renderStatsCard = (name: string, stats: PlayerStats | null, side: 'left' | 'right') => {
    const rotateY = side === 'left' ? 15 : -15;
    const accentColor = side === 'left' ? 'bg-neon-purple/40' : 'bg-neon-orange/40';
    return (
      <motion.div
        initial={{ opacity: 0, rotateY, x: side === 'left' ? -50 : 50 }}
        animate={{ opacity: 1, rotateY, x: 0 }}
        transition={{ delay: side === 'left' ? 0.8 : 0.9, type: 'spring', stiffness: 100 }}
        style={{ transformStyle: 'preserve-3d' }}
        className="glass-panel flex flex-col items-center p-6 border-2 border-border/20 rounded-sm w-full max-w-[280px] shadow-2xl relative overflow-hidden hidden md:flex retro-border"
      >
        <div className={`absolute inset-x-0 top-0 h-1 ${accentColor}`} />
        <div className="w-20 h-20 sm:w-24 sm:h-24 mb-4 rounded-sm border-2 border-neon-purple/40 bg-background/80 flex items-center justify-center retro-border shadow-lg z-10">
          <span className="text-5xl">{getAvatarEmoji(name || 'degen')}</span>
        </div>
        <p className="font-display text-xs text-muted-foreground tracking-widest mb-1 uppercase">
          {side === 'left' ? 'YOUR RECORD' : 'OPPONENT RECORD'}
        </p>
        <p className="font-display text-xl text-foreground mb-4 truncate w-full text-center">{name}</p>
        <div className="flex flex-col w-full gap-2 mt-2 font-mono text-sm">
          <div className="flex justify-between items-center bg-background/40 p-2 border border-border/10 rounded-sm">
            <span className="text-muted-foreground uppercase text-[10px]">Games</span>
            <span className="text-foreground">{stats ? stats.trades : '-'}</span>
          </div>
          <div className="flex justify-between items-center bg-background/40 p-2 border border-border/10 rounded-sm">
            <span className="text-muted-foreground uppercase text-[10px]">Win Rate</span>
            <span className={stats && stats.winRate >= 50 ? 'text-neon-green text-glow-green' : 'text-neon-orange'}>
              {stats ? `${stats.winRate.toFixed(1)}%` : '-'}
            </span>
          </div>
          <div className="flex justify-between items-center bg-background/40 p-2 border border-border/10 rounded-sm">
            <span className="text-muted-foreground uppercase text-[10px]">Overall PNL</span>
            <span className={stats && stats.totalPnl >= 0 ? 'text-neon-green text-glow-green' : 'text-neon-orange'}>
              {stats ? `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}%` : '-'}
            </span>
          </div>
        </div>
      </motion.div>
    );
  };

  const showRematchBtn = rematchState !== 'both_ready' && rematchState !== 'opponent_left' && rematchState !== 'creating_room';

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 p-4">
      {/* Header */}
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150 }} className="text-center">
        {isDraw ? (
          <div className="flex items-center gap-3">
            <Ico src={imgDraw} size={48} />
            <h1 className="font-display text-4xl sm:text-5xl text-neon-orange text-glow-orange tracking-wider">DRAW!</h1>
            <Ico src={imgDraw} size={48} />
          </div>
        ) : iWon ? (
          <div className="flex items-center gap-3">
            <Ico src={imgWin} size={48} />
            <h1 className="font-display text-4xl sm:text-5xl text-neon-green text-glow-green tracking-wider animate-rainbow">YOU WIN!</h1>
            <Ico src={imgWin} size={48} />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Ico src={imgPirbed} size={48} />
            <h1 className="font-display text-4xl sm:text-5xl text-neon-orange text-glow-orange tracking-wider">PIRBED!</h1>
            <Ico src={imgPirbed} size={48} />
          </div>
        )}
      </motion.div>

      {/* Mascot */}
      <motion.img src={getMascot(iWon ? 'win' : isDraw ? 'duel' : 'lose')} alt="Pirb"
        className="w-20 h-20 object-contain"
        initial={{ x: iWon ? 300 : -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 0.2 }}
        style={{ filter: iWon ? 'drop-shadow(0 0 20px #07e46e)' : 'drop-shadow(0 0 20px #f97316)',
          transform: !iWon && !isDraw ? 'scaleX(-1)' : undefined }} />

      {/* Bo3 score */}
      {isSeries && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="flex items-center gap-4 font-display text-sm tracking-wider">
          <span className="text-neon-green">{myName}: {myRoundWins}</span>
          <span className="text-muted-foreground">ROUND {currentRound}/{bestOf}</span>
          <span className="text-neon-orange">{opponentName}: {oppRoundWins}</span>
        </motion.div>
      )}

      {/* Stats + PnL layout */}
      <div className="flex flex-col xl:flex-row items-center justify-center gap-8 w-full max-w-6xl mt-2" style={{ perspective: '1200px' }}>
        {/* Left: My stats */}
        {renderStatsCard(myName, myStats, 'left')}

        {/* Center: PnL comparison */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="glass-panel rounded-sm p-6 w-full max-w-md retro-border shadow-xl z-10 bg-background/90">
          <div className="flex items-center justify-between gap-4">
            <div className={`flex-1 text-center p-4 rounded-sm border ${
              iWon ? 'border-neon-green/40 bg-neon-green/5' : isDraw ? 'border-neon-orange/40 bg-neon-orange/5' : 'border-border/20'}`}>
              <p className="text-[10px] text-muted-foreground font-display tracking-wider mb-1">YOU · {myTicker}</p>
              <p className="font-display text-sm text-foreground mb-2 truncate">{myName}</p>
              <p className={`font-mono text-3xl sm:text-4xl font-bold ${myPnl >= 0 ? 'text-neon-green' : 'text-neon-orange'}`}>
                {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(2)}%</p>
            </div>
            <span className="font-display text-lg text-muted-foreground mx-2">VS</span>
            <div className={`flex-1 text-center p-4 rounded-sm border ${
              !iWon && !isDraw ? 'border-neon-green/40 bg-neon-green/5' : isDraw ? 'border-neon-orange/40 bg-neon-orange/5' : 'border-border/20'}`}>
              <p className="text-[10px] text-muted-foreground font-display tracking-wider mb-1">OPP · {opponentTicker}</p>
              <p className="font-display text-sm text-foreground mb-2 truncate">{opponentName}</p>
              <p className={`font-mono text-3xl sm:text-4xl font-bold ${opponentPnl >= 0 ? 'text-neon-green' : 'text-neon-orange'}`}>
                {opponentPnl >= 0 ? '+' : ''}{opponentPnl.toFixed(2)}%</p>
            </div>
          </div>
        </motion.div>

        {/* Right: Opponent stats */}
        {renderStatsCard(opponentName, oppStats, 'right')}
      </div>

      {/* Rematch notifications */}
      <AnimatePresence mode="wait">
        {rematchState === 'opponent_requested' && (
          <motion.div key="opp-req" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-panel rounded-sm p-3 border border-neon-green/40 bg-neon-green/5 text-center">
            <p className="font-display text-sm text-neon-green tracking-wider animate-pulse">
              ⚔️ {opponentName.toUpperCase()} WANTS REMATCH!</p>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">{rematchTimer}s — click REMATCH to accept</p>
          </motion.div>
        )}
        {rematchState === 'requested' && (
          <motion.div key="my-req" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
            <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}
              className="font-display text-xs text-neon-orange tracking-wider">
              ⏳ WAITING FOR {opponentName.toUpperCase()}... ({rematchTimer}s)</motion.p>
          </motion.div>
        )}
        {(rematchState === 'both_ready' || rematchState === 'creating_room') && (
          <motion.div key="both" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <p className="font-display text-lg text-neon-green text-glow-green tracking-wider animate-pulse">
              ✅ REMATCH CONFIRMED — STARTING...</p>
          </motion.div>
        )}
        {rematchState === 'opponent_left' && (
          <motion.div key="left" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-sm p-3 border border-neon-orange/40 bg-neon-orange/5 text-center">
            <p className="font-display text-sm text-neon-orange tracking-wider">
              🚪 {opponentName.toUpperCase()} DISCONNECTED</p>
          </motion.div>
        )}
        {rematchState === 'timeout' && (
          <motion.div key="timeout" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <p className="font-display text-xs text-muted-foreground tracking-wider">⏰ REMATCH TIMED OUT</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buttons */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex gap-4">
        {showRematchBtn && (
          <button
            onClick={rematchState === 'idle' || rematchState === 'opponent_requested' ? handleRematch : undefined}
            disabled={rematchState === 'requested' || rematchState === 'timeout'}
            className={`arcade-btn arcade-btn-primary text-[10px] py-3 px-6 flex items-center gap-2 ${
              rematchState === 'requested' || rematchState === 'timeout' ? 'opacity-40 cursor-not-allowed' : ''
            } ${rematchState === 'opponent_requested' ? 'animate-pulse ring-2 ring-neon-green/50' : ''}`}>
            <Ico src={imgRematch} size={48} />
            {rematchState === 'requested' ? 'WAITING...' :
             rematchState === 'opponent_requested' ? 'ACCEPT!' : 'REMATCH'}
          </button>
        )}
        <button onClick={handleLeave} className="arcade-btn text-[10px] py-3 px-6 flex items-center gap-2">
          <Ico src={imgHome} size={48} />
          {rematchState === 'opponent_left' || rematchState === 'timeout' ? 'BACK' : 'LEAVE'}
        </button>
      </motion.div>
    </div>
  );
}