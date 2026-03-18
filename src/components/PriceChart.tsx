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
  result?: 'WIN' | 'REKT' | null;
  duelMode?: boolean;
  spectator?: boolean;
}

const MAX_VISIBLE = 28;

function formatPrice(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return '$' + p.toFixed(2);
  if (abs >= 100) return '$' + p.toFixed(3);
  if (abs >= 1) return '$' + p.toFixed(4);
  if (abs >= 0.01) return '$' + p.toFixed(6);
  if (abs >= 0.0001) return '$' + p.toFixed(8);
  // Very small prices: use subscript notation e.g. $0.0₅3736
  return formatTinyPrice(p);
}

function formatPriceShort(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return p.toFixed(2);
  if (abs >= 100) return p.toFixed(3);
  if (abs >= 1) return p.toFixed(4);
  if (abs >= 0.01) return p.toFixed(6);
  return formatTinyPrice(p).replace('$', '');
}

// Format very small prices compactly: $0.0{5}3736 style → "$0.0₅3736"
function formatTinyPrice(p: number): string {
  const abs = Math.abs(p);
  if (abs === 0) return '$0';
  const str = abs.toFixed(20);
  // Count leading zeros after "0."
  const match = str.match(/^0\.0*/);
  if (!match) return '$' + abs.toPrecision(4);
  const leadingZeros = match[0].length - 2; // subtract "0."
  if (leadingZeros <= 3) return '$' + abs.toFixed(leadingZeros + 4);
  // Show as $0.0₅3736 (subscript number = count of zeros)
  const significant = str.slice(match[0].length, match[0].length + 4);
  const sign = p < 0 ? '-' : '';
  return `${sign}$0.0\u2080${String.fromCharCode(0x2080 + leadingZeros)}${significant}`;
}

// Mobile-aware short format (fewer decimals)
function formatPriceMobile(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return '$' + (p / 1000).toFixed(1) + 'k';
  if (abs >= 1000) return '$' + p.toFixed(2);
  if (abs >= 100) return '$' + p.toFixed(3);
  if (abs >= 1) return '$' + p.toFixed(4);
  if (abs >= 0.01) return '$' + p.toFixed(5);
  return formatTinyPrice(p);
}

function sharpLinePath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
}

