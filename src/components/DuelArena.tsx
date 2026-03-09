import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import LiveTradePanel, { type DegenPosition } from '@/components/LiveTradePanel';
import OpponentPanel from '@/components/OpponentPanel';
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
  const [oppCandles, setOppCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [started, setStarted] = useState(false);
  const [myPnl, setMyPnl] = useState(0);
  const [opponentPnl, setOpponentPnl] = useState(0);
  const [opponentClosed, setOpponentClosed] = useState(false);
  const [myClosed, setMyClosed] = useState(false);
  const [finished, setFinished] = useState(false);
  const pnlUpdateInterval = useRef<number>(0);
  const lastSyncedPnl = useRef(0);

  const opponentSlot = playerSlot === 'p1' ? 'p2' : 'p1';
  const myName = room ? (room[`${playerSlot}_name`] || 'You') : 'You';
  const opponentName = room ? (room[`${opponentSlot}_name`] || '???') : '???';

  // Per-player fields helper
  const getPlayerField = (r: any, slot: string, field: string, fallback?: string) =>
    r[`${slot}_${field}`] || r[fallback || field] || '';

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

      const ticker = getPlayerField(r, playerSlot, 'ticker');
      const feedId = getPlayerField(r, playerSlot, 'feed_id');
      const direction = getPlayerField(r, playerSlot, 'direction');
      const leverage = r[`${playerSlot}_leverage`] || r.leverage;
      const stopLoss = r[`${playerSlot}_stop_loss`] || r.stop_loss;
      const takeProfit = r[`${playerSlot}_take_profit`] || r.take_profit;
      const rarity = getPlayerField(r, playerSlot, 'rarity');

      setPosition({
        id: Date.now(),
        asset: ticker,
        ticker,
        feedId,
        direction: direction as 'LONG' | 'SHORT',
        leverage,
        stopLoss,
        takeProfit,
        rarity: rarity as any,
      });

      // Load candles for both players
      const oppFeedId = getPlayerField(r, opponentSlot, 'feed_id');
      const [myC, oppC] = await Promise.all([
        fetchHistoricalCandles(feedId, 10, 5).catch(() => []),
        fetchHistoricalCandles(oppFeedId, 10, 5).catch(() => []),
      ]);
      setInitialCandles(myC);
      setOppCandles(oppC);
      setLoading(false);
    };
    load();
  }, [roomId, playerSlot]);

  // 3-2-1 countdown then start
  useEffect(() => {
    if (loading) return;
    if (countdown <= 0) {
      setStarted(true);
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [loading, countdown]);

  // Subscribe to opponent updates
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
        setOpponentPnl(updated[`${opponentSlot}_pnl`] || 0);

        if (updated[`${opponentSlot}_closed`]) {
          setOpponentClosed(true);
        }

        if (updated.status === 'finished') {
          setRoom((prev: any) => prev ? { ...prev, ...updated } : prev);
          setFinished(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room, roomId, opponentSlot]);

  // Sync my PnL every 2s
  useEffect(() => {
    if (!started || finished || myClosed) return;

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
  }, [started, myPnl, finished, myClosed, playerSlot, roomId]);

  const handleResult = useCallback(async (status: 'WIN' | 'REKT', pnl: number) => {
    setMyPnl(pnl);
    setMyClosed(true);
    await supabase
      .from('duel_rooms')
      .update({
        [`${playerSlot}_pnl`]: Number(pnl.toFixed(2)),
        [`${playerSlot}_closed`]: true,
        [`${playerSlot}_closed_at`]: new Date().toISOString(),
      } as any)
      .eq('id', roomId);
    checkBothClosed(pnl);
  }, [playerSlot, roomId]);

  const handleExitEarly = useCallback(async (pnl: number) => {
    setMyPnl(pnl);
    setMyClosed(true);
    await supabase
      .from('duel_rooms')
      .update({
        [`${playerSlot}_pnl`]: Number(pnl.toFixed(2)),
        [`${playerSlot}_closed`]: true,
        [`${playerSlot}_closed_at`]: new Date().toISOString(),
      } as any)
      .eq('id', roomId);
    checkBothClosed(pnl);
  }, [playerSlot, roomId]);

  const checkBothClosed = async (myFinalPnl: number) => {
    const { data: latest } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
    if (latest) {
      const r = latest as any;
      if (r.p1_closed && r.p2_closed) {
        const winner = r.p1_pnl > r.p2_pnl ? 'p1' : r.p2_pnl > r.p1_pnl ? 'p2' : 'draw';
        await supabase.from('duel_rooms').update({ status: 'finished', winner } as any).eq('id', roomId);
      }
    }
  };

  useEffect(() => {
    if (!finished || !room) return;
    onFinished(room);
  }, [finished, room]);

  const entryPrice = room ? (room[`${playerSlot}_entry_price`] || room.entry_price) : 0;

  // Opponent fields
  const oppTicker = room ? getPlayerField(room, opponentSlot, 'ticker') : '';
  const oppFeedId = room ? getPlayerField(room, opponentSlot, 'feed_id') : '';
  const oppDirection = room ? (getPlayerField(room, opponentSlot, 'direction') as 'LONG' | 'SHORT') : 'LONG';
  const oppLeverage = room ? (room[`${opponentSlot}_leverage`] || room.leverage) : 1;
  const oppStopLoss = room ? (room[`${opponentSlot}_stop_loss`] || room.stop_loss) : -10;
  const oppTakeProfit = room ? (room[`${opponentSlot}_take_profit`] || room.take_profit) : 20;
  const oppRarity = room ? getPlayerField(room, opponentSlot, 'rarity') : 'common';
  const oppEntryPrice = room ? (room[`${opponentSlot}_entry_price`] || room.entry_price) : 0;

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

  // Countdown overlay
  if (!started) {
    return (
      <div className="flex items-center justify-center flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={countdown}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            {countdown > 0 ? (
              <span className="font-display text-7xl text-neon-purple text-glow-purple">{countdown}</span>
            ) : (
              <span className="font-display text-4xl text-neon-green text-glow-green tracking-wider">GO!</span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      {/* Top scoreboard */}
      <div className="glass-panel rounded-sm px-3 py-1 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm text-neon-purple text-glow-purple">⚔️</span>
            <span className="text-[10px] font-mono text-muted-foreground">{room.room_code}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase">YOU · {position.ticker}</p>
              <p className={`font-mono text-sm font-bold ${myPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(2)}%
                {myClosed && <span className="text-[7px] ml-1 text-muted-foreground">CLOSED</span>}
              </p>
            </div>
            <span className="font-display text-base text-neon-orange text-glow-orange">VS</span>
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase">{opponentName} · {oppTicker}</p>
              <p className={`font-mono text-sm font-bold ${opponentPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                {opponentPnl >= 0 ? '+' : ''}{opponentPnl.toFixed(2)}%
                {opponentClosed && <span className="text-[7px] ml-1 text-muted-foreground">CLOSED</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Split screen: my chart + opponent chart */}
      <div className="flex flex-1 min-h-0 gap-1">
        {/* My panel */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          <LiveTradePanel
            position={position}
            entryPrice={entryPrice}
            initialCandles={initialCandles}
            onResult={handleResult}
            onExitEarly={handleExitEarly}
            playerName={myName}
            walletAddress={null}
            timerSeconds={DUEL_TIMER_SECONDS}
          />
        </div>

        {/* Opponent panel */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          <OpponentPanel
            ticker={oppTicker}
            feedId={oppFeedId}
            direction={oppDirection}
            leverage={oppLeverage}
            stopLoss={oppStopLoss}
            takeProfit={oppTakeProfit}
            rarity={oppRarity}
            entryPrice={oppEntryPrice}
            initialCandles={oppCandles}
            opponentName={opponentName}
            opponentPnl={opponentPnl}
            opponentClosed={opponentClosed}
            started={started}
          />
        </div>
      </div>
    </div>
  );
}
