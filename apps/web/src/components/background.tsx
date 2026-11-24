'use client';

// Fundo do site: um olho humano desenhado em canvas. Pálpebras, cílios e a parte
// branca ficam desfocados ao fundo; a íris (verde com o centro âmbar, como num
// olho real) fica nítida e se move dentro do olho, olhando para o ponteiro do
// mouse. Sem mouse (celular), o olho olha devagar ao redor. Respeita
// prefers-reduced-motion. Tudo é desenhado do zero (nenhuma foto de terceiros).
import { useEffect, useRef } from 'react';

function makeRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Contorno do olho (amêndoa) proporcional ao palco. */
function eyePath(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.beginPath();
  ctx.moveTo(0.08 * W, 0.53 * H); // canto interno
  ctx.bezierCurveTo(0.24 * W, 0.18 * H, 0.66 * W, 0.08 * H, 0.93 * W, 0.47 * H); // pálpebra superior
  ctx.bezierCurveTo(0.72 * W, 0.86 * H, 0.3 * W, 0.92 * H, 0.08 * W, 0.53 * H); // pálpebra inferior
  ctx.closePath();
}

/** Íris realista (sem a pupila, que é desenhada a cada quadro para "respirar"). */
function renderIris(size: number) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const rnd = makeRand(424242);
  const c = size / 2;
  const R = size * 0.49;
  const rp = R * 0.27;
  const k = size / 1000;
  const P = (a: number, r: number) => [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;

  // base: âmbar no centro → oliva → verde → verde acinzentado → borda escura
  const g = ctx.createRadialGradient(c, c, rp * 0.8, c, c, R);
  g.addColorStop(0, '#9c5418');
  g.addColorStop(0.1, '#c27a26');
  g.addColorStop(0.2, '#9a8a35');
  g.addColorStop(0.32, '#6f9a4c');
  g.addColorStop(0.5, '#5d9a63');
  g.addColorStop(0.7, '#5f8f78');
  g.addColorStop(0.86, '#3b6553');
  g.addColorStop(1, '#13241d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();

  // manchas suaves de cor (ruído ampliado)
  const n = document.createElement('canvas');
  n.width = n.height = 48;
  const nx = n.getContext('2d')!;
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const v = rnd();
      nx.fillStyle = v > 0.6 ? `rgba(180,210,150,${v * 0.5})` : v < 0.3 ? `rgba(20,50,35,${(1 - v) * 0.5})` : `rgba(120,150,70,${v * 0.3})`;
      nx.fillRect(x, y, 1, 1);
    }
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.55;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(n, 0, 0, size, size);
  ctx.restore();

  // explosão âmbar em volta da pupila (heterocromia central)
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 420; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = rp * (0.95 + rnd() * 0.1);
    const r1 = rp * (1.4 + rnd() * rnd() * 1.6);
    const [x0, y0] = P(a, r0);
    const [x1, y1] = P(a + (rnd() - 0.5) * 0.05, r1);
    ctx.strokeStyle = rnd() > 0.35 ? `rgba(214,124,36,${0.12 + rnd() * 0.3})` : `rgba(120,58,16,${0.15 + rnd() * 0.3})`;
    ctx.lineWidth = (1 + rnd() * 3.5) * k;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // fibras do estroma: finas, onduladas, claras e escuras
  const fiber = (count: number, light: boolean) => {
    ctx.globalCompositeOperation = light ? 'screen' : 'multiply';
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r0 = rp * (1.05 + rnd() * 0.6);
      const r1 = Math.min(R * 0.97, r0 + R * (0.2 + rnd() * 0.65));
      const w1 = (rnd() - 0.5) * 0.07, w2 = (rnd() - 0.5) * 0.07;
      const [x0, y0] = P(a, r0);
      const [xa, ya] = P(a + w1, r0 + (r1 - r0) * 0.33);
      const [xb, yb] = P(a + w2, r0 + (r1 - r0) * 0.66);
      const [x1, y1] = P(a + (w1 + w2) / 3, r1);
      if (light) {
        const tone = ['214,236,200', '190,224,190', '232,240,214', '170,214,180'][Math.floor(rnd() * 4)];
        ctx.strokeStyle = `rgba(${tone},${0.05 + rnd() * 0.16})`;
      } else {
        ctx.strokeStyle = `rgba(18,48,34,${0.06 + rnd() * 0.2})`;
      }
      ctx.lineWidth = (0.35 + rnd() * 1.3) * k;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(xa, ya, xb, yb, x1, y1);
      ctx.stroke();
    }
  };
  fiber(1800, false);
  fiber(3600, true);

  // criptas discretas
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = `blur(${1.2 * k}px)`;
  for (let i = 0; i < 55; i++) {
    const a = rnd() * Math.PI * 2;
    const [x, y] = P(a, R * (0.45 + rnd() * 0.38));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (rnd() - 0.5) * 0.4);
    ctx.fillStyle = `rgba(20,45,32,${0.12 + rnd() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * (0.02 + rnd() * 0.05), R * (0.006 + rnd() * 0.014), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.filter = 'none';

  // colarete irregular
  ctx.globalCompositeOperation = 'screen';
  ctx.beginPath();
  const rc = rp * 1.95;
  for (let d = 0; d <= 360; d += 2) {
    const a = (d * Math.PI) / 180;
    const rr = rc * (1 + Math.sin(a * 9 + 0.7) * 0.035 + Math.sin(a * 17) * 0.02 + (rnd() - 0.5) * 0.04);
    const [x, y] = P(a, rr);
    d ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(236,220,170,0.22)';
  ctx.lineWidth = 3 * k;
  ctx.stroke();

  // pintinhas claras
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 70; i++) {
    const [x, y] = P(rnd() * Math.PI * 2, R * (0.4 + rnd() * 0.5));
    ctx.fillStyle = `rgba(240,236,205,${0.08 + rnd() * 0.18})`;
    ctx.beginPath();
    ctx.arc(x, y, (0.6 + rnd() * 1.8) * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // anel límbico escuro
  const limb = ctx.createRadialGradient(c, c, R * 0.8, c, c, R);
  limb.addColorStop(0, 'rgba(8,22,16,0)');
  limb.addColorStop(0.7, 'rgba(8,22,16,0.55)');
  limb.addColorStop(1, 'rgba(4,12,9,0.95)');
  ctx.fillStyle = limb;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();

  // granulado
  for (let i = 0; i < 14000; i++) {
    const [x, y] = P(rnd() * Math.PI * 2, Math.sqrt(rnd()) * R);
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, k, k);
  }

  // borda suave (sem serrilhado)
  ctx.globalCompositeOperation = 'destination-in';
  const edge = ctx.createRadialGradient(c, c, R * 0.965, c, c, R);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

/** Olho em volta (pele, branco do olho, cílios), já desfocado e escurecido. */
function renderSurround(W: number, H: number) {
  const raw = document.createElement('canvas');
  raw.width = W;
  raw.height = H;
  const ctx = raw.getContext('2d')!;
  const rnd = makeRand(777);
  const k = W / 1600;

  // pele em penumbra
  const skin = ctx.createRadialGradient(0.5 * W, 0.45 * H, 0, 0.5 * W, 0.5 * H, 0.75 * W);
  skin.addColorStop(0, '#6b4632');
  skin.addColorStop(0.35, '#4a2e20');
  skin.addColorStop(0.7, '#1f130c');
  skin.addColorStop(1, '#050302');
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, W, H);

  // vinco da pálpebra superior
  ctx.strokeStyle = 'rgba(30,16,10,0.55)';
  ctx.lineWidth = 10 * k;
  ctx.beginPath();
  ctx.moveTo(0.12 * W, 0.42 * H);
  ctx.bezierCurveTo(0.3 * W, 0.02 * H, 0.7 * W, -0.04 * H, 0.95 * W, 0.36 * H);
  ctx.stroke();

  // branco do olho
  ctx.save();
  eyePath(ctx, W, H);
  ctx.clip();
  const scl = ctx.createRadialGradient(0.52 * W, 0.55 * H, 0, 0.52 * W, 0.5 * H, 0.48 * W);
  scl.addColorStop(0, '#f3efe9');
  scl.addColorStop(0.35, '#e2d9d0');
  scl.addColorStop(0.7, '#bfa79b');
  scl.addColorStop(1, '#7a5a4e');
  ctx.fillStyle = scl;
  ctx.fillRect(0, 0, W, H);
  // carúncula (canto interno rosado)
  const car = ctx.createRadialGradient(0.1 * W, 0.53 * H, 0, 0.1 * W, 0.53 * H, 0.08 * W);
  car.addColorStop(0, 'rgba(196,110,104,0.95)');
  car.addColorStop(1, 'rgba(196,110,104,0)');
  ctx.fillStyle = car;
  ctx.fillRect(0, 0, W, H);
  // veias finas
  for (let i = 0; i < 22; i++) {
    const left = rnd() > 0.5;
    let x = left ? 0.12 * W + rnd() * 0.08 * W : 0.88 * W - rnd() * 0.08 * W;
    let y = 0.35 * H + rnd() * 0.35 * H;
    ctx.strokeStyle = `rgba(170,60,55,${0.12 + rnd() * 0.25})`;
    ctx.lineWidth = (0.8 + rnd() * 1.6) * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (left ? 1 : -1) * (12 + rnd() * 26) * k;
      y += (rnd() - 0.5) * 30 * k;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // sombra da pálpebra superior sobre o olho
  const lid = ctx.createLinearGradient(0, 0.1 * H, 0, 0.55 * H);
  lid.addColorStop(0, 'rgba(40,20,12,0.85)');
  lid.addColorStop(1, 'rgba(40,20,12,0)');
  ctx.fillStyle = lid;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // margens das pálpebras
  eyePath(ctx, W, H);
  ctx.strokeStyle = 'rgba(70,30,24,0.9)';
  ctx.lineWidth = 9 * k;
  ctx.stroke();

  // cílios superiores e inferiores
  const lash = (t: number, upper: boolean) => {
    const B = (p0: number, p1: number, p2: number, p3: number) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
    const x = upper ? B(0.08, 0.24, 0.66, 0.93) * W : B(0.93, 0.72, 0.3, 0.08) * W;
    const y = upper ? B(0.53, 0.18, 0.08, 0.47) * H : B(0.47, 0.86, 0.92, 0.53) * H;
    const len = (upper ? 70 + rnd() * 90 : 25 + rnd() * 35) * k * (upper ? Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.8 + 0.3 : 1);
    const dir = upper ? -1 : 1;
    const curl = (upper ? (t - 0.35) * 1.4 : (0.5 - t) * 0.8) + (rnd() - 0.5) * 0.3;
    ctx.strokeStyle = `rgba(14,8,5,${0.6 + rnd() * 0.35})`;
    ctx.lineWidth = (upper ? 2.4 + rnd() * 2 : 1.4 + rnd()) * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + curl * len * 0.4, y + dir * len * 0.7, x + curl * len, y + dir * len * (0.9 + rnd() * 0.2));
    ctx.stroke();
  };
  for (let i = 0; i < 170; i++) lash(0.04 + rnd() * 0.94, true);
  for (let i = 0; i < 80; i++) lash(0.08 + rnd() * 0.84, false);

  // desfoque e penumbra
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const o = out.getContext('2d')!;
  o.filter = `blur(${Math.max(4, 7 * k)}px) brightness(0.62) saturate(0.85)`;
  o.drawImage(raw, 0, 0);
  o.filter = 'none';
  const v = o.createRadialGradient(0.5 * W, 0.5 * H, 0.25 * W, 0.5 * W, 0.5 * H, 0.62 * W);
  v.addColorStop(0, 'rgba(3,5,3,0)');
  v.addColorStop(1, 'rgba(3,5,3,1)');
  o.fillStyle = v;
  o.fillRect(0, 0, W, H);
  return out;
}

export function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, irisR = 0;
    let surround: HTMLCanvasElement | null = null;
    let iris: HTMLCanvasElement | null = null;

    const setup = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.round(canvas.clientWidth * dpr);
      H = Math.round(canvas.clientHeight * dpr);
      if (!W || !H) return;
      canvas.width = W;
      canvas.height = H;
      surround = renderSurround(W, H);
      irisR = H * 0.3;
      iris = renderIris(Math.round(irisR * 2));
    };

    // ===== Movimento natural =====
    // x, y: direção do olhar (-1..1). Sacadas rápidas entre pontos de fixação,
    // perseguição suave em movimentos pequenos, microssacadas e piscadas.
    let x = 0, y = 0, raf = 0, lidClose = 0;
    let goalX = 0, goalY = 0, lastMouse = -1e9;
    let sacFromX = 0, sacFromY = 0, sacToX = 0, sacToY = 0, sacStart = -1, sacDur = 0, sacEnd = 0;
    let microX = 0, microY = 0, nextMicro = 0, nextIdle = 0;
    let blinkStart = -1, nextBlink = performance.now() + 2500 + Math.random() * 3000;
    const t0 = performance.now();
    const rnd = Math.random;
    const draw = (t: number) => {
      if (!W || !surround || !iris) return;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(surround, 0, 0);
      const cx = 0.515 * W + x * W * 0.13;
      const cy = 0.5 * H + y * H * 0.09;
      ctx.save();
      eyePath(ctx, W, H);
      ctx.clip();
      ctx.drawImage(iris, cx - irisR, cy - irisR);
      // volume da córnea: a parte de baixo da íris fica um pouco mais escura
      const vol = ctx.createRadialGradient(cx - irisR * 0.2, cy - irisR * 0.35, irisR * 0.2, cx, cy, irisR * 1.05);
      vol.addColorStop(0, 'rgba(255,255,255,0.05)');
      vol.addColorStop(0.7, 'rgba(0,0,0,0)');
      vol.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = vol;
      ctx.beginPath();
      ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
      ctx.fill();
      // pupila com "respiração"
      const breathe = reduce ? 1 : 1 + Math.sin((t - t0) / 1300) * 0.05;
      const rp = irisR * 0.27 * breathe;
      const pg = ctx.createRadialGradient(cx, cy, rp * 0.7, cx, cy, rp * 1.08);
      pg.addColorStop(0, '#020202');
      pg.addColorStop(1, 'rgba(2,2,2,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(cx, cy, rp * 1.08, 0, Math.PI * 2);
      ctx.fill();
      // anel técnico discreto (toque de IA)
      ctx.strokeStyle = 'rgba(74,222,128,0.28)';
      ctx.lineWidth = Math.max(1, W / 1600);
      ctx.setLineDash([irisR * 0.08, irisR * 0.05]);
      ctx.lineDashOffset = reduce ? 0 : -(t - t0) / 40;
      ctx.beginPath();
      ctx.arc(cx, cy, irisR * 1.07, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // sombra da pálpebra superior e dos cílios sobre a íris
      const sh = ctx.createLinearGradient(0, 0.12 * H, 0, 0.5 * H);
      sh.addColorStop(0, 'rgba(20,10,6,0.9)');
      sh.addColorStop(0.55, 'rgba(20,10,6,0.25)');
      sh.addColorStop(1, 'rgba(20,10,6,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(0, 0, W, H);
      // reflexo da luz na córnea (anda junto com o olho)
      const hx = cx - irisR * 0.38, hy = cy - irisR * 0.42;
      const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, irisR * 0.2);
      hl.addColorStop(0, 'rgba(255,255,255,0.92)');
      hl.addColorStop(0.4, 'rgba(255,255,255,0.35)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.ellipse(hx, hy, irisR * 0.2, irisR * 0.13, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // piscada: a pálpebra superior desce até a inferior
      if (lidClose > 0.001) {
        const L = (u: number, l: number) => u + (l - u) * Math.min(1, lidClose * 1.02);
        const lx0 = 0.08 * W, ly0 = 0.53 * H, lx3 = 0.93 * W, ly3 = 0.47 * H;
        const c1x = L(0.24, 0.3) * W, c1y = L(0.18, 0.92) * H, c2x = L(0.66, 0.72) * W, c2y = L(0.08, 0.86) * H;
        ctx.filter = `blur(${Math.max(4, W / 170)}px)`;
        const skinLid = ctx.createLinearGradient(0, 0.05 * H, 0, 0.9 * H);
        skinLid.addColorStop(0, '#1c120c');
        skinLid.addColorStop(1, '#33211a');
        ctx.fillStyle = skinLid;
        ctx.beginPath();
        ctx.moveTo(lx0, ly0);
        ctx.bezierCurveTo(0.24 * W, 0.18 * H, 0.66 * W, 0.08 * H, lx3, ly3);
        ctx.bezierCurveTo(c2x, c2y, c1x, c1y, lx0, ly0);
        ctx.closePath();
        ctx.fill();
        // linha dos cílios na borda da pálpebra
        ctx.strokeStyle = 'rgba(8,5,3,0.85)';
        ctx.lineWidth = Math.max(3, W / 220);
        ctx.beginPath();
        ctx.moveTo(lx0, ly0);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, lx3, ly3);
        ctx.stroke();
        ctx.filter = 'none';
      }
      ctx.restore();
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width * 0.515)) / (window.innerWidth * 0.5);
      const dy = (e.clientY - (r.top + r.height * 0.5)) / (window.innerHeight * 0.5);
      goalX = Math.max(-1, Math.min(1, dx));
      goalY = Math.max(-1, Math.min(1, dy));
      lastMouse = performance.now();
    };

    const startSaccade = (t: number, toX: number, toY: number) => {
      const dist = Math.hypot(toX - x, toY - y);
      sacFromX = x; sacFromY = y; sacToX = toX; sacToY = toY;
      sacStart = t;
      sacDur = 45 + dist * 110; // sacadas maiores demoram um pouco mais (45–200 ms)
      // às vezes pisca junto com um movimento grande, como as pessoas fazem
      if (dist > 0.7 && rnd() < 0.3 && blinkStart < 0) blinkStart = t + sacDur * 0.2;
    };

    const loop = (t: number) => {
      const mouseActive = t - lastMouse < 3500;

      // 1) escolhe para onde olhar
      if (!mouseActive && t > nextIdle && sacStart < 0) {
        // sem mouse: fixa em pontos ao acaso, quase sempre perto do centro
        const far = rnd() < 0.25;
        goalX = (rnd() * 2 - 1) * (far ? 0.85 : 0.4);
        goalY = (rnd() * 2 - 1) * (far ? 0.6 : 0.25);
        nextIdle = t + 900 + rnd() * 2200;
      }

      // 2) sacada (salto rápido) ou perseguição suave
      if (sacStart >= 0) {
        const p = Math.min(1, (t - sacStart) / sacDur);
        // sai rápido, freia no fim e passa só um pouquinho do ponto (como o olho real)
        const e = 1 + 1.08 * Math.pow(p - 1, 3) + 0.08 * Math.pow(p - 1, 2);
        x = sacFromX + (sacToX - sacFromX) * e;
        y = sacFromY + (sacToY - sacFromY) * e;
        if (p >= 1) { x = sacToX; y = sacToY; sacStart = -1; sacEnd = t; }
      } else {
        const d = Math.hypot(goalX - x, goalY - y);
        if (d > 0.09 && t - sacEnd > 110) startSaccade(t, goalX, goalY);
        else { x += (goalX - x) * 0.06; y += (goalY - y) * 0.06; } // perseguição lenta
      }

      // 3) microssacadas: tremidinhas mínimas durante a fixação
      if (t > nextMicro) {
        microX = (rnd() - 0.5) * 0.018;
        microY = (rnd() - 0.5) * 0.018;
        nextMicro = t + 350 + rnd() * 900;
      }

      // 4) piscada: fecha em ~80 ms, fica 40 ms, abre em ~140 ms
      if (blinkStart < 0 && t > nextBlink) blinkStart = t;
      if (blinkStart >= 0 && t >= blinkStart) {
        const bt = t - blinkStart;
        lidClose = bt < 80 ? bt / 80 : bt < 120 ? 1 : bt < 260 ? 1 - (bt - 120) / 140 : 0;
        if (bt >= 260) {
          lidClose = 0;
          blinkStart = -1;
          // às vezes duas piscadas seguidas
          nextBlink = t + (rnd() < 0.15 ? 180 : 2800 + rnd() * 4200);
        }
      }

      // a pálpebra acompanha o olhar: olhando para baixo, ela desce um pouco
      const blink = lidClose;
      lidClose = Math.max(blink, Math.max(0, y) * 0.07);
      const gx = x, gy = y;
      x = gx + microX; y = gy + microY;
      draw(t);
      lidClose = blink;
      x = gx; y = gy;
      raf = requestAnimationFrame(loop);
    };

    setup();
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setup();
        draw(performance.now());
      }, 150);
    };
    window.addEventListener('resize', onResize);
    if (reduce) draw(performance.now());
    else {
      window.addEventListener('pointermove', onMove, { passive: true });
      raf = requestAnimationFrame(loop);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="bg-tech" aria-hidden>
      <div className="bg-gradient" />
      <canvas ref={canvasRef} className="eye-canvas" />
      <div className="bg-vignette" />
    </div>
  );
}