export default function PriceChart({ candles, entryPrice, positive, direction, stopLoss, takeProfit, leverage, result, duelMode, spectator }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const animFrameRef = useRef(0);
  const timeRef = useRef(0);
  const zoomProgressRef = useRef(0);
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

    const w = size.w;
    const h = size.h;

    // --- RESPONSIVE VALUES ---
    const isMobile = w < 480;
    const isSmall = w < 640;
    // Dynamic axis width: wider for normal prices, narrower for tiny/huge prices (compact format)
    const baseAxisW = isMobile ? 80 : isSmall ? 100 : 130;
    const priceAxisW = baseAxisW;
    const timeAxisH = isMobile ? 18 : 22;
    const gridFontSize = isMobile ? 9 : isSmall ? 10 : 12;
    const priceFontSize = isMobile ? 9 : isSmall ? 11 : 12;
    const labelFontSize = isMobile ? 8 : isSmall ? 10 : 11;
    const entryLabelSize = isMobile ? 7 : 8;
    const timeFontSize = isMobile ? 7 : 8;
    const tagW = priceAxisW - 8;
    const tagH = isMobile ? 18 : 22;

    const pad = { top: isMobile ? 10 : 14, bottom: timeAxisH + 4, left: isMobile ? 4 : 8, right: priceAxisW + 6 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const formatFn = isMobile ? formatPriceMobile : formatPrice;
    const formatShortFn = isMobile ? ((p: number) => formatPriceMobile(p).replace('$', '')) : formatPriceShort;

    const slPriceChange = stopLoss / leverage / 100;
    const tpPriceChange = takeProfit / leverage / 100;
    const slPrice = direction === 'LONG'
      ? entryPrice * (1 + slPriceChange)
      : entryPrice * (1 - slPriceChange);
    const tpPrice = direction === 'LONG'
      ? entryPrice * (1 + tpPriceChange)
      : entryPrice * (1 - tpPriceChange);

    let focusedLower: number, focusedUpper: number;
    if (duelMode) {
      const allPrices = candles.flatMap(c => [c.high, c.low, c.close, c.open]);
      allPrices.push(entryPrice);
      focusedLower = Math.min(...allPrices);
      focusedUpper = Math.max(...allPrices);
    } else {
      focusedLower = Math.min(slPrice, tpPrice);
      focusedUpper = Math.max(slPrice, tpPrice);
    }
    
    let expandedLower = focusedLower;
    let expandedUpper = focusedUpper;
    if (result && !duelMode) {
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

      if (!duelMode) {
      // --- TP/SL GRADIENT ZONES ---
      const tpYZone = toY(tpPrice);
      const slYZone = toY(slPrice);
      const entryYZone = toY(entryPrice);

      const drawZone = (yTop: number, yBot: number, color: string, isTP: boolean, prox: number) => {
        const zoneH = Math.abs(yBot - yTop);
        const zoneY = Math.min(yTop, yBot);
        if (zoneH < 1) return;

        const baseAlpha = 0.08 + prox * 0.12;
        const grad = ctx.createLinearGradient(0, zoneY, 0, zoneY + zoneH);
        grad.addColorStop(0, `${color}${Math.round(baseAlpha * 255).toString(16).padStart(2, '0')}`);
        grad.addColorStop(1, `${color}00`);
        ctx.fillStyle = grad;
        ctx.fillRect(pad.left, zoneY, chartW, zoneH);

        // Wave effect (skip on very small screens for perf)
        if (!isMobile) {
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
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(pad.left, zoneY, chartW, zoneH);
        ctx.clip();
        for (let sy = zoneY; sy < zoneY + zoneH; sy += 6) {
          ctx.fillStyle = `${color}05`;
          ctx.fillRect(pad.left, sy, chartW, 1);
        }
        ctx.restore();

        if (prox > 0.4) {
          const edgeIntensity = (prox - 0.4) / 0.6;
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

      const greenTop = direction === 'LONG' ? tpYZone : entryYZone;
      const greenBot = direction === 'LONG' ? entryYZone : tpYZone;
      drawZone(greenTop, greenBot, '#07e46e', true, tpProximity);

      const redTop = direction === 'LONG' ? entryYZone : slYZone;
      const redBot = direction === 'LONG' ? slYZone : entryYZone;
      drawZone(redTop, redBot, '#ef4444', false, slProximity);
      }

      // --- GRID ---
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const gridSteps = isMobile ? 4 : 6;
      for (let i = 0; i <= gridSteps; i++) {
        const price = min + (range / gridSteps) * i;
        const y = toY(price);
        ctx.strokeStyle = 'rgba(128, 70, 220, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
        ctx.fillStyle = 'rgba(200, 180, 255, 0.35)';
        ctx.font = `bold ${gridFontSize}px monospace`;
        ctx.fillText(formatFn(price), pad.left + chartW + 8, y);
      }

      // --- CRT SCANLINES (skip on mobile for perf) ---
      if (!isMobile) {
        ctx.save();
        for (let sy = pad.top; sy < pad.top + chartH; sy += 3) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
          ctx.fillRect(pad.left, sy, chartW, 1);
        }
        const flicker = 0.015 + 0.008 * Math.sin(t / 120);
        ctx.fillStyle = `rgba(200, 180, 255, ${flicker})`;
        ctx.fillRect(pad.left, pad.top, chartW, chartH);
        ctx.restore();
      }

      // --- SMOOTH PRICE LINE ---
      if (pts.length > 1) {
        const neutralLine = '#c8b4ff';
        const neutralDot = '#e0d4ff';
        const neutralGlow = '#8046dc';

        const glowBase = spectator ? 6 : 6 + proximity * 12;
        const glowAnim = spectator ? 8 : glowBase + proximity * 4;
        const glowColor = spectator ? neutralGlow : (positive ? '#07e46e' : '#ef4444');
        const lineGlowColor = spectator ? neutralGlow : (proximity > 0.7 ? glowColor : '#8046dc');

        // Gradient fill under line
        ctx.save();
        ctx.beginPath();
        sharpLinePath(ctx, pts);
        ctx.lineTo(pts[pts.length - 1].x, pad.top + chartH);
        ctx.lineTo(pts[0].x, pad.top + chartH);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
        if (spectator) {
          fillGrad.addColorStop(0, 'rgba(200, 180, 255, 0.12)');
          fillGrad.addColorStop(0.5, 'rgba(200, 180, 255, 0.04)');
          fillGrad.addColorStop(1, 'rgba(200, 180, 255, 0.0)');
        } else if (positive) {
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

        // Outer glow
        ctx.save();
        ctx.beginPath();
        sharpLinePath(ctx, pts);
        ctx.strokeStyle = spectator ? 'rgba(200, 180, 255, 0.15)' : (proximity > 0.7
          ? (positive ? 'rgba(7, 228, 110, 0.2)' : 'rgba(239, 68, 68, 0.2)')
          : 'rgba(200, 180, 255, 0.15)');
        ctx.lineWidth = isMobile ? 4 : 6;
        ctx.shadowColor = lineGlowColor;
        ctx.shadowBlur = glowAnim;
        ctx.stroke();
        ctx.restore();

        // Middle glow
        ctx.save();
        ctx.beginPath();
        sharpLinePath(ctx, pts);
        ctx.strokeStyle = spectator ? 'rgba(200, 180, 255, 0.3)' : (proximity > 0.7
          ? (positive ? 'rgba(7, 228, 110, 0.3)' : 'rgba(239, 68, 68, 0.3)')
          : 'rgba(200, 180, 255, 0.3)');
        ctx.lineWidth = isMobile ? 2 : 3;
        ctx.shadowColor = lineGlowColor;
        ctx.shadowBlur = glowAnim * 0.5;
        ctx.stroke();
        ctx.restore();

        // Main crisp line
        ctx.beginPath();
        sharpLinePath(ctx, pts);
        ctx.strokeStyle = '#e0d4ff';
        ctx.lineWidth = isMobile ? 1.5 : 1.8;
        ctx.stroke();

        // --- PULSATING DOT ---
        const lastPt = pts[pts.length - 1];
        const dotColor = spectator ? neutralDot : (positive ? '#07e46e' : '#ef4444');
        const dotPulse = 0.7 + 0.3 * Math.sin(t / 500);
        const dotR = (isMobile ? 2.5 : 3.5) + dotPulse * 1.2;
        const ringR = dotR + 2 + dotPulse * 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, ringR, 0, Math.PI * 2);
        ctx.fillStyle = dotColor + Math.round(20 + dotPulse * 30).toString(16).padStart(2, '0');
        ctx.shadowColor = dotColor;
        ctx.shadowBlur = 15 + dotPulse * 10;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#F5F5FF';
        ctx.fill();

        // --- SPARK PARTICLES (fewer on mobile) ---
        const sparkCount = isMobile ? 2 : (spectator ? 3 : Math.floor(3 + proximity * 8));
        ctx.save();
        for (let sp = 0; sp < sparkCount; sp++) {
          const angle = (t / 400 + sp * (Math.PI * 2 / sparkCount)) % (Math.PI * 2);
          const dist = 8 + Math.sin(t / 200 + sp * 1.3) * (spectator ? 6 : (6 + proximity * 12));
          const sx = lastPt.x + Math.cos(angle) * dist;
          const sy = lastPt.y + Math.sin(angle) * dist;
          const sparkAlpha = spectator ? 0.3 : (0.3 + proximity * 0.5 + Math.sin(t / 150 + sp) * 0.2);
          const sparkSize = spectator ? 1 : (1 + proximity * 1.5 + Math.sin(t / 120 + sp * 2) * 0.5);
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(sparkSize, 0.5), 0, Math.PI * 2);
          ctx.fillStyle = dotColor + Math.round(Math.min(sparkAlpha * 255, 255)).toString(16).padStart(2, '0');
          ctx.shadowColor = dotColor;
          ctx.shadowBlur = 4 + (spectator ? 2 : proximity * 6);
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

      // Collect all price tags, then resolve overlaps before drawing
      const priceTags: { y: number; color: string; textColor: string; label: string; priority: number }[] = [];
      
      priceTags.push({ y: entryY, color: '#8046dc', textColor: '#F5F5FF', label: formatFn(entryPrice), priority: 2 });

      if (!duelMode) {
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
      priceTags.push({ y: tpY, color: '#07e46e', textColor: '#0a0a0a', label: 'TP ' + formatShortFn(tpPrice), priority: 1 });

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
      priceTags.push({ y: slY, color: '#ef4444', textColor: '#F5F5FF', label: 'SL ' + formatShortFn(slPrice), priority: 1 });
      }

      // --- CURRENT PRICE TAG ---
      if (candles.length > 0) {
        const curY = toY(lastClose);
        const curColor = spectator ? '#c8b4ff' : (positive ? '#07e46e' : '#ef4444');
        ctx.strokeStyle = curColor + '40';
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, curY); ctx.lineTo(pad.left + chartW, curY); ctx.stroke();
        ctx.setLineDash([]);
        priceTags.push({ y: curY, color: curColor, textColor: '#0a0a0a', label: formatFn(lastClose), priority: 3 });
      }

      // --- RESOLVE OVERLAPPING PRICE TAGS ---
      // Sort by priority (highest = most important, drawn last / gets best position)
      priceTags.sort((a, b) => a.priority - b.priority);
      const minGap = tagH + 2;
      const resolvedTags = priceTags.map(tag => ({ ...tag, resolvedY: tag.y }));
      
      // Simple collision resolution: push overlapping tags apart
      for (let pass = 0; pass < 5; pass++) {
        resolvedTags.sort((a, b) => a.resolvedY - b.resolvedY);
        for (let i = 1; i < resolvedTags.length; i++) {
          const gap = resolvedTags[i].resolvedY - resolvedTags[i - 1].resolvedY;
          if (gap < minGap) {
            const overlap = minGap - gap;
            resolvedTags[i - 1].resolvedY -= overlap / 2;
            resolvedTags[i].resolvedY += overlap / 2;
          }
        }
      }

      // Draw all price tags at resolved positions
      for (const tag of resolvedTags) {
        ctx.save();
        if (tag.priority === 3) { // current price gets glow
          ctx.shadowColor = tag.color;
          ctx.shadowBlur = 6;
        }
        ctx.fillStyle = tag.color;
        ctx.fillRect(pad.left + chartW + 4, tag.resolvedY - tagH / 2, tagW, tagH);
        ctx.restore();
        ctx.fillStyle = tag.textColor;
        ctx.font = `bold ${tag.priority >= 2 ? priceFontSize : labelFontSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag.label, pad.left + chartW + 6, tag.resolvedY);
      }

      // --- ENTRY VERTICAL MARKER ---
      if (entryIdx > 0) {
        ctx.strokeStyle = 'rgba(128, 70, 220, 0.3)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(entryX, pad.top); ctx.lineTo(entryX, pad.top + chartH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#8046dc';
        ctx.font = `bold ${entryLabelSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = '#8046dc';
        ctx.shadowBlur = 6;
        ctx.fillText('▼ ENTRY', entryX, pad.top - 1);
        ctx.shadowBlur = 0;
      }

      // --- TIME AXIS ---
      ctx.font = `${timeFontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const timeY = pad.top + chartH + 5;
      const timeStep = isMobile ? 6 : 4;
      candles.forEach((candle, i) => {
        if (candles.length > 10 && i % timeStep !== 0 && i !== candles.length - 1) return;
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
  }, [candles, entryPrice, positive, size, direction, stopLoss, takeProfit, leverage, result, duelMode, spectator]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
      <div className="absolute top-1 left-2 sm:left-3 text-[7px] sm:text-[9px] text-muted-foreground/40 font-mono tracking-wider">PYTH LIVE</div>
    </div>
  );
}