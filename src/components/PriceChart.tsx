import { useRef, useEffect } from 'react';

interface PriceChartProps {
  priceHistory: number[];
  entryPrice: number;
  positive: boolean;
}

const MAX_POINTS = 10;

export default function PriceChart({ priceHistory, entryPrice, positive }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || priceHistory.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Use last MAX_POINTS entries
    const data = priceHistory.slice(-MAX_POINTS);

    const min = Math.min(...data, entryPrice) * 0.9995;
    const max = Math.max(...data, entryPrice) * 1.0005;
    const range = max - min || 1;

    const toX = (i: number) => (i / (MAX_POINTS - 1)) * w;
    const toY = (v: number) => h - ((v - min) / range) * h;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Entry price line
    const entryY = toY(entryPrice);
    ctx.strokeStyle = 'rgba(245,245,255,0.2)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, entryY);
    ctx.lineTo(w, entryY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price line gradient fill
    const lineColor = positive ? '#07e46e' : '#ef4444';
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, positive ? 'rgba(7,228,110,0.15)' : 'rgba(239,68,68,0.15)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    // Fill area
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
    ctx.fillStyle = gradient;
    ctx.fill();

    // Price line
    ctx.beginPath();
    data.forEach((price, i) => {
      const x = toX(i);
      const y = toY(price);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current price dot
    const lastX = toX(data.length - 1);
    const lastY = toY(data[data.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [priceHistory, entryPrice, positive]);

  return (
    <div className="w-full h-32 sm:h-40 relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      <div className="absolute top-1 left-2 text-[9px] text-muted-foreground/40 font-mono">10s TF</div>
      <div className="absolute top-1 right-2 text-[9px] text-muted-foreground/40 font-mono">{priceHistory.length}/{MAX_POINTS}</div>
    </div>
  );
}
