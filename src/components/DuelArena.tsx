import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import LiveTradePanel, { type DegenPosition } from '@/components/LiveTradePanel';
import { type Candle } from '@/components/PriceChart';
import { fetchHistoricalCandles } from '@/lib/pyth';
import { DUEL_TIMER_SECONDS } from '@/lib/duelConstants';

interface DuelArenaProps {
  roomId: string;
  playerSlot: 'p1' | 'p2';
  onFinished: (room: any) => void;
}

export default function DuelArena({ roomId, playerSlot, onFinished }: DuelArenaProps) {
  const [room, setRoom] = useState<any>(null);
  const [position, setPosition] = useState<DegenPosition | null>(null);
  const [initialCandles, setInitialCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPnl, setMyPnl] = useState(0);
  const [opponentPnl, setOpponentPnl] = useState(0);
  const [finished, setFinished] = useState(false);
  const pnlUpdateInterval = useRef<number>(0);
  const lastSyncedPnl = useRef(0);

  const opponentSlot = playerSlot === 'p1' ? 'p2' : 'p1';
  const myName = room ? room[`${playerSlot}_name`] : '';
  const opponentName = room ? room[`${opponentSlot}_name`] : '???';
  const myTicker = room ? (room[`${playerSlot}_ticker`] || room.ticker) : '';
  const opponentTicker = room ? (room[`${opponentSlot}_ticker`] || room.ticker) : '';

  // Load room data
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('duel_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!data) return;
      const r = data as any;
      setRoom(r);

      // Use per-player fields
      const ticker = r[`${playerSlot}_ticker`] || r.ticker;
      const feedId = r[`${playerSlot}_feed_id`] || r.feed_id;
      const direction = r[`${playerSlot}_direction`] || r.direction;
      const leverage = r[`${playerSlot}_leverage`] || r.leverage;
      const stopLoss = r[`${playerSlot}_stop_loss`] || r.stop_loss;
      const takeProfit = r[`${playerSlot}_take_profit`] || r.take_profit;
      const rarity = r[`${playerSlot}_rarity`] || r.rarity;

      const pos: DegenPosition = {
        id: Date.now(),
        asset: ticker,
        ticker,
        feedId,
        direction: direction as 'LONG' | 'SHORT',
        leverage,
        stopLoss,
        takeProfit,
        rarity: rarity as any,
      };
      setPosition(pos);

      let candles: Candle[] = [];
      try {
        candles = await fetchHistoricalCandles(feedId, 10, 5);
      } catch {}
      setInitialCandles(candles);
      setLoading(false);
    };
    load();
  }, [roomId, playerSlot]);

  // Subscribe to opponent PnL updates
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
          setRoom((prev: any) => prev ? { ...prev, ...updated } : prev);
          setFinished(true);
        }

        if (oppClosed) {
          setRoom((prev: any) => prev ? { ...prev, [`${opponentSlot}_closed`]: true, [`${opponentSlot}_pnl`]: oppPnl } : prev);
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
          .update({ [`${playerSlot}_pnl`]: Number(myPnl.toFixed(2)) } as any)
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
      } as any)
      .eq('id', roomId);
  }, [playerSlot, roomId]);

  // Handle early exit
  const handleExitEarly = useCallback(async (pnl: number) => {
    setMyPnl(pnl);
    await supabase
      .from('duel_rooms')
      .update({
        [`${playerSlot}_pnl`]: Number(pnl.toFixed(2)),
        [`${playerSlot}_closed`]: true,
        [`${playerSlot}_closed_at`]: new Date().toISOString(),
      } as any)
      .eq('id', roomId);

    const { data: latest } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
    if (latest) {
      const r = latest as any;
      if (r.p1_closed && r.p2_closed) {
        const winner = r.p1_pnl > r.p2_pnl ? 'p1' : r.p2_pnl > r.p1_pnl ? 'p2' : 'draw';
        await supabase.from('duel_rooms').update({ status: 'finished', winner } as any).eq('id', roomId);
      }
    }
  }, [playerSlot, roomId]);

  // When finished, notify parent
  useEffect(() => {
    if (!finished || !room) return;
    onFinished(room);
  }, [finished, room]);

  const entryPrice = room ? (room[`${playerSlot}_entry_price`] || room.entry_price) : 0;

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
      {/* Duel header with PnL scoreboard */}
      <div className="glass-panel rounded-sm px-3 py-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-base text-neon-purple text-glow-purple">⚔️ DUEL</span>
            <span className="text-[10px] font-mono text-muted-foreground">{room.room_code}</span>
          </div>
          <div className="flex items-center gap-4">
            {/* My PnL */}
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase">YOU · {myTicker}</p>
              <p className={`font-mono text-base font-bold ${myPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(2)}%
              </p>
            </div>
            <span className="font-display text-lg text-neon-orange text-glow-orange">VS</span>
            {/* Opponent PnL */}
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase">{opponentName} · {opponentTicker}</p>
              <p className={`font-mono text-base font-bold ${opponentPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
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
          entryPrice={entryPrice}
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
