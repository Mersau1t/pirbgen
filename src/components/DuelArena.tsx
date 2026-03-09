import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import LiveTradePanel, { type DegenPosition } from '@/components/LiveTradePanel';
import { type Candle } from '@/components/PriceChart';
import { fetchHistoricalCandles } from '@/lib/pyth';
import { DUEL_TIMER_SECONDS } from '@/lib/duelConstants';

interface DuelRoom {
  id: string;
  room_code: string;
  ticker: string;
  feed_id: string;
  direction: string;
  leverage: number;
  stop_loss: number;
  take_profit: number;
  rarity: string;
  entry_price: number;
  p1_name: string;
  p2_name: string;
  p1_pnl: number;
  p2_pnl: number;
  p1_closed: boolean;
  p2_closed: boolean;
  status: string;
  winner: string | null;
  started_at: string;
}

interface DuelArenaProps {
  roomId: string;
  playerSlot: 'p1' | 'p2';
  onFinished: (room: DuelRoom) => void;
}

export default function DuelArena({ roomId, playerSlot, onFinished }: DuelArenaProps) {
  const [room, setRoom] = useState<DuelRoom | null>(null);
  const [position, setPosition] = useState<DegenPosition | null>(null);
  const [initialCandles, setInitialCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPnl, setMyPnl] = useState(0);
  const [opponentPnl, setOpponentPnl] = useState(0);
  const [finished, setFinished] = useState(false);
  const pnlUpdateInterval = useRef<number>(0);
  const lastSyncedPnl = useRef(0);

  const opponentSlot = playerSlot === 'p1' ? 'p2' : 'p1';
  const myName = playerSlot === 'p1' ? room?.p1_name : room?.p2_name;
  const opponentName = playerSlot === 'p1' ? room?.p2_name : room?.p1_name;

  // Load room data
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('duel_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!data) return;
      const r = data as unknown as DuelRoom;
      setRoom(r);

      const pos: DegenPosition = {
        id: Date.now(),
        asset: r.ticker,
        ticker: r.ticker,
        feedId: r.feed_id,
        direction: r.direction as 'LONG' | 'SHORT',
        leverage: r.leverage,
        stopLoss: r.stop_loss,
        takeProfit: r.take_profit,
        rarity: r.rarity as any,
      };
      setPosition(pos);

      // Load historical candles
      let candles: Candle[] = [];
      try {
        candles = await fetchHistoricalCandles(r.feed_id, 10, 5);
      } catch {}
      setInitialCandles(candles);
      setLoading(false);
    };
    load();
  }, [roomId]);

  // Subscribe to opponent PnL updates via Realtime
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`duel-arena-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'duel_rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        const updated = payload.new as any;
        const oppPnl = updated[`${opponentSlot}_pnl`];
        const oppClosed = updated[`${opponentSlot}_closed`];
        setOpponentPnl(oppPnl || 0);

        if (updated.status === 'finished') {
          setRoom(prev => prev ? { ...prev, ...updated } : prev);
          setFinished(true);
        }

        if (oppClosed) {
          setRoom(prev => prev ? { ...prev, [`${opponentSlot}_closed`]: true, [`${opponentSlot}_pnl`]: oppPnl } : prev);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room, roomId, opponentSlot]);

  // Sync my PnL to DB every 2 seconds
  useEffect(() => {
    if (!room || finished) return;

    pnlUpdateInterval.current = window.setInterval(async () => {
      if (Math.abs(myPnl - lastSyncedPnl.current) > 0.01) {
        lastSyncedPnl.current = myPnl;
        await supabase
          .from('duel_rooms')
          .update({ [`${playerSlot}_pnl`]: Number(myPnl.toFixed(2)) })
          .eq('id', roomId);
      }
    }, 2000);

    return () => clearInterval(pnlUpdateInterval.current);
  }, [room, myPnl, finished, playerSlot, roomId]);

  // Handle trade result (SL/TP hit)
  const handleResult = useCallback(async (status: 'WIN' | 'REKT', pnl: number) => {
    setMyPnl(pnl);
    await supabase
      .from('duel_rooms')
      .update({
        [`${playerSlot}_pnl`]: Number(pnl.toFixed(2)),
        [`${playerSlot}_closed`]: true,
        [`${playerSlot}_closed_at`]: new Date().toISOString(),
      })
      .eq('id', roomId);
  }, [playerSlot, roomId]);

  // Handle early exit (close button or timer)
  const handleExitEarly = useCallback(async (pnl: number) => {
    setMyPnl(pnl);
    await supabase
      .from('duel_rooms')
      .update({
        [`${playerSlot}_pnl`]: Number(pnl.toFixed(2)),
        [`${playerSlot}_closed`]: true,
        [`${playerSlot}_closed_at`]: new Date().toISOString(),
      })
      .eq('id', roomId);

    // Check if both closed → finish
    const { data: latest } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
    if (latest) {
      const r = latest as any;
      if (r.p1_closed && r.p2_closed) {
        const winner = r.p1_pnl > r.p2_pnl ? 'p1' : r.p2_pnl > r.p1_pnl ? 'p2' : 'draw';
        await supabase.from('duel_rooms').update({ status: 'finished', winner }).eq('id', roomId);
      }
    }
  }, [playerSlot, roomId]);

  // When timer expires and both are done, determine winner
  useEffect(() => {
    if (!finished || !room) return;
    onFinished(room);
  }, [finished, room]);

  if (loading || !position || !room) {
    return (
      <div className="flex items-center justify-center flex-1">
        <motion.p
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="text-neon-orange font-display text-sm tracking-wider"
        >
          ⏳ LOADING DUEL...
        </motion.p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      {/* Duel header */}
      <div className="glass-panel rounded-sm px-4 py-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg text-neon-purple text-glow-purple">⚔️ DUEL</span>
            <span className="text-[10px] font-mono text-muted-foreground">{room.room_code}</span>
          </div>
          <div className="flex items-center gap-6">
            {/* My PnL */}
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase">YOU ({myName})</p>
              <p className={`font-mono text-lg font-bold ${myPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(2)}%
              </p>
            </div>
            {/* VS */}
            <span className="font-display text-xl text-neon-orange text-glow-orange">VS</span>
            {/* Opponent PnL */}
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase">{opponentName || '???'}</p>
              <p className={`font-mono text-lg font-bold ${opponentPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                {opponentPnl >= 0 ? '+' : ''}{opponentPnl.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main trade panel */}
      <div className="flex-1 min-h-0">
        <LiveTradePanel
          position={position}
          entryPrice={room.entry_price}
          initialCandles={initialCandles}
          onResult={handleResult}
          onExitEarly={handleExitEarly}
          playerName={myName || 'Anonymous'}
          walletAddress={null}
          timerSeconds={DUEL_TIMER_SECONDS}
        />
      </div>
    </div>
  );
}
