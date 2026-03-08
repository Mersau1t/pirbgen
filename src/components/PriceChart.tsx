import { useRef, useEffect, useState } from 'react';

interface PriceChartProps {
  priceHistory: number[];
  entryPrice: number;
  positive: boolean;
  stopLoss: number;
  takeProfit: number;
  direction: 'LONG' | 'SHORT';
}

const MAX_POINTS = 10;

export default function PriceChart({ priceHistory, entryPrice, positive, stopLoss, takeProfit, direction }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || priceHistory.length < 1 || size.w === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.scale(dpr, dpr);

    const w = size.w;
    const h = size.h;
    const data = priceHistory.slice(-MAX_POINTS);

    // Calculate price range with padding
    const allPrices = [...data, entryPrice];
    const dataMin = Math.min(...allPrices);
    const dataMax = Math.max(...allPrices);
    const padding = (dataMax - dataMin) * 0.3 || entryPrice * 0.005;
    const min = dataMin - padding;
    const max = dataMax + padding;
    const range = max - min || 1;

    const toX = (i: number) => (i / (MAX_POINTS - 1)) * w;
    const toY = (v: number) => h - ((v - min) / range) * h;

    ctx.clearRect(0, 0, w, h);

    const entryY = toY(entryPrice);

    // Win/loss zones based on direction
    // LONG: above entry = win (green), below = loss (red)
    // SHORT: above entry = loss (red), below = win (green)
    const winAbove = direction === 'LONG';

    // Top zone (above entry)
    const topGradient = ctx.createLinearGradient(0, 0, 0, entryY);
    if (winAbove) {
      topGradient.addColorStop(0, 'rgba(7, 228, 110, 0.12)');
      topGradient.addColorStop(1, 'rgba(7, 228, 110, 0.02)');
    } else {
      topGradient.addColorStop(0, 'rgba(239, 68, 68, 0.12)');
      topGradient.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
    }
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, w, entryY);

    // Bottom zone (below entry)
    const bottomGradient = ctx.createLinearGradient(0, entryY, 0, h);
    if (winAbove) {
      bottomGradient.addColorStop(0, 'rgba(239, 68, 68, 0.02)');
      bottomGradient.addColorStop(1, 'rgba(239, 68, 68, 0.12)');
    } else {
      bottomGradient.addColorStop(0, 'rgba(7, 228, 110, 0.02)');
      bottomGradient.addColorStop(1, 'rgba(7, 228, 110, 0.12)');
    }
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, entryY, w, h - entryY);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = (h / 7) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let i = 1; i < 10; i++) {
      const x = (w / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Entry price line
    ctx.strokeStyle = 'rgba(245, 245, 255, 0.35)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, entryY);
    ctx.lineTo(w, entryY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Entry label
    ctx.fillStyle = 'rgba(245, 245, 255, 0.5)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ENTRY $' + entryPrice.toFixed(2), 4, entryY - 4);

    // Zone labels
    ctx.font = 'bold 10px monospace';
    ctx.globalAlpha = 0.15;
    ctx.textAlign = 'center';
    ctx.fillStyle = winAbove ? '#07e46e' : '#ef4444';
    ctx.fillText(winAbove ? '▲ PROFIT ZONE' : '▲ LOSS ZONE', w / 2, Math.min(entryY - 10, h * 0.15));
    ctx.fillStyle = winAbove ? '#ef4444' : '#07e46e';
    ctx.fillText(winAbove ? '▼ LOSS ZONE' : '▼ PROFIT ZONE', w / 2, Math.max(entryY + 20, h * 0.85));
    ctx.globalAlpha = 1;

    // Only draw line if we have 2+ points
    if (data.length >= 2) {
      const purple = '#8046dc';

      // Glow under the line
      const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
      fillGrad.addColorStop(0, 'rgba(128, 70, 220, 0.2)');
      fillGrad.addColorStop(0.5, 'rgba(128, 70, 220, 0.05)');
      fillGrad.addColorStop(1, 'rgba(128, 70, 220, 0)');

      ctx.beginPath();
      data.forEach((price, i) => {
        const x = toX(i);
        const y = toY(price);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(toX(data.length - 1), h);
      ctx.lineTo(toX(0), h);
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Main line — purple
      ctx.beginPath();
      data.forEach((price, i) => {
        const x = toX(i);
        const y = toY(price);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = purple;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = purple;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Second pass for extra glow
      ctx.beginPath();
      data.forEach((price, i) => {
        const x = toX(i);
        const y = toY(price);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'rgba(128, 70, 220, 0.4)';
      ctx.lineWidth = 6;
      ctx.shadowColor = purple;
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Current price dot
      const lastX = toX(data.length - 1);
      const lastY = toY(data[data.length - 1]);

      // Outer glow
      ctx.beginPath();
      ctx.arc(lastX, lastY, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(128, 70, 220, 0.2)';
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = purple;
      ctx.shadowColor = purple;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      // White center
      ctx.beginPath();
      ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#F5F5FF';
      ctx.fill();
    }
  }, [priceHistory, entryPrice, positive, size, direction]);

  return (
    <div ref={containerRef} className="w-full h-52 sm:h-64 relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      <div className="absolute top-2 left-3 text-[9px] text-muted-foreground/50 font-mono tracking-wider">10s TIMEFRAME</div>
      <div className="absolute top-2 right-3 text-[9px] text-muted-foreground/50 font-mono">{Math.min(priceHistory.length, MAX_POINTS)}/{MAX_POINTS}</div>
    </div>
  );
}
