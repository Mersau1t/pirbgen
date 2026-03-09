import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import DuelLobby from '@/components/DuelLobby';
import DuelArena from '@/components/DuelArena';
import DuelResult from '@/components/DuelResult';

type DuelState = 'lobby' | 'playing' | 'result';

interface DuelRoomResult {
  p1_name: string;
  p2_name: string;
  p1_pnl: number;
  p2_pnl: number;
  winner: string | null;
  ticker: string;
}

export default function Duel() {
  const [state, setState] = useState<DuelState>('lobby');
  const [roomId, setRoomId] = useState('');
  const [playerSlot, setPlayerSlot] = useState<'p1' | 'p2'>('p1');
  const [result, setResult] = useState<DuelRoomResult | null>(null);

  const handleRoomReady = (id: string, slot: 'p1' | 'p2') => {
    setRoomId(id);
    setPlayerSlot(slot);
    setState('playing');
  };

  const handleFinished = (room: any) => {
    setResult({
      p1_name: room.p1_name,
      p2_name: room.p2_name,
      p1_pnl: room.p1_pnl,
      p2_pnl: room.p2_pnl,
      winner: room.winner,
      ticker: room.ticker,
    });
    setState('result');
  };

  const handleRematch = () => {
    setState('lobby');
    setRoomId('');
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-border/20 px-4 py-2 flex items-center justify-between">
        <Link to="/" className="font-display text-sm text-muted-foreground hover:text-neon-purple transition-colors">
          ← BACK
        </Link>
        <span className="font-display text-xs text-neon-purple/50 tracking-wider">PVP DUEL MODE</span>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col min-h-0 p-2">
        <AnimatePresence mode="wait">
          {state === 'lobby' && (
            <motion.div key="lobby" className="flex-1 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DuelLobby onRoomReady={handleRoomReady} />
            </motion.div>
          )}

          {state === 'playing' && (
            <motion.div key="arena" className="flex-1 flex flex-col min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <DuelArena roomId={roomId} playerSlot={playerSlot} onFinished={handleFinished} />
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
                ticker={result.ticker}
                onPlayAgain={handleRematch}
                onHome={() => window.location.href = '/'}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
