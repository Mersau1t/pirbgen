import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { generateRoomCode, pickTwoDifferentTokens, pickDuelRarity, randomInRange, DUEL_TIMER_SECONDS, REROLL_TIMER_SECONDS, type BestOf } from '@/lib/duelConstants';
import { fetchPythPriceById } from '@/lib/pyth';
import { useWallet } from '@/contexts/WalletContext';
import { SOLO_TOKENS } from '@/lib/soloTokens';
import { useDuelEntropy } from '@/hooks/useDuelEntropy';
import { type EntropyPosition } from '@/hooks/useEntropy';
import RerollPanel from '@/components/RerollPanel';
import imgJoinDuel from '@/assets/icons/join_duel.png';
import imgDuelClassic from '@/assets/icons/duel.png';
import imgDuelEntropy from '@/assets/icons/duelentropy.png';

const Ico = ({ src, size = 16 }: { src: string; size?: number }) => (
  <img src={src} alt="" width={size} height={size} draggable={false}
    className="inline-block object-contain align-middle shrink-0"
    style={{ imageRendering: 'pixelated' }} />
);

interface DuelLobbyProps {
  onRoomReady: (roomId: string, playerSlot: 'p1' | 'p2') => void;
  entropyMode?: 'classic' | 'entropy';
  onBestOfSelected?: (bo: BestOf) => void;
  onAbilitiesModeChanged?: (enabled: boolean) => void;
}

