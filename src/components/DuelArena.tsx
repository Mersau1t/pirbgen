import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import LiveTradePanel, { type DegenPosition } from '@/components/LiveTradePanel';
import SpectatorChart from '@/components/SpectatorChart';
import AbilityBar from '@/components/AbilityBar';
import AbilityEffects from '@/components/AbilityEffects';
import { type Candle } from '@/components/PriceChart';
import { fetchHistoricalCandles } from '@/lib/pyth';
import { DUEL_TIMER_SECONDS } from '@/lib/duelConstants';
import { useDuelAbilities, type AbilityEvent, type AbilityId, ABILITY_DEFS } from '@/hooks/useDuelAbilities';

interface DuelArenaProps {
  roomId: string;
  playerSlot: 'p1' | 'p2';
  onFinished: (room: any) => void;
  abilitiesMode?: boolean;
}

export default function DuelArena({ roomId, playerSlot, onFinished, abilitiesMode = false }: DuelArenaProps) {
  const [room, setRoom] = useState<any>(null);
  const [myPosition, setMyPosition] = useState<DegenPosition | null>(null);
  const [oppPosition, setOppPosition] = useState<DegenPosition | null>(null);
  const [myCandles, setMyCandles] = useState<Candle[]>([]);
  const [oppCandles, setOppCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [myPnl, setMyPnl] = useState(0);
  const [oppPnl, setOppPnl] = useState(0);
  const [opponentClosed, setOpponentClosed] = useState(false);
  const [myClosed, setMyClosed] = useState(false);
  const [finished, setFinished] = useState(false);
  const pnlUpdateInterval = useRef<number>(0);
  const lastSyncedPnl = useRef(0);
  const countdownRef = useRef<number>(0);

  // Track my outgoing attack abilities → show effects on opponent's chart panel
  const [myLastAttackEvent, setMyLastAttackEvent] = useState<AbilityEvent | null>(null);
  // Track if pirb rage was sent BY ME (to show on opp chart)
  const [sentPirbRage, setSentPirbRage] = useState(false);

  const opponentSlot = playerSlot === 'p1' ? 'p2' : 'p1';
  const myName = room ? (room[`${playerSlot}_name`] || 'You') : 'You';
  const opponentName = room ? (room[`${opponentSlot}_name`] || '???') : '???';

  const getField = (r: any, slot: string, field: string) =>
    r[`${slot}_${field}`] || r[field] || '';
  const getNumField = (r: any, slot: string, field: string) =>
    r[`${slot}_${field}`] ?? r[field] ?? 0;

  // ── Abilities hook ────────────────────────────────────────────────
  const abilities = useDuelAbilities(
    roomId, playerSlot, myPosition?.ticker || '',
    abilitiesMode && started && !finished,
  );

  // Wrap useAbility to also track outgoing attacks for visual on opp panel
  const handleUseAbility = useCallback((id: AbilityId) => {
    abilities.useAbility(id);

    const def = ABILITY_DEFS.find(a => a.id === id);
    if (def?.target === 'opponent') {
      const event: AbilityEvent = { abilityId: id, from: playerSlot, timestamp: Date.now() };
      setMyLastAttackEvent(event);

      if (id === 'pirb_rage') {
        setSentPirbRage(true);
        setTimeout(() => setSentPirbRage(false), 5000);
      }
    }
  }, [abilities.useAbility, playerSlot]);

  // Load room
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
      if (!data) return;
      const r = data as any;
      setRoom(r);

      setMyPosition({
        id: Date.now(),
        asset: getField(r, playerSlot, 'ticker'),
        ticker: getField(r, playerSlot, 'ticker'),
        feedId: getField(r, playerSlot, 'feed_id'),
        direction: (getField(r, playerSlot, 'direction') || 'LONG') as 'LONG' | 'SHORT',
        leverage: getNumField(r, playerSlot, 'leverage'),
        stopLoss: getNumField(r, playerSlot, 'stop_loss'),
        takeProfit: getNumField(r, playerSlot, 'take_profit'),
        rarity: (getField(r, playerSlot, 'rarity') || 'common') as any,
      });

      setOppPosition({
        id: Date.now() + 1,
        asset: getField(r, opponentSlot, 'ticker'),
        ticker: getField(r, opponentSlot, 'ticker'),
        feedId: getField(r, opponentSlot, 'feed_id'),
        direction: (getField(r, opponentSlot, 'direction') || 'LONG') as 'LONG' | 'SHORT',
        leverage: getNumField(r, opponentSlot, 'leverage'),
        stopLoss: getNumField(r, opponentSlot, 'stop_loss'),
        takeProfit: getNumField(r, opponentSlot, 'take_profit'),
        rarity: (getField(r, opponentSlot, 'rarity') || 'common') as any,
      });

      const [mC, oC] = await Promise.all([
        fetchHistoricalCandles(getField(r, playerSlot, 'feed_id'), 10, 5).catch(() => []),
        fetchHistoricalCandles(getField(r, opponentSlot, 'feed_id'), 10, 5).catch(() => []),
      ]);
      setMyCandles(mC);
      setOppCandles(oC);
      setLoading(false);
    };
    load();
  }, [roomId, playerSlot]);

  // Countdown
  useEffect(() => {
    if (loading || !room?.started_at) return;
    const startTime = new Date(room.started_at).getTime();
    const tick = () => {
      const diff = startTime - Date.now();
      if (diff <= 0) { setCountdown(0); setStarted(true); clearInterval(countdownRef.current); return; }
      setCountdown(Math.ceil(diff / 1000));
    };
    tick();
    countdownRef.current = window.setInterval(tick, 100);
    return () => clearInterval(countdownRef.current);
  }, [loading, room?.started_at]);

  // Realtime opponent
  useEffect(() => {
    if (!room) return;
    const channel = supabase.channel(`duel-arena-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'duel_rooms', filter: `id=eq.${roomId}`,
      }, (payload) => {
        const u = payload.new as any;
        if (u[`${opponentSlot}_closed`] && !opponentClosed) {
          setOpponentClosed(true);
          if (u[`${opponentSlot}_pnl`] != null) setOppPnl(u[`${opponentSlot}_pnl`]);
        }
        if (u[`${playerSlot}_closed`] && !myClosed) setMyClosed(true);
        if (u.status === 'finished') { setRoom((p: any) => p ? { ...p, ...u } : u); setFinished(true); }
        if (u[`${opponentSlot}_closed`] && myClosed && u.status !== 'finished') checkBothClosed();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room, roomId, opponentSlot, playerSlot, opponentClosed, myClosed]);

  // Polling fallback
  useEffect(() => {
    if (!myClosed || finished) return;
    const pollId = setInterval(async () => {
      const { data } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
      if (data) {
        const r = data as any;
        if (r.status === 'finished') { setRoom(r); setFinished(true); clearInterval(pollId); }
        else if (r.p1_closed && r.p2_closed) {
          const winner = r.p1_pnl > r.p2_pnl ? 'p1' : r.p2_pnl > r.p1_pnl ? 'p2' : 'draw';
          await supabase.from('duel_rooms').update({ status: 'finished', winner } as any).eq('id', roomId);
        }
      }
    }, 3000);
    return () => clearInterval(pollId);
  }, [myClosed, finished, roomId]);

  // Sync PnL
  useEffect(() => {
    if (!started || finished || myClosed) return;
    pnlUpdateInterval.current = window.setInterval(async () => {
      if (Math.abs(myPnl - lastSyncedPnl.current) > 0.01) {
        lastSyncedPnl.current = myPnl;
        await supabase.from('duel_rooms').update({ [`${playerSlot}_pnl`]: Number(myPnl.toFixed(2)) } as any).eq('id', roomId);
      }
    }, 2000);
    return () => clearInterval(pnlUpdateInterval.current);
  }, [started, myPnl, finished, myClosed, playerSlot, roomId]);

  const handleMyPnlChange = useCallback((pnl: number) => setMyPnl(pnl), []);

  const handleResult = useCallback(async (_status: 'WIN' | 'REKT', pnl: number) => {
    setMyPnl(pnl); setMyClosed(true);
    await supabase.from('duel_rooms').update({
      [`${playerSlot}_pnl`]: Number(pnl.toFixed(2)),
      [`${playerSlot}_closed`]: true,
      [`${playerSlot}_closed_at`]: new Date().toISOString(),
    } as any).eq('id', roomId);
    checkBothClosed();
  }, [playerSlot, roomId]);

  const handleExitEarly = useCallback(async (pnl: number) => {
    setMyPnl(pnl); setMyClosed(true);
    await supabase.from('duel_rooms').update({
      [`${playerSlot}_pnl`]: Number(pnl.toFixed(2)),
      [`${playerSlot}_closed`]: true,
      [`${playerSlot}_closed_at`]: new Date().toISOString(),
    } as any).eq('id', roomId);
    checkBothClosed();
  }, [playerSlot, roomId]);

  const checkBothClosed = async () => {
    const { data } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
    if (data) {
      const r = data as any;
      if (r.p1_closed && r.p2_closed) {
        const winner = r.p1_pnl > r.p2_pnl ? 'p1' : r.p2_pnl > r.p1_pnl ? 'p2' : 'draw';
        await supabase.from('duel_rooms').update({ status: 'finished', winner } as any).eq('id', roomId);
      }
    }
  };

  useEffect(() => {
    if (!finished) return;
    (async () => {
      const { data } = await supabase.from('duel_rooms').select('*').eq('id', roomId).single();
      onFinished(data || room);
    })();
  }, [finished]);

  const myEntryPrice = room ? getNumField(room, playerSlot, 'entry_price') : 0;
  const oppEntryPrice = room ? getNumField(room, opponentSlot, 'entry_price') : 0;

  if (loading || !myPosition || !oppPosition || !room) {
    return (
      <div className="flex items-center justify-center flex-1">
        <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }}
          className="text-neon-orange font-display text-sm tracking-wider">⏳ LOADING DUEL...</motion.p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="flex items-center justify-center flex-1">
        <AnimatePresence mode="wait">
          {countdown === null ? (
            <motion.p key="sync" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }}
              className="text-neon-orange font-display text-sm tracking-wider">⏳ SYNCING...</motion.p>
          ) : countdown > 0 ? (
            <motion.div key={countdown} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.4 }} className="text-center">
              <span className="font-display text-7xl text-neon-purple text-glow-purple">{countdown}</span>
            </motion.div>
          ) : (
            <motion.div key="go" initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.4 }} className="text-center">
              <span className="font-display text-4xl text-neon-green text-glow-green tracking-wider">GO!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1">
      {/* Scoreboard */}
      <div className="glass-panel rounded-sm px-3 py-1 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm text-neon-purple text-glow-purple">⚔️</span>
            <span className="text-[10px] font-mono text-muted-foreground">{room.room_code}</span>
            {abilitiesMode && (
              <span className="text-[7px] font-display tracking-wider text-neon-orange bg-neon-orange/10 border border-neon-orange/30 px-1 py-0.5">
                💥 ABILITIES
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase">YOU · {myPosition.ticker}</p>
              <p className={`font-mono text-sm font-bold ${myPnl >= 0 ? 'text-neon-green' : 'text-neon-orange'}`}>
                {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(2)}%
                {myClosed && <span className="text-[7px] ml-1 text-neon-purple">LOCKED</span>}
              </p>
            </div>
            <span className="font-display text-base text-neon-orange text-glow-orange">VS</span>
            <div className="text-center">
              <p className="text-[8px] text-muted-foreground/60 uppercase">{opponentName} · {oppPosition.ticker}</p>
              <p className="font-mono text-sm font-bold text-muted-foreground">
                <span className="animate-pulse">🎲 ???</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Split screen charts */}
      <div className="flex flex-1 min-h-0 gap-1.5">
        {/* MY panel (left) */}
        <div className="basis-1/2 min-h-0 min-w-0 flex flex-col relative">
          <LiveTradePanel
            position={myPosition}
            entryPrice={myEntryPrice}
            initialCandles={myCandles}
            onResult={handleResult}
            onExitEarly={handleExitEarly}
            playerName={myName}
            walletAddress={null}
            timerSeconds={DUEL_TIMER_SECONDS}
            duelMode
            compact
            onPnlChange={handleMyPnlChange}
            label="YOU"
            feedSource={abilities.myEffects.feedSource}
            directionFlipped={abilities.myEffects.directionFlipped}
            blocked={abilities.myEffects.pirbRageActive}
            priceFrozen={abilities.myEffects.priceFrozen}
            frozenReason={abilities.myEffects.frozenReason}
          />

          {/* Effects applied TO ME by opponent (received) */}
          {abilitiesMode && (
            <AbilityEffects
              event={abilities.lastReceivedEvent}
              onEventClear={abilities.clearLastEvent}
              pirbRageActive={abilities.myEffects.pirbRageActive}
              activeOracle={abilities.myEffects.feedSource}
              pirbRageScope="full"
            />
          )}

          {myClosed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-30 rounded-sm">
              <div className="text-center space-y-2">
                <p className="font-display text-lg text-neon-purple text-glow-purple tracking-wider">✅ LOCKED IN</p>
                <p className={`font-mono text-2xl font-bold ${myPnl >= 0 ? 'text-neon-green' : 'text-neon-orange'}`}>
                  {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(2)}%</p>
                <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}
                  className="font-display text-xs text-neon-orange tracking-wider mt-2">⏳ DUEL IN PROGRESS...</motion.p>
              </div>
            </motion.div>
          )}
        </div>

        {/* OPPONENT panel (right) */}
        <div className="basis-1/2 min-h-0 min-w-0 flex flex-col relative">
          <SpectatorChart
            ticker={oppPosition.ticker}
            feedId={oppPosition.feedId}
            entryPrice={oppEntryPrice}
            initialCandles={oppCandles}
            timerSeconds={DUEL_TIMER_SECONDS}
            started={started}
          />

          {/* Effects I SENT to opponent — shown on their chart panel (right side) */}
          {abilitiesMode && (
            <AbilityEffects
              event={myLastAttackEvent}
              onEventClear={() => setMyLastAttackEvent(null)}
              pirbRageActive={sentPirbRage}
              activeOracle="pyth"
              pirbRageScope="panel"
            />
          )}
        </div>
      </div>

      {/* Bottom: Ability bar (replaces trash talk when abilities enabled) */}
      {abilitiesMode && !myClosed && !finished && (
        <div className="shrink-0 glass-panel rounded-sm px-2 py-1">
          <AbilityBar
            usedAbilities={abilities.usedAbilities}
            onUse={handleUseAbility}
            canUse={abilities.canUse}
            disabled={myClosed || finished}
          />
        </div>
      )}
    </div>
  );
}