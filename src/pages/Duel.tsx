import { useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import DuelLobby from '@/components/DuelLobby';
import DuelArena from '@/components/DuelArena';
import DuelResult from '@/components/DuelResult';
import { playCoinSound } from '@/lib/sounds';
import { generateRoomCode, pickTwoDifferentTokens, pickDuelRarity, randomInRange, DUEL_TIMER_SECONDS, winsNeeded, type BestOf } from '@/lib/duelConstants';
import { fetchPythPriceById } from '@/lib/pyth';
import { useWallet } from '@/contexts/WalletContext';
import iconPirb from '@/assets/icons/icon_pirb.png';

type DuelState = 'lobby' | 'playing' | 'result';

interface DuelRoomResult {
  p1_name: string;
  p2_name: string;
  p1_pnl: number;
  p2_pnl: number;
  winner: string | null;
  p1_ticker: string;
  p2_ticker: string;
  p1_wallet: string | null;
  p2_wallet: string | null;
}

export default function Duel() {
  const [searchParams] = useSearchParams();
  const entropyMode = (searchParams.get('mode') === 'entropy' ? 'entropy' : 'classic') as 'classic' | 'entropy';

  const { walletAddress, profile } = useWallet();
  const playerName = profile?.display_name || 'Anonymous';

  const [state, setState] = useState<DuelState>('lobby');
  const [roomId, setRoomId] = useState('');
  const [playerSlot, setPlayerSlot] = useState<'p1' | 'p2'>('p1');
  const [result, setResult] = useState<DuelRoomResult | null>(null);

  // Bo3 tracking in React state
  const [bestOf, setBestOf] = useState<BestOf>(1);
  const [currentRound, setCurrentRound] = useState(1);
  const [myRoundWins, setMyRoundWins] = useState(0);
  const [oppRoundWins, setOppRoundWins] = useState(0);
  const [oppName, setOppName] = useState('');
  const [oppWallet, setOppWallet] = useState<string | null>(null);
  const [abilitiesMode, setAbilitiesMode] = useState(false);

  const handleRoomReady = (id: string, slot: 'p1' | 'p2') => {
    setRoomId(id);
    setPlayerSlot(slot);
    setState('playing');
  };

  const handleFinished = (room: any) => {
    const roundResult: DuelRoomResult = {
      p1_name: room.p1_name,
      p2_name: room.p2_name,
      p1_pnl: room.p1_pnl,
      p2_pnl: room.p2_pnl,
      winner: room.winner,
      p1_ticker: room.p1_ticker || room.ticker || '',
      p2_ticker: room.p2_ticker || room.ticker || '',
      p1_wallet: room.p1_wallet || null,
      p2_wallet: room.p2_wallet || null,
    };

    const oppSlot = playerSlot === 'p1' ? 'p2' : 'p1';
    setOppName(room[`${oppSlot}_name`] || 'Opponent');
    setOppWallet(room[`${oppSlot}_wallet`] || null);

    if (room.winner === playerSlot) setMyRoundWins(prev => prev + 1);
    else if (room.winner && room.winner !== 'draw') setOppRoundWins(prev => prev + 1);

    setResult(roundResult);
    setState('result');
  };

  // ── P1 creates rematch room, returns new room ID ──────────────────
  const handleCreateRematchRoom = useCallback(async (): Promise<string | null> => {
    const generatePositionParams = () => {
      const rarity = pickDuelRarity();
      const leverage = randomInRange(rarity.leverageRange[0], rarity.leverageRange[1]);
      const sl = -randomInRange(rarity.slRange[0], rarity.slRange[1]);
      const rr = randomInRange(rarity.rrRange[0], rarity.rrRange[1]);
      const tp = Math.abs(sl) * rr;
      const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
      return { rarity: rarity.rarity, leverage, sl, tp, direction };
    };

    try {
      const { p1Token, p2Token } = pickTwoDifferentTokens();
      const p1Price = await fetchPythPriceById(p1Token.feedId).catch(() => null);
      const p2Price = await fetchPythPriceById(p2Token.feedId).catch(() => null);
      if (!p1Price || !p2Price) return null;

      const p1Params = generatePositionParams();
      const p2Params = generatePositionParams();
      const code = generateRoomCode();
      const newRound = currentRound + 1;
      const startTime = new Date(Date.now() + 5000).toISOString();

      const myIsP1 = playerSlot === 'p1';

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
        p1_name: myIsP1 ? playerName : oppName,
        p1_wallet: myIsP1 ? (walletAddress || null) : oppWallet,
        p2_ticker: p2Token.ticker, p2_feed_id: p2Token.feedId,
        p2_direction: p2Params.direction, p2_leverage: p2Params.leverage,
        p2_stop_loss: p2Params.sl, p2_take_profit: p2Params.tp,
        p2_rarity: p2Params.rarity, p2_entry_price: p2Price,
        p2_name: myIsP1 ? oppName : playerName,
        p2_wallet: myIsP1 ? oppWallet : (walletAddress || null),
        timer_seconds: DUEL_TIMER_SECONDS,
        status: 'playing',
        started_at: startTime,
      } as any).select('id').single();

      if (dbErr || !data) return null;

      // P1 transitions to new room
      setRoomId(data.id);
      setCurrentRound(newRound);
      setResult(null);
      setState('playing');

      return data.id;
    } catch (err) {
      console.error('Rematch room create error:', err);
      return null;
    }
  }, [playerSlot, playerName, walletAddress, oppName, oppWallet, currentRound]);

  // ── P2 joins rematch room by ID (received via broadcast) ──────────
  const handleJoinRematchRoom = useCallback((newRoomId: string) => {
    setRoomId(newRoomId);
    setCurrentRound(prev => prev + 1);
    setResult(null);
    setState('playing');
  }, []);

  const handleNewLobby = () => {
    setState('lobby');
    setRoomId('');
    setResult(null);
    setCurrentRound(1);
    setMyRoundWins(0);
    setOppRoundWins(0);
    setBestOf(1);
    setOppName('');
    setOppWallet(null);
    setAbilitiesMode(false);
  };

  const seriesOver = bestOf > 1 && (myRoundWins >= winsNeeded(bestOf) || oppRoundWins >= winsNeeded(bestOf));

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="relative z-10 border-b-2 border-neon-purple/40 bg-background/90 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-center px-3 sm:px-4 py-2 sm:py-3 relative min-h-[56px] sm:min-h-[64px]">
          <Link to="/" onClick={() => playCoinSound()} className="font-display text-sm text-muted-foreground hover:text-neon-purple transition-colors absolute left-3 sm:left-4 z-10">
            ← BACK
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <img src={iconPirb} alt="PIRBGEN" width={40} height={40} className="object-contain shrink-0" />
            <span className="font-display text-[8px] sm:text-xs tracking-[0.3em] text-neon-purple text-glow-purple">PIRBGEN</span>
            {entropyMode === 'entropy' && (
              <span className="font-display text-[7px] tracking-wider text-neon-green bg-neon-green/10 border border-neon-green/30 px-2 py-0.5 rounded-sm">
                🔗 ENTROPY
              </span>
            )}
            {bestOf > 1 && (
              <span className="font-display text-[7px] tracking-wider text-neon-orange bg-neon-orange/10 border border-neon-orange/30 px-2 py-0.5 rounded-sm">
                Bo{bestOf} · R{currentRound} · {myRoundWins}-{oppRoundWins}
              </span>
            )}
            {abilitiesMode && (
              <span className="font-display text-[7px] tracking-wider text-neon-orange bg-neon-orange/10 border border-neon-orange/30 px-2 py-0.5 rounded-sm">
                💥 ABILITIES
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 p-2">
        <AnimatePresence mode="wait">
          {state === 'lobby' && (
            <motion.div key="lobby" className="flex-1 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DuelLobby
                onRoomReady={handleRoomReady}
                entropyMode={entropyMode}
                onBestOfSelected={(bo) => setBestOf(bo)}
                onAbilitiesModeChanged={(v) => setAbilitiesMode(v)}
              />
            </motion.div>
          )}

          {state === 'playing' && (
            <motion.div key="arena" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DuelArena roomId={roomId} playerSlot={playerSlot} onFinished={handleFinished} abilitiesMode={abilitiesMode} />
            </motion.div>
          )}

          {state === 'result' && result && (
            <motion.div key="result" className="flex-1 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DuelResult
                myName={playerSlot === 'p1' ? result.p1_name : result.p2_name}
                opponentName={playerSlot === 'p1' ? result.p2_name : result.p1_name}
                myPnl={playerSlot === 'p1' ? result.p1_pnl : result.p2_pnl}
                opponentPnl={playerSlot === 'p1' ? result.p2_pnl : result.p1_pnl}
                winner={(result.winner || 'draw') as 'p1' | 'p2' | 'draw'}
                playerSlot={playerSlot}
                myTicker={playerSlot === 'p1' ? result.p1_ticker : result.p2_ticker}
                opponentTicker={playerSlot === 'p1' ? result.p2_ticker : result.p1_ticker}
                myWallet={playerSlot === 'p1' ? result.p1_wallet : result.p2_wallet}
                opponentWallet={playerSlot === 'p1' ? result.p2_wallet : result.p1_wallet}
                onPlayAgain={handleNewLobby}
                onHome={() => window.location.href = '/'}
                roomId={roomId}
                onCreateRematchRoom={seriesOver ? undefined : handleCreateRematchRoom}
                onJoinRematchRoom={seriesOver ? undefined : handleJoinRematchRoom}
                bestOf={bestOf}
                currentRound={currentRound}
                myRoundWins={myRoundWins}
                oppRoundWins={oppRoundWins}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}