export default function DuelLobby({ onRoomReady, entropyMode = 'classic', onBestOfSelected, onAbilitiesModeChanged }: DuelLobbyProps) {
  const { walletAddress, profile } = useWallet();
  const [mode, setMode] = useState<'menu' | 'creating' | 'joining' | 'waiting' | 'reroll_phase'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bestOf, setBestOf] = useState<BestOf>(1);
  const [abilitiesEnabled, setAbilitiesEnabled] = useState(false);

  const playerName = profile?.display_name || 'Anonymous';
  const isEntropy = entropyMode === 'entropy';

  const toggleAbilities = (v: boolean) => {
    setAbilitiesEnabled(v);
    onAbilitiesModeChanged?.(v);
  };

  const [rerollTimer, setRerollTimer] = useState(REROLL_TIMER_SECONDS);
  const rerollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const duelEntropy = useDuelEntropy();

  const handleBestOfChange = (bo: BestOf) => {
    setBestOf(bo);
    onBestOfSelected?.(bo);
  };

  const generatePositionParams = () => {
    const rarity = pickDuelRarity();
    const leverage = randomInRange(rarity.leverageRange[0], rarity.leverageRange[1]);
    const sl = -randomInRange(rarity.slRange[0], rarity.slRange[1]);
    const rr = randomInRange(rarity.rrRange[0], rarity.rrRange[1]);
    const tp = Math.abs(sl) * rr;
    const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    return { rarity: rarity.rarity, leverage, sl, tp, direction };
  };

  // ══════════════════════════════════════════════════════════════════
  //  CLASSIC MODE
  // ══════════════════════════════════════════════════════════════════

  const handleCreateClassic = async () => {
    setMode('creating'); setError('');
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
        ticker: p1Token.ticker, feed_id: p1Token.feedId,
        direction: p1Params.direction, leverage: p1Params.leverage,
        stop_loss: p1Params.sl, take_profit: p1Params.tp,
        rarity: p1Params.rarity, entry_price: p1Price,
        p1_ticker: p1Token.ticker, p1_feed_id: p1Token.feedId,
        p1_direction: p1Params.direction, p1_leverage: p1Params.leverage,
        p1_stop_loss: p1Params.sl, p1_take_profit: p1Params.tp,
        p1_rarity: p1Params.rarity, p1_entry_price: p1Price,
        p1_name: playerName, p1_wallet: walletAddress || null,
        p2_ticker: p2Token.ticker, p2_feed_id: p2Token.feedId,
        p2_direction: p2Params.direction, p2_leverage: p2Params.leverage,
        p2_stop_loss: p2Params.sl, p2_take_profit: p2Params.tp,
        p2_rarity: p2Params.rarity, p2_entry_price: p2Price,
        timer_seconds: DUEL_TIMER_SECONDS,
      } as any).select('id').single();

      if (dbErr) throw dbErr;
      setRoomCode(code); setRoomId(data.id); setMode('waiting');
    } catch (err: any) {
      setError(err.message || 'Failed to create room'); setMode('menu');
    }
  };

  const handleJoinClassic = async () => {
    if (inputCode.length < 4) { setError('Enter room code'); return; }
    setError(''); setMode('joining');
    try {
      const { data: room, error: findErr } = await supabase
        .from('duel_rooms').select('*')
        .eq('room_code', inputCode.toUpperCase()).eq('status', 'waiting').single();
      if (findErr || !room) throw new Error('Room not found or already started');

      const startTime = new Date(Date.now() + 5000).toISOString();
      const { error: joinErr } = await supabase.from('duel_rooms').update({
        p2_name: playerName, p2_wallet: walletAddress || null,
        status: 'playing', started_at: startTime,
      } as any).eq('id', room.id);
      if (joinErr) throw joinErr;
      onRoomReady(room.id, 'p2');
    } catch (err: any) {
      setError(err.message || 'Failed to join room'); setMode('menu');
    }
  };

  // ══════════════════════════════════════════════════════════════════
  //  ENTROPY MODE
  // ══════════════════════════════════════════════════════════════════

  const handleCreateEntropy = async () => {
    if (!walletAddress) { setError('Connect wallet first'); return; }
    setMode('creating'); setError('');
    try { await duelEntropy.createDuel(true); }
    catch (err: any) { setError(err.message || 'Failed'); setMode('menu'); }
  };

  const handleJoinEntropy = async () => {
    if (!inputCode.trim()) { setError('Enter duel ID'); return; }
    if (!walletAddress) { setError('Connect wallet first'); return; }
    setError(''); setMode('joining');
    try { await duelEntropy.joinDuel(BigInt(inputCode.trim())); }
    catch (err: any) { setError(err.message || 'Failed'); setMode('menu'); }
  };

  useEffect(() => {
    if (!isEntropy) return;
    if (duelEntropy.error) { setError(duelEntropy.error); setMode('menu'); return; }
    switch (duelEntropy.status) {
      case 'waiting_create': setMode('creating'); break;
      case 'lobby': setMode('waiting'); break;
      case 'waiting_join': setMode('joining'); break;
      case 'rerolling': setMode('reroll_phase'); startRerollTimer(); break;
    }
  }, [isEntropy, duelEntropy.status, duelEntropy.error]);

  // ── 15s reroll auto-confirm timer ─────────────────────────────────
  const startRerollTimer = useCallback(() => {
    setRerollTimer(REROLL_TIMER_SECONDS);
    if (rerollTimerRef.current) clearInterval(rerollTimerRef.current);
    rerollTimerRef.current = setInterval(() => {
      setRerollTimer(prev => {
        if (prev <= 1) {
          if (rerollTimerRef.current) clearInterval(rerollTimerRef.current);
          handleConfirmReady();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => { if (rerollTimerRef.current) clearInterval(rerollTimerRef.current); };
  }, []);

  const handleConfirmReady = useCallback(async () => {
    if (rerollTimerRef.current) clearInterval(rerollTimerRef.current);
    if (!duelEntropy.player1 || !duelEntropy.player2) return;
    setError('');
    try {
      const p1Pos = duelEntropy.player1;
      const p2Pos = duelEntropy.player2;
      const p1Token = SOLO_TOKENS[p1Pos.tokenIndex] || SOLO_TOKENS[0];
      const p2Token = SOLO_TOKENS[p2Pos.tokenIndex] || SOLO_TOKENS[0];
      const p1Price = await fetchPythPriceById(p1Token.feedId);
      const p2Price = await fetchPythPriceById(p2Token.feedId);
      if (!p1Price || !p2Price) throw new Error('Failed to fetch prices');

      const code = generateRoomCode();
      const startTime = new Date(Date.now() + 3000).toISOString();

      const { data, error: dbErr } = await supabase.from('duel_rooms').insert({
        room_code: code,
        ticker: p1Token.ticker, feed_id: p1Token.feedId,
        direction: p1Pos.direction, leverage: p1Pos.leverage,
        stop_loss: -p1Pos.stopLoss, take_profit: p1Pos.takeProfit,
        rarity: p1Pos.rarity, entry_price: p1Price,
        p1_ticker: p1Token.ticker, p1_feed_id: p1Token.feedId,
        p1_direction: p1Pos.direction, p1_leverage: p1Pos.leverage,
        p1_stop_loss: -p1Pos.stopLoss, p1_take_profit: p1Pos.takeProfit,
        p1_rarity: p1Pos.rarity, p1_entry_price: p1Price,
        p1_name: playerName, p1_wallet: walletAddress || null,
        p2_ticker: p2Token.ticker, p2_feed_id: p2Token.feedId,
        p2_direction: p2Pos.direction, p2_leverage: p2Pos.leverage,
        p2_stop_loss: -p2Pos.stopLoss, p2_take_profit: p2Pos.takeProfit,
        p2_rarity: p2Pos.rarity, p2_entry_price: p2Price,
        p2_name: 'Opponent', p2_wallet: null,
        timer_seconds: DUEL_TIMER_SECONDS,
        status: 'playing', started_at: startTime,
      } as any).select('id').single();

      if (dbErr) throw dbErr;
      onRoomReady(data.id, duelEntropy.isPlayer1 ? 'p1' : 'p2');
    } catch (err: any) { setError(err.message || 'Failed to start duel'); }
  }, [duelEntropy.player1, duelEntropy.player2, duelEntropy.isPlayer1, playerName, walletAddress, onRoomReady]);

  const handleCreate = isEntropy ? handleCreateEntropy : handleCreateClassic;
  const handleJoin = isEntropy ? handleJoinEntropy : handleJoinClassic;

  // Classic: listen for P2 joining
  useEffect(() => {
    if (isEntropy || mode !== 'waiting' || !roomId) return;
    const channel = supabase.channel(`duel-lobby-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'duel_rooms', filter: `id=eq.${roomId}`,
      }, (payload) => {
        if ((payload.new as any).status === 'playing') onRoomReady(roomId, 'p1');
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isEntropy, mode, roomId]);

  const myPos = duelEntropy.isPlayer1 ? duelEntropy.player1 : duelEntropy.player2;
  const oppPos = duelEntropy.isPlayer1 ? duelEntropy.player2 : duelEntropy.player1;

  const renderPositionPreview = (pos: EntropyPosition, label: string) => {
    const token = SOLO_TOKENS[pos.tokenIndex] || SOLO_TOKENS[0];
    return (
      <div className="glass-panel rounded-sm p-3 space-y-1 text-center">
        <p className="text-[8px] text-muted-foreground font-display tracking-wider">{label}</p>
        <p className="font-display text-sm text-neon-green">{token.ticker}</p>
        <div className="flex justify-center gap-3 text-[9px] font-mono text-muted-foreground">
          <span className={pos.direction === 'LONG' ? 'text-neon-green' : 'text-neon-orange'}>{pos.direction}</span>
          <span>{pos.leverage}x</span>
          <span>SL: -{pos.stopLoss}%</span>
          <span>TP: +{pos.takeProfit}%</span>
        </div>
        <p className={`text-[8px] font-display tracking-wider ${
          pos.rarity === 'legendary' ? 'text-neon-purple' : pos.rarity === 'epic' ? 'text-neon-orange' :
          pos.rarity === 'rare' ? 'text-neon-green' : 'text-muted-foreground'
        }`}>{pos.rarity.toUpperCase()}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <h1 className="font-display text-3xl sm:text-4xl text-neon-green text-glow-green tracking-wider">⚔️ PVP DUEL</h1>
        <p className="text-muted-foreground text-sm mt-2 font-mono">1v1 · Different tokens · 60 seconds · Higher PnL wins</p>
        {isEntropy && <p className="text-neon-purple text-[10px] mt-1 font-display tracking-wider">🔗 ON-CHAIN ENTROPY MODE</p>}
      </motion.div>

      {/* MENU */}
      {mode === 'menu' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col gap-4 w-full max-w-sm">
          {/* Bo1 / Bo3 tabs (entropy mode) */}
          {isEntropy && (
            <div className="flex gap-2 justify-center">
              {([1, 3] as const).map(bo => (
                <button key={bo} onClick={() => handleBestOfChange(bo)}
                  className={`font-display text-[10px] tracking-wider px-4 py-2 border transition-all ${
                    bestOf === bo ? 'border-neon-purple/60 text-neon-purple bg-neon-purple/10'
                      : 'border-border/30 text-muted-foreground hover:border-neon-purple/30'
                  }`} style={{ borderRadius: '2px' }}>
                  {bo === 1 ? '⚔️ BEST OF 1' : '🏆 BEST OF 3'}
                </button>
              ))}
            </div>
          )}

          {/* Abilities mode toggle */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => toggleAbilities(!abilitiesEnabled)}
              className={`font-display text-[10px] tracking-wider px-4 py-2 border transition-all flex items-center gap-2 ${
                abilitiesEnabled
                  ? 'border-neon-orange/60 text-neon-orange bg-neon-orange/10'
                  : 'border-border/30 text-muted-foreground hover:border-neon-orange/30'
              }`}
              style={{ borderRadius: '2px' }}
            >
              💥 {abilitiesEnabled ? 'ABILITIES ON' : 'ABILITIES OFF'}
            </button>
          </div>

          <button onClick={handleCreate}
            className="arcade-btn arcade-btn-primary text-sm py-4 tracking-wider flex items-center justify-center gap-2">
            <Ico src={isEntropy ? imgDuelEntropy : imgDuelClassic} size={40} />
            CREATE ROOM {isEntropy && bestOf > 1 ? `(Bo${bestOf})` : ''}
          </button>

          <div className="glass-panel rounded-sm p-4 space-y-3">
            <p className="text-[10px] text-muted-foreground font-display tracking-wider text-center">
              {isEntropy ? 'ENTER DUEL ID' : 'OR JOIN WITH CODE'}</p>
            <input type="text" value={inputCode}
              onChange={(e) => isEntropy
                ? setInputCode(e.target.value.replace(/\D/g, '').slice(0, 10))
                : setInputCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder={isEntropy ? 'DUEL ID' : 'ENTER CODE'}
              className="w-full bg-background/50 border border-border/30 rounded-sm px-4 py-3 text-center font-display text-xl tracking-[0.3em] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-neon-purple/50"
              maxLength={isEntropy ? 10 : 6} />
            <button onClick={handleJoin}
              disabled={isEntropy ? !inputCode.trim() : inputCode.length < 4}
              className="arcade-btn w-full text-sm py-3 tracking-wider disabled:opacity-30 flex items-center justify-center gap-2"
              style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)' }}>
              <Ico src={imgJoinDuel} size={40} /> JOIN DUEL
            </button>
          </div>

          {isEntropy && duelEntropy.fee && (
            <p className="text-[9px] text-muted-foreground font-mono text-center">Entropy fee: {duelEntropy.feeFormatted}</p>)}
          {error && <p className="text-neon-orange text-xs font-mono text-center">{error}</p>}
        </motion.div>
      )}

      {/* CREATING / JOINING */}
      {(mode === 'creating' || mode === 'joining') && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }} className="text-center">
          <p className="text-neon-orange font-display text-sm tracking-wider">
            {mode === 'creating' ? (isEntropy ? '⏳ REQUESTING ENTROPY...' : '⏳ CREATING ROOM...')
              : (isEntropy ? '⏳ JOINING DUEL...' : '⏳ JOINING...')}</p>
        </motion.div>
      )}

      {/* WAITING */}
      {mode === 'waiting' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6">
          <div className="glass-panel rounded-sm p-6 text-center space-y-4">
            <p className="text-[10px] text-muted-foreground font-display tracking-wider">
              {isEntropy ? 'SHARE THIS DUEL ID' : 'SHARE THIS CODE'}</p>
            {isEntropy && duelEntropy.duelId !== null ? (
              <motion.span initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="inline-block px-6 py-3 bg-neon-purple/10 border border-neon-purple/30 font-display text-2xl text-neon-purple text-glow-purple">
                #{duelEntropy.duelId.toString()}</motion.span>
            ) : (
              <div className="flex items-center justify-center gap-1">
                {roomCode.split('').map((char, i) => (
                  <motion.span key={i} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    className="w-12 h-14 flex items-center justify-center bg-neon-purple/10 border border-neon-purple/30 font-display text-2xl text-neon-purple text-glow-purple">{char}</motion.span>
                ))}
              </div>
            )}
            <button onClick={() => navigator.clipboard.writeText(isEntropy && duelEntropy.duelId !== null ? duelEntropy.duelId.toString() : roomCode)}
              className="text-[10px] text-muted-foreground hover:text-neon-purple transition-colors font-mono">📋 COPY</button>
          </div>

          {isEntropy && duelEntropy.player1 && duelEntropy.isPlayer1 && (
            <div className="w-full max-w-sm">{renderPositionPreview(duelEntropy.player1, 'YOUR POSITION')}</div>
          )}

          <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}
            className="text-neon-orange font-display text-xs tracking-wider">⏳ WAITING FOR OPPONENT...</motion.p>
          <button onClick={() => { setMode('menu'); if (isEntropy) duelEntropy.reset(); }}
            className="text-[10px] text-muted-foreground hover:text-neon-orange transition-colors font-mono">✕ CANCEL</button>
        </motion.div>
      )}

      {/* REROLL PHASE (entropy) */}
      {mode === 'reroll_phase' && isEntropy && myPos && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 w-full max-w-lg">
          <div className="flex items-center gap-3">
            <p className="font-display text-sm text-neon-purple tracking-wider">⚔️ REROLL PHASE</p>
            <span className={`font-mono text-lg font-bold ${rerollTimer <= 5 ? 'text-neon-orange animate-pulse' : 'text-neon-green'}`}>
              {rerollTimer}s</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <div className="space-y-3">
              {renderPositionPreview(myPos, 'YOUR POSITION')}
              <RerollPanel position={myPos}
                onReroll={(idx) => duelEntropy.rerollSingle(idx)}
                onRerollAll={() => duelEntropy.rerollAll()}
                mode="duel" isDirectionLocked={!duelEntropy.isFullRandom} />
            </div>
            {oppPos && (
              <div>
                {renderPositionPreview(oppPos, 'OPPONENT')}
                <p className="text-[8px] text-muted-foreground/40 font-display tracking-wider text-center mt-2">OPPONENT CAN ALSO REROLL</p>
              </div>
            )}
          </div>
          <button onClick={handleConfirmReady}
            className="arcade-btn arcade-btn-primary text-sm py-4 px-8 tracking-wider mt-2">✅ CONFIRM & START</button>
        </motion.div>
      )}
    </div>
  );
}