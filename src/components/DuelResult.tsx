import { motion } from 'framer-motion';
import { getMascot } from '@/lib/mascots';

interface DuelResultProps {
  myName: string;
  opponentName: string;
  myPnl: number;
  opponentPnl: number;
  winner: 'p1' | 'p2' | 'draw';
  playerSlot: 'p1' | 'p2';
  myTicker: string;
  opponentTicker: string;
  onPlayAgain: () => void;
  onHome: () => void;
}

export default function DuelResult({ myName, opponentName, myPnl, opponentPnl, winner, playerSlot, myTicker, opponentTicker, onPlayAgain, onHome }: DuelResultProps) {
  const iWon = winner === playerSlot;
  const isDraw = winner === 'draw';

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-4">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150 }}
        className="text-center"
      >
        {isDraw ? (
          <h1 className="font-display text-5xl sm:text-6xl text-neon-orange text-glow-orange tracking-wider">🤝 DRAW!</h1>
        ) : iWon ? (
          <h1 className="font-display text-5xl sm:text-6xl text-neon-green text-glow-green tracking-wider animate-rainbow">🏆 YOU WIN!</h1>
        ) : (
          <h1 className="font-display text-5xl sm:text-6xl text-neon-orange text-glow-orange tracking-wider">💀 PIRBED!</h1>
        )}
      </motion.div>

      <motion.img
        src={pirbMascot}
        alt="Pirb"
        className="w-24 h-24 object-contain"
        initial={{ x: iWon ? 300 : -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 0.2 }}
        style={{
          filter: iWon ? 'drop-shadow(0 0 20px #07e46e)' : isDraw ? 'drop-shadow(0 0 20px #f97316)' : 'drop-shadow(0 0 20px #f97316)',
          transform: !iWon && !isDraw ? 'scaleX(-1)' : undefined,
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-panel rounded-sm p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-between gap-4">
          <div className={`flex-1 text-center p-4 rounded-sm border ${
            iWon ? 'border-neon-green/40 bg-neon-green/5' : isDraw ? 'border-neon-orange/40 bg-neon-orange/5' : 'border-border/20'
          }`}>
            <p className="text-[10px] text-muted-foreground font-display tracking-wider mb-1">YOU · {myTicker}</p>
            <p className="font-display text-sm text-foreground mb-2">{myName}</p>
            <p className={`font-mono text-3xl sm:text-4xl font-bold ${myPnl >= 0 ? 'text-neon-green' : 'text-neon-orange'}`}>
              {myPnl >= 0 ? '+' : ''}{myPnl.toFixed(2)}%
            </p>
          </div>

          <span className="font-display text-lg text-muted-foreground">VS</span>

          <div className={`flex-1 text-center p-4 rounded-sm border ${
            !iWon && !isDraw ? 'border-neon-green/40 bg-neon-green/5' : isDraw ? 'border-neon-orange/40 bg-neon-orange/5' : 'border-border/20'
          }`}>
            <p className="text-[10px] text-muted-foreground font-display tracking-wider mb-1">OPP · {opponentTicker}</p>
            <p className="font-display text-sm text-foreground mb-2">{opponentName}</p>
            <p className={`font-mono text-3xl sm:text-4xl font-bold ${opponentPnl >= 0 ? 'text-neon-green' : 'text-neon-orange'}`}>
              {opponentPnl >= 0 ? '+' : ''}{opponentPnl.toFixed(2)}%
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex gap-4"
      >
        <button onClick={onPlayAgain} className="arcade-btn arcade-btn-primary text-[10px] py-3 px-6">⚔️ REMATCH</button>
        <button onClick={onHome} className="arcade-btn text-[10px] py-3 px-6">🏠 HOME</button>
      </motion.div>
    </div>
  );
}