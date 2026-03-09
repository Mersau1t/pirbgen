import { useRef, useEffect, useState, useCallback } from 'react';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
}

interface PriceChartProps {
  candles: Candle[];
  entryPrice: number;
  positive: boolean;
  direction: 'LONG' | 'SHORT';
  stopLoss: number;
  takeProfit: number;
  leverage: number;
  result?: 'WIN' | 'REKT' | null; // Додаємо результат для керування масштабом
}

const MAX_VISIBLE = 28;

function formatPrice(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return '$' + p.toFixed(3);
  if (abs >= 100) return '$' + p.toFixed(4);
  if (abs >= 1) return '$' + p.toFixed(5);
  if (abs >= 0.01) return '$' + p.toFixed(7);
  if (abs >= 0.0001) return '$' + p.toFixed(9);
  return '$' + p.toPrecision(6);
}

function formatPriceShort(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return p.toFixed(3);
  if (abs >= 100) return p.toFixed(4);
  if (abs >= 1) return p.toFixed(5);
  if (abs >= 0.01) return p.toFixed(7);
  return p.toPrecision(5);
}

/** Sharp line through points */
function sharpLinePath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
}

export default function PriceChart({ candles, entryPrice, positive, direction, stopLoss, takeProfit, leverage, result }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const animFrameRef = useRef(0);
  const timeRef = useRef(0);
  const zoomProgressRef = useRef(0); // 0 = focused, 1 = zoomed out
  const prevResultRef = useRef<string | null>(null);

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
    if (!canvas || candles.length < 1 || size.w === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;

    // Compute static values once
    const w = size.w;
    const h = size.h;
    const priceAxisW = 145;
    const timeAxisH = 22;
    const pad = { top: 14, bottom: timeAxisH + 4, left: 8, right: priceAxisW + 6 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const slPriceChange = stopLoss / leverage / 100;
    const tpPriceChange = takeProfit / leverage / 100;
    const slPrice = direction === 'LONG'
      ? entryPrice * (1 + slPriceChange)
      : entryPrice * (1 - slPriceChange);
    const tpPrice = direction === 'LONG'
      ? entryPrice * (1 + tpPriceChange)
      : entryPrice * (1 - tpPriceChange);

    // Scale boundaries (static)
    const focusedLower = Math.min(slPrice, tpPrice);
    const focusedUpper = Math.max(slPrice, tpPrice);
    
    let expandedLower = focusedLower;
    let expandedUpper = focusedUpper;
    if (result) {
      const last = candles[candles.length - 1];
      if (last) {
        expandedLower = Math.min(focusedLower, last.low, last.close);
        expandedUpper = Math.max(focusedUpper, last.high, last.close);
      }
    }

    if (!result) {
      zoomProgressRef.current = 0;
    }
    prevResultRef.current = result ?? null;

    const candleSpacing = chartW / Math.max(MAX_VISIBLE - 1, 1);
    const centerIdx = candles.length - 1;
    const centerX = pad.left + chartW / 2;
    const toX = (i: number) => centerX + (i - centerIdx) * candleSpacing;

    const lastClose = candles[candles.length - 1]?.close ?? entryPrice;
    const pnlPct = direction === 'LONG'
      ? ((lastClose - entryPrice) / entryPrice) * leverage * 100
      : ((entryPrice - lastClose) / entryPrice) * leverage * 100;
    const slProximity = Math.min(Math.abs(pnlPct / stopLoss), 1);
    const tpProximity = Math.min(Math.abs(pnlPct / takeProfit), 1);
    const proximity = Math.max(slProximity, tpProximity);

    const entryIdx = candles.findIndex(c => c.time >= 0);

    let running = true;

    const draw = (t: number) => {
      if (!running) return;
      timeRef.current = t;

      // --- Animated zoom lerp (runs every frame) ---
      const zoomTarget = result ? 1 : 0;
      zoomProgressRef.current += (zoomTarget - zoomProgressRef.current) * 0.04;
      if (Math.abs(zoomProgressRef.current - zoomTarget) < 0.001) zoomProgressRef.current = zoomTarget;
      const eased = 1 - Math.pow(1 - zoomProgressRef.current, 3);

      const lowerPrice = focusedLower + (expandedLower - focusedLower) * eased;
      const upperPrice = focusedUpper + (expandedUpper - focusedUpper) * eased;
      const boundaryRange = upperPrice - lowerPrice;
      const pricePad = boundaryRange * 0.08;
      const min = lowerPrice - pricePad;
      const max = upperPrice + pricePad;
      const range = max - min || 1;

      const toY = (v: number) => pad.top + chartH - ((v - min) / range) * chartH;
      const pts = candles.map((c, i) => ({ x: toX(i), y: toY(c.close) }));
      const entryX = entryIdx >= 0 ? toX(entryIdx) : pad.left;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = 'rgba(10, 6, 20, 0.6)';
      ctx.fillRect(pad.left, pad.top, chartW, chartH);

      // --- TP/SL GRADIENT ZONES WITH EFFECTS ---
      const tpYZone = toY(tpPrice);
      const slYZone = toY(slPrice);
      const entryYZone = toY(entryPrice);

      // Helper to draw zone with energy wave effect
      const drawZone = (yTop: number, yBot: number, color: string, isTP: boolean, prox: number) => {
        const zoneH = Math.abs(yBot - yTop);
        const zoneY = Math.min(yTop, yBot);
        if (zoneH < 1) return;

        // Base gradient fill (static, no pulsation)
        const baseAlpha = 0.08 + prox * 0.12;
        const grad = ctx.createLinearGradient(0, zoneY, 0, zoneY + zoneH);
        grad.addColorStop(0, `${color}${Math.round(baseAlpha * 255).toString(16).padStart(2, '0')}`);
        grad.addColorStop(1, `${color}00`);
        ctx.fillStyle = grad;
        ctx.fillRect(pad.left, zoneY, chartW, zoneH);

        // Horizontal energy waves (smooth sine waves moving through zone)
        ctx.save();
        ctx.beginPath();
        ctx.rect(pad.left, zoneY, chartW, zoneH);
        ctx.clip();
        const waveCount = 3;
        for (let wi = 0; wi < waveCount; wi++) {
          const waveY = zoneY + (zoneH / (waveCount + 1)) * (wi + 1);
          const waveOffset = t / (600 + wi * 200);
          const waveAlpha = 0.04 + prox * 0.08;
          ctx.beginPath();
          ctx.moveTo(pad.left, waveY);
          for (let wx = pad.left; wx <= pad.left + chartW; wx += 3) {
            const normalizedX = (wx - pad.left) / chartW;
            const dy = Math.sin(normalizedX * Math.PI * 4 + waveOffset + wi * 2) * (3 + prox * 8);
            ctx.lineTo(wx, waveY + dy);
          }
          ctx.strokeStyle = `${color}${Math.round(waveAlpha * 255).toString(16).padStart(2, '0')}`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();

        // Subtle horizontal scan lines (static, no flicker)
        ctx.save();
        ctx.beginPath();
        ctx.rect(pad.left, zoneY, chartW, zoneH);
        ctx.clip();
        for (let sy = zoneY; sy < zoneY + zoneH; sy += 6) {
          ctx.fillStyle = `${color}05`;
          ctx.fillRect(pad.left, sy, chartW, 1);
        }
        ctx.restore();

        // Glowing edge at boundary (only when close, smooth not blinking)
        if (prox > 0.4) {
          const edgeIntensity = (prox - 0.4) / 0.6; // 0→1 as prox goes 0.4→1
          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = 6 + edgeIntensity * 18;
          ctx.strokeStyle = `${color}${Math.round(edgeIntensity * 0.6 * 255).toString(16).padStart(2, '0')}`;
          ctx.lineWidth = 1.5 + edgeIntensity;
          const edgeY = isTP ? zoneY : zoneY + zoneH;
          ctx.beginPath();
          ctx.moveTo(pad.left, edgeY);
          ctx.lineTo(pad.left + chartW, edgeY);
          ctx.stroke();
          ctx.restore();
        }
      };

      // Green zone (TP)
      const greenTop = direction === 'LONG' ? tpYZone : entryYZone;
      const greenBot = direction === 'LONG' ? entryYZone : tpYZone;
      drawZone(greenTop, greenBot, '#07e46e', true, tpProximity);

      // Red zone (SL)
      const redTop = direction === 'LONG' ? entryYZone : slYZone;
      const redBot = direction === 'LONG' ? slYZone : entryYZone;
      drawZone(redTop, redBot, '#ef4444', false, slProximity);

      // --- GRID ---
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const gridSteps = 6;
      for (let i = 0; i <= gridSteps; i++) {
        const price = min + (range / gridSteps) * i;
        const y = toY(price);
        ctx.strokeStyle = 'rgba(128, 70, 220, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
        ctx.fillStyle = 'rgba(200, 180, 255, 0.35)';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(formatPrice(price), pad.left + chartW + 8, y);
      }

      // --- CRT SCANLINES ---
      ctx.save();
      for (let sy = pad.top; sy < pad.top + chartH; sy += 3) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.fillRect(pad.left, sy, chartW, 1);
      }
      // CRT flicker
      const flicker = 0.02 + 0.015 * Math.sin(t / 80);
      ctx.fillStyle = `rgba(200, 180, 255, ${flicker})`;
      ctx.fillRect(pad.left, pad.top, chartW, chartH);
      ctx.restore();

      // --- SMOOTH PRICE LINE ---
      if (pts.length > 1) {
        // Animated glow intensity based on proximity to TP/SL
        const glowBase = 6 + proximity * 12;
        const glowAnim = glowBase + proximity * 4; // no pulsation on glow
        const glowColor = positive ? '#07e46e' : '#ef4444';
        const lineGlowColor = proximity > 0.7 ? glowColor : '#8046dc';

        // --- GRADIENT FILL UNDER LINE ---
        ctx.save();
        ctx.beginPath();
        sharpLinePath(ctx, pts);
        ctx.lineTo(pts[pts.length - 1].x, pad.top + chartH);
        ctx.lineTo(pts[0].x, pad.top + chartH);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
        if (positive) {
          fillGrad.addColorStop(0, 'rgba(7, 228, 110, 0.20)');
          fillGrad.addColorStop(0.5, 'rgba(7, 228, 110, 0.06)');
          fillGrad.addColorStop(1, 'rgba(7, 228, 110, 0.0)');
        } else {
          fillGrad.addColorStop(0, 'rgba(239, 68, 68, 0.20)');
          fillGrad.addColorStop(0.5, 'rgba(239, 68, 68, 0.06)');
          fillGrad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
        }
        ctx.fillStyle = fillGrad;
        ctx.fill();
        ctx.restore();

        // Outer glow (intensifies near TP/SL)
        ctx.save();
        ctx.beginPath();
        sharpLinePath(ctx, pts);
        ctx.strokeStyle = proximity > 0.6
          ? (positive ? `rgba(7, 228, 110, ${0.15 + pulse * 0.15})` : `rgba(239, 68, 68, ${0.15 + pulse * 0.15})`)
          : 'rgba(200, 180, 255, 0.2)';
        ctx.lineWidth = 6;
        ctx.shadowColor = lineGlowColor;
        ctx.shadowBlur = glowAnim;
        ctx.stroke();
        ctx.restore();

        // Middle glow
        ctx.save();
        ctx.beginPath();
        sharpLinePath(ctx, pts);
        ctx.strokeStyle = proximity > 0.6
          ? (positive ? 'rgba(7, 228, 110, 0.35)' : 'rgba(239, 68, 68, 0.35)')
          : 'rgba(200, 180, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.shadowColor = lineGlowColor;
        ctx.shadowBlur = glowAnim * 0.5;
        ctx.stroke();
        ctx.restore();

        // Main crisp line
        ctx.beginPath();
        sharpLinePath(ctx, pts);
        ctx.strokeStyle = '#e0d4ff';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // --- PULSATING DOT ---
        const lastPt = pts[pts.length - 1];
        const dotColor = positive ? '#07e46e' : '#ef4444';
        const dotPulse = 0.5 + 0.5 * Math.sin(t / 200);
        const dotR = 3 + dotPulse * 2.5;
        const ringR = dotR + 3 + dotPulse * 4;

        // Outer ring glow
        ctx.save();
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, ringR, 0, Math.PI * 2);
        ctx.fillStyle = dotColor + Math.round(20 + dotPulse * 30).toString(16).padStart(2, '0');
        ctx.shadowColor = dotColor;
        ctx.shadowBlur = 15 + dotPulse * 10;
        ctx.fill();
        ctx.restore();

        // Inner dot
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        // White center
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#F5F5FF';
        ctx.fill();

        // --- SPARK PARTICLES ---
        const sparkCount = Math.floor(3 + proximity * 8);
        ctx.save();
        for (let sp = 0; sp < sparkCount; sp++) {
          const angle = (t / 400 + sp * (Math.PI * 2 / sparkCount)) % (Math.PI * 2);
          const dist = 8 + Math.sin(t / 200 + sp * 1.3) * (6 + proximity * 12);
          const sx = lastPt.x + Math.cos(angle) * dist;
          const sy = lastPt.y + Math.sin(angle) * dist;
          const sparkAlpha = 0.3 + proximity * 0.5 + Math.sin(t / 150 + sp) * 0.2;
          const sparkSize = 1 + proximity * 1.5 + Math.sin(t / 120 + sp * 2) * 0.5;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(sparkSize, 0.5), 0, Math.PI * 2);
          ctx.fillStyle = dotColor + Math.round(Math.min(sparkAlpha * 255, 255)).toString(16).padStart(2, '0');
          ctx.shadowColor = dotColor;
          ctx.shadowBlur = 4 + proximity * 6;
          ctx.fill();
        }
        ctx.restore();
      }

      // --- ENTRY LINE ---
      const entryY = toY(entryPrice);
      ctx.strokeStyle = '#8046dc';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#8046dc';
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(pad.left, entryY); ctx.lineTo(pad.left + chartW, entryY); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      ctx.fillStyle = '#8046dc';
      ctx.fillRect(pad.left + chartW + 4, entryY - 10, priceAxisW - 8, 20);
      ctx.fillStyle = '#F5F5FF';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(formatPrice(entryPrice), pad.left + chartW + 7, entryY);

      // --- TAKE PROFIT LINE ---
      const tpY = toY(tpPrice);
      const tpPulse = tpProximity > 0.6 ? (0.5 + 0.5 * Math.sin(t / 250)) : 0;
      ctx.save();
      ctx.strokeStyle = `rgba(7, 228, 110, ${0.4 + tpPulse * 0.4})`;
      ctx.setLineDash([6, 3]);
      ctx.lineWidth = 1 + tpPulse;
      if (tpProximity > 0.6) {
        ctx.shadowColor = '#07e46e';
        ctx.shadowBlur = 6 + tpPulse * 12;
      }
      ctx.beginPath(); ctx.moveTo(pad.left, tpY); ctx.lineTo(pad.left + chartW, tpY); ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
      ctx.fillStyle = '#07e46e';
      ctx.fillRect(pad.left + chartW + 4, tpY - 10, priceAxisW - 8, 20);
      ctx.fillStyle = '#0a0a0a';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('TP ' + formatPriceShort(tpPrice), pad.left + chartW + 6, tpY);

      // --- STOP LOSS LINE ---
      const slY = toY(slPrice);
      const slPulse = slProximity > 0.6 ? (0.5 + 0.5 * Math.sin(t / 250)) : 0;
      ctx.save();
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + slPulse * 0.4})`;
      ctx.setLineDash([6, 3]);
      ctx.lineWidth = 1 + slPulse;
      if (slProximity > 0.6) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6 + slPulse * 12;
      }
      ctx.beginPath(); ctx.moveTo(pad.left, slY); ctx.lineTo(pad.left + chartW, slY); ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(pad.left + chartW + 4, slY - 10, priceAxisW - 8, 20);
      ctx.fillStyle = '#F5F5FF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('SL ' + formatPriceShort(slPrice), pad.left + chartW + 6, slY);

      // --- CURRENT PRICE TAG ---
      if (candles.length > 0) {
        const curY = toY(lastClose);
        const curColor = positive ? '#07e46e' : '#ef4444';
        ctx.strokeStyle = curColor + '40';
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, curY); ctx.lineTo(pad.left + chartW, curY); ctx.stroke();
        ctx.setLineDash([]);
        // Animated tag
        const tagPulse = 0.5 + 0.5 * Math.sin(t / 400);
        ctx.save();
        ctx.shadowColor = curColor;
        ctx.shadowBlur = 4 + tagPulse * 6;
        ctx.fillStyle = curColor;
        ctx.fillRect(pad.left + chartW + 4, curY - 10, priceAxisW - 8, 20);
        ctx.restore();
        ctx.fillStyle = '#0a0a0a';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatPrice(lastClose), pad.left + chartW + 7, curY);
      }

      // --- ENTRY VERTICAL MARKER ---
      if (entryIdx > 0) {
        ctx.strokeStyle = 'rgba(128, 70, 220, 0.3)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(entryX, pad.top); ctx.lineTo(entryX, pad.top + chartH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#8046dc';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = '#8046dc';
        ctx.shadowBlur = 6;
        ctx.fillText('▼ ENTRY', entryX, pad.top - 1);
        ctx.shadowBlur = 0;
      }

      // --- TIME AXIS ---
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const timeY = pad.top + chartH + 5;
      candles.forEach((candle, i) => {
        if (candles.length > 10 && i % 4 !== 0 && i !== candles.length - 1) return;
        const x = toX(i);
        const sec = candle.time;
        const absSec = Math.abs(sec);
        const m = Math.floor(absSec / 60);
        const s = absSec % 60;
        const prefix = sec < 0 ? '-' : '';
        ctx.fillStyle = sec < 0 ? 'rgba(200,180,255,0.15)' : 'rgba(200,180,255,0.3)';
        ctx.fillText(`${prefix}${m}:${s.toString().padStart(2, '0')}`, x, timeY);
      });

      // --- AXIS BORDERS ---
      ctx.strokeStyle = 'rgba(128, 70, 220, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, pad.top + chartH); ctx.lineTo(pad.left + chartW, pad.top + chartH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.left + chartW, pad.top); ctx.lineTo(pad.left + chartW, pad.top + chartH); ctx.stroke();

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [candles, entryPrice, positive, size, direction, stopLoss, takeProfit, leverage, result]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
      <div className="absolute top-1 left-3 text-[9px] text-muted-foreground/40 font-mono tracking-wider">PYTH LIVE</div>
    </div>
  );
}
