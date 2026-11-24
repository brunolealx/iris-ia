'use client';

// Fundo do site: degradê verde e preto com uma íris de olho realista que segue
// o ponteiro do mouse. A textura é desenhada uma vez num <canvas> (milhares de
// fibras, criptas, sulcos, colarete e o anel dourado em volta da pupila); pupila,
// reflexo e anéis técnicos são camadas separadas que se movem por CSS (GPU).
// Sem mouse (celular), a íris "olha" devagar ao redor. Respeita prefers-reduced-motion.
import { useEffect, useRef } from 'react';

const PUPIL = 0.24; // raio da pupila em relação ao raio da íris

/** Pseudoaleatório determinístico (mesma íris em todo carregamento). */
function makeRand(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawIris(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = canvas.clientWidth || 800;
  const N = Math.round(css * dpr);
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rnd = makeRand(20261123);
  const c = N / 2;
  const R = N * 0.47; // raio da íris
  const rp = R * PUPIL;
  const P = (a: number, r: number) => [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;

  ctx.clearRect(0, 0, N, N);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.clip();

  // 1) cor base: dourado perto da pupila → verde claro → verde profundo
  const base = ctx.createRadialGradient(c, c, rp * 0.9, c, c, R);
  base.addColorStop(0, '#b98a2e');
  base.addColorStop(0.1, '#c9a646');
  base.addColorStop(0.22, '#7ccf6a');
  base.addColorStop(0.42, '#2fbf62');
  base.addColorStop(0.68, '#138a40');
  base.addColorStop(0.88, '#0a5a2a');
  base.addColorStop(1, '#031a0c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, N, N);

  // 2) fibras escuras (profundidade)
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = rp * (1.02 + rnd() * 0.4);
    const r1 = R * (0.45 + rnd() * 0.55);
    const w = (rnd() - 0.5) * 0.08;
    const [x0, y0] = P(a, r0);
    const [xm, ym] = P(a + w, (r0 + r1) / 2);
    const [x1, y1] = P(a + w * 0.4, r1);
    ctx.strokeStyle = `rgba(4, 40, 18, ${0.08 + rnd() * 0.22})`;
    ctx.lineWidth = (0.6 + rnd() * 2.4) * (N / 1000);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(xm, ym, x1, y1);
    ctx.stroke();
  }

  // 3) fibras claras (estroma), em várias tonalidades
  ctx.globalCompositeOperation = 'lighter';
  const light = ['167,243,208', '134,239,172', '217,249,157', '74,222,128', '253,230,138'];
  for (let i = 0; i < 1600; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = rp * (1.04 + rnd() * 0.5);
    const r1 = r0 + R * (0.12 + rnd() * 0.6);
    const w = (rnd() - 0.5) * 0.1;
    const [x0, y0] = P(a, r0);
    const [xm, ym] = P(a + w, (r0 + r1) / 2);
    const [x1, y1] = P(a - w * 0.3, Math.min(r1, R * 0.97));
    const col = light[Math.floor(rnd() * (r0 < rp * 1.3 ? 5 : 4))];
    ctx.strokeStyle = `rgba(${col}, ${0.03 + rnd() * 0.12})`;
    ctx.lineWidth = (0.4 + rnd() * 1.6) * (N / 1000);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(xm, ym, x1, y1);
    ctx.stroke();
  }

  // 4) criptas (pequenas cavidades alongadas)
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = `blur(${1.5 * (N / 1000)}px)`;
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const r = R * (0.42 + rnd() * 0.4);
    const [x, y] = P(a, r);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(2, 30, 12, ${0.1 + rnd() * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * (0.015 + rnd() * 0.06), R * (0.005 + rnd() * 0.016), (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.filter = 'none';

  // 5) sulcos de contração (anéis concêntricos interrompidos)
  for (const k of [0.7, 0.79, 0.87]) {
    let a = rnd() * Math.PI * 2;
    const end = a + Math.PI * 2;
    while (a < end) {
      const len = 0.15 + rnd() * 0.5;
      ctx.strokeStyle = `rgba(3, 32, 14, ${0.25 + rnd() * 0.3})`;
      ctx.lineWidth = (1 + rnd() * 2) * (N / 1000);
      ctx.beginPath();
      ctx.arc(c, c, R * (k + (rnd() - 0.5) * 0.01), a, a + len);
      ctx.stroke();
      a += len + 0.05 + rnd() * 0.25;
    }
  }

  // 6) colarete: anel irregular claro entre a zona da pupila e o resto
  ctx.globalCompositeOperation = 'source-over';
  const rc = rp * 1.85;
  ctx.beginPath();
  for (let d = 0; d <= 360; d += 2) {
    const a = (d * Math.PI) / 180;
    const rr = rc * (1 + Math.sin(a * 7 + 1.3) * 0.03 + Math.sin(a * 13) * 0.025 + (rnd() - 0.5) * 0.03);
    const [x, y] = P(a, rr);
    d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(236, 252, 203, 0.45)';
  ctx.lineWidth = 3.2 * (N / 1000);
  ctx.shadowColor = 'rgba(190, 242, 100, 0.6)';
  ctx.shadowBlur = 8 * (N / 1000);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 7) pintinhas claras (flecks)
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const r = R * (0.35 + rnd() * 0.5);
    const [x, y] = P(a, r);
    ctx.fillStyle = `rgba(254, 243, 199, ${0.12 + rnd() * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, (0.8 + rnd() * 2.2) * (N / 1000), 0, Math.PI * 2);
    ctx.fill();
  }

  // 8) borda da pupila (ruff) escura e irregular
  ctx.beginPath();
  for (let d = 0; d <= 360; d += 1.5) {
    const a = (d * Math.PI) / 180;
    const [x, y] = P(a, rp * (1.06 + (rnd() - 0.5) * 0.05));
    d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(46, 24, 4, 0.85)';
  ctx.lineWidth = 5 * (N / 1000);
  ctx.stroke();

  // 9) anel límbico (borda escura) e granulado fino
  const limb = ctx.createRadialGradient(c, c, R * 0.82, c, c, R);
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(0.75, 'rgba(1,12,5,0.55)');
  limb.addColorStop(1, 'rgba(0,6,2,0.95)');
  ctx.fillStyle = limb;
  ctx.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R;
    const [x, y] = P(a, r);
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, y, N / 1000, N / 1000);
  }
  ctx.restore();
}

export function TechBackground() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pupilRef = useRef<HTMLDivElement>(null);
  const glintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawIris(canvas);
    const onResize = () => canvas && drawIris(canvas);
    window.addEventListener('resize', onResize);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => window.removeEventListener('resize', onResize);
    }

    let tx = 0, ty = 0, x = 0, y = 0, raf = 0, last = -1e9;
    const onMove = (e: PointerEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2 - x, cy = r.top + r.height / 2 - y;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const max = r.width * 0.07;
      const pull = Math.min(1, dist / (Math.min(window.innerWidth, window.innerHeight) * 0.55));
      tx = (dx / dist) * max * pull;
      ty = (dy / dist) * max * pull;
      last = performance.now();
    };
    const tick = (t: number) => {
      const el = wrapRef.current;
      if (el && t - last > 4000) {
        const max = el.clientWidth * 0.05;
        tx = Math.cos(t / 3400) * max;
        ty = Math.sin(t / 4700) * max * 0.6;
      }
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      if (el) {
        const w = el.clientWidth || 1;
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotateY(${((x / w) * 40).toFixed(2)}deg) rotateX(${((-y / w) * 40).toFixed(2)}deg)`;
      }
      if (pupilRef.current) pupilRef.current.style.translate = `${(x * 0.22).toFixed(2)}px ${(y * 0.22).toFixed(2)}px`;
      if (glintRef.current) glintRef.current.style.translate = `${(-x * 0.12).toFixed(2)}px ${(-y * 0.12).toFixed(2)}px`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="bg-tech" aria-hidden>
      <div className="bg-gradient" />
      <div className="iris-stage">
        <div className="iris-wrap" ref={wrapRef}>
          <div className="iris-halo" />
          {/* anéis técnicos */}
          <svg className="iris-ring iris-spin" viewBox="-500 -500 1000 1000">
            {Array.from({ length: 144 }, (_, i) => {
              const a = (i / 144) * Math.PI * 2;
              const long = i % 12 === 0;
              const r0 = 400, r1 = long ? 424 : 410;
              return (
                <line key={i} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0} x2={Math.cos(a) * r1} y2={Math.sin(a) * r1}
                  stroke={long ? '#4ade80' : '#22c55e'} strokeOpacity={long ? 0.75 : 0.3} strokeWidth={long ? 2.2 : 1.1} />
              );
            })}
          </svg>
          <svg className="iris-ring iris-spin-rev" viewBox="-500 -500 1000 1000" fill="none">
            <circle r="446" stroke="#22d3ee" strokeOpacity="0.4" strokeWidth="1.4" strokeDasharray="220 70 24 70" />
            <circle r="468" stroke="#4ade80" strokeOpacity="0.16" strokeWidth="1" strokeDasharray="3 12" />
          </svg>
          <canvas ref={canvasRef} className="iris-canvas" />
          <div className="iris-pupil-wrap" ref={pupilRef}><div className="iris-pupil" /></div>
          <div className="iris-glint" ref={glintRef} />
          <div className="iris-gloss" />
        </div>
      </div>
      <div className="bg-vignette" />
    </div>
  );
}
