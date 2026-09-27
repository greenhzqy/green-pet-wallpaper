/* ============================================================
   Green · 粒子与庆祝  fx.js
   一个 canvas 承载三层：
     ① 环境浮尘（颜色跟随时间光照）
     ② 鼠标轨迹（轻微的光点拖尾）
     ③ 事件粒子（彩带 / 爆裂 / 涟漪）
   ============================================================ */
(function () {
  "use strict";
  const cv = document.getElementById("fx");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);   // 浮尘本来就是虚的，1.25 足够

  let W = 0, H = 0;
  function resize() {
    W = cv.width = Math.floor(innerWidth * dpr);
    H = cv.height = Math.floor(innerHeight * dpr);
    cv.style.width = innerWidth + "px";
    cv.style.height = innerHeight + "px";
    seedMotes();
  }

  /* ---------- 取当前光照色 ---------- */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  let accent = "rgb(126 231 135)", amb1 = "rgb(47 174 99)";
  setInterval(() => {
    accent = cssVar("--accent", accent);
    amb1 = cssVar("--amb-1", amb1);
  }, 5000);

  /* ---------- ① 浮尘 ---------- */
  let motes = [];
  function seedMotes() {
    const n = reduced ? 0 : Math.round((innerWidth * innerHeight) / 34000);   // 密度降 ~30%，视觉几乎无差
    motes = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: (Math.random() * 1.7 + 0.5) * dpr,
      vx: (Math.random() - 0.5) * 0.14 * dpr,
      vy: (-Math.random() * 0.24 - 0.04) * dpr,
      a: Math.random() * 0.45 + 0.1,
      ph: Math.random() * 6.28,
    }));
  }

  /* ---------- ② 鼠标轨迹 ---------- */
  const trail = [];
  let lastTrail = 0;
  addEventListener("pointermove", (e) => {
    if (reduced) return;
    const now = performance.now();
    if (now - lastTrail < 26) return;
    lastTrail = now;
    trail.push({ x: e.clientX * dpr, y: e.clientY * dpr, life: 1, r: 3.2 * dpr });
    if (trail.length > 26) trail.shift();
  }, { passive: true });

  /* ---------- ③ 事件粒子 ---------- */
  const parts = [];
  const CONFETTI = ["#7EE787", "#4ADE80", "#22D3EE", "#FFD166", "#FF8FAD", "#A78BFA"];
  function confetti(x, y, n) {
    if (reduced) return;
    n = n || 26;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const sp = (4 + Math.random() * 8) * dpr;
      parts.push({
        kind: "conf",
        x: x * dpr, y: y * dpr,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        w: (4 + Math.random() * 5) * dpr, h: (7 + Math.random() * 7) * dpr,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
        life: 1, decay: 0.008 + Math.random() * 0.008,
        c: CONFETTI[(Math.random() * CONFETTI.length) | 0],
      });
    }
  }
  function burst(x, y, n) {
    if (reduced) return;
    n = n || 14;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const sp = (1.5 + Math.random() * 5) * dpr;
      parts.push({
        kind: "dot",
        x: x * dpr, y: y * dpr,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.4 * dpr,
        r: (1.4 + Math.random() * 2.4) * dpr,
        life: 1, decay: 0.02 + Math.random() * 0.02,
        c: Math.random() < 0.5 ? "#CFF7DC" : null,
      });
    }
  }
  function ripple(x, y) {
    if (reduced) return;
    parts.push({ kind: "ring", x: x * dpr, y: y * dpr, r: 6 * dpr, life: 1, decay: 0.028 });
  }

  /* ---------- 主循环 ---------- */
  function loop() {
    ctx.clearRect(0, 0, W, H);

    // ① 浮尘
    ctx.save();
    ctx.fillStyle = accent;
    for (const p of motes) {
      p.x += p.vx; p.y += p.vy; p.ph += 0.014;
      if (p.y < -12) { p.y = H + 12; p.x = Math.random() * W; }
      if (p.x < -12) p.x = W + 12;
      if (p.x > W + 12) p.x = -12;
      ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(p.ph));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    // ② 轨迹
    for (let i = trail.length - 1; i >= 0; i--) {
      const t = trail[i];
      t.life -= 0.055;
      if (t.life <= 0) { trail.splice(i, 1); continue; }
      ctx.globalAlpha = t.life * 0.32;
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * t.life, 0, 6.2832); ctx.fill();
    }

    // ③ 事件粒子
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= p.decay;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.kind === "conf") {
        p.vy += 0.30 * dpr;
        p.vx *= 0.992;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
        ctx.restore();
      } else if (p.kind === "dot") {
        p.vy += 0.06 * dpr; p.vx *= 0.985;
        p.x += p.vx; p.y += p.vy;
        ctx.globalAlpha = p.life * 0.9;
        ctx.fillStyle = p.c || accent;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, 6.2832); ctx.fill();
      } else if (p.kind === "ring") {
        p.r += 3.4 * dpr;
        ctx.globalAlpha = p.life * 0.5;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2 * dpr * p.life;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  resize();
  addEventListener("resize", resize);

  let beat = performance.now();
  (function tick() { beat = performance.now(); loop(); requestAnimationFrame(tick); })();
  // 兜底：无头渲染 / 后台标签页 rAF 被节流时仍推进
  setInterval(() => {
    if (performance.now() - beat > 300) loop();
  }, 40);

  window.FX = { confetti, burst, ripple, accent: () => accent, amb: () => amb1 };
})();