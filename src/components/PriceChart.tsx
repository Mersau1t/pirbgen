import { useRef, useEffect, useState } from 'react';

interface PriceChartProps {
  priceHistory: number[];
  entryPrice: number;
  positive: boolean;
}

const MAX_POINTS = 10;

export default function PriceChart({ priceHistory, entryPrice, positive }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Track container size
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
    if (!canvas || priceHistory.length < 2 || size.w === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.scale(dpr, dpr);

    const w = size.w;
    const h = size.h;
    const data = priceHistory.slice(-MAX_POINTS);

    const min = Math.min(...data, entryPrice) * 0.9995;
    const max = Math.max(...data, entryPrice) * 1.0005;
    const range = max - min || 1;

    const toX = (i: number) => (i / (MAX_POINTS - 1)) * w;
    const toY = (v: number) => h - ((v - min) / range) * h;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Entry price dashed line
    const entryY = toY(entryPrice);
    ctx.strokeStyle = 'rgba(245,245,255,0.2)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, entryY);
    ctx.lineTo(w, entryY);
    ctx.stroke();
    ctx.setLineDash([]);

    const lineColor = positive ? '#07e46e' : '#ef4444';

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, positive ? 'rgba(7,228,110,0.15)' : 'rgba(239,68,68,0.15)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

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

    // Line
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

    // Dot
    const lastX = toX(data.length - 1);
    const lastY = toY(data[data.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [priceHistory, entryPrice, positive, size]);

  return (
    <div ref={containerRef} className="w-full h-32 sm:h-40 relative">
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
