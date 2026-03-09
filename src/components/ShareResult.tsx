import { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

interface ShareResultProps {
  ticker: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  pnl: number;
  rarity: string;
  result: 'WIN' | 'REKT';
  streak: number;
}

export default function ShareResult({ ticker, direction, leverage, pnl, rarity, result, streak }: ShareResultProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = 600;
    const h = 340;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0a0614');
    bg.addColorStop(1, '#12081f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(128, 70, 220, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 30) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
    }
    for (let i = 0; i < h; i += 30) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }

    // Border
    ctx.strokeStyle = result === 'WIN' ? '#07e46e' : '#f97316';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Title
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#8046dc';
    ctx.textAlign = 'left';
    ctx.fillText('PIRBGEN', 24, 36);

    // Result
    ctx.font = 'bold 42px monospace';
    ctx.fillStyle = result === 'WIN' ? '#07e46e' : '#f97316';
    ctx.textAlign = 'center';
    ctx.fillText(result === 'WIN' ? '🎯 TARGET HIT' : '💀 LIQUIDATED', w / 2, 100);

    // PnL
    ctx.font = 'bold 56px monospace';
    ctx.fillText(`${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`, w / 2, 170);

    // Details
    ctx.font = '16px monospace';
    ctx.fillStyle = '#e0d4ff';
    ctx.fillText(`${ticker}/USD  ·  ${direction}  ·  ${leverage}x  ·  ${rarity.toUpperCase()}`, w / 2, 215);

    // Streak
    if (streak > 1) {
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#f97316';
      ctx.fillText(`🔥 ${streak} WIN STREAK`, w / 2, 250);
    }

    // Footer
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(200, 180, 255, 0.3)';
    ctx.fillText('pirbgen · pyth network · base l2', w / 2, h - 20);

    // Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }
  }, [ticker, direction, leverage, pnl, rarity, result, streak]);

  const handleShare = useCallback(async () => {
    generateImage();
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;

      if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'pirbgen.png', { type: 'image/png' })] })) {
        await navigator.share({
          title: `PIRBGEN ${result}`,
          text: `${result === 'WIN' ? '🎯' : '💀'} ${ticker} ${direction} ${leverage}x → ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`,
          files: [new File([blob], 'pirbgen.png', { type: 'image/png' })],
        });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pirbgen-${result.toLowerCase()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.log('Share cancelled or failed:', err);
    }
  }, [generateImage, result, ticker, direction, leverage, pnl]);

  const handleCopyText = useCallback(() => {
    const text = `${result === 'WIN' ? '🎯 TARGET HIT' : '💀 LIQUIDATED'}\n${ticker}/USD ${direction} ${leverage}x\nPnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%${streak > 1 ? `\n🔥 ${streak} Win Streak` : ''}\n\npirbgen.com`;
    navigator.clipboard.writeText(text).catch(() => {});
  }, [result, ticker, direction, leverage, pnl, streak]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 }}
      className="flex items-center gap-2"
    >
      <canvas ref={canvasRef} className="hidden" />
      <button onClick={handleShare} className="arcade-btn text-[9px] py-2 px-4" style={{ borderColor: 'hsl(var(--neon-green))', color: 'hsl(var(--neon-green))', background: 'hsl(var(--neon-green) / 0.1)' }}>
        📸 SHARE
      </button>
      <button onClick={handleCopyText} className="arcade-btn text-[9px] py-2 px-4" style={{ borderColor: 'hsl(var(--muted-foreground))', color: 'hsl(var(--muted-foreground))', background: 'hsl(var(--muted-foreground) / 0.1)' }}>
        📋 COPY
      </button>
    </motion.div>
  );
}