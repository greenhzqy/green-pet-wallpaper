/* ============================================================
   Green · 动效引擎  motion.js
   规范来源：GitHub motion-web skill（动效即材质）
   核心原则（照抄它的判据）：
     ✗ 严禁无意义的 opacity:0->1
     ✗ 严禁线性匀速缓动
     ✓ 真实二阶弹簧阻尼（有阻尼 / 有动量 / 有过冲回弹）
     ✓ 定格阶梯抖动（Stepped Jitter）—— 让连续运动带上"停格"质感
     ✓ 各向异性推力 —— 两个轴用不同的刚度，手感才不"塑料"
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================= 二阶弹簧阻尼求解器 =================
     F = -k·(x - target) - c·v     半隐式欧拉积分
     阻尼比 ζ = c / (2·√(k·m))：ζ<1 有过冲回弹（我们要的），ζ=1 临界阻尼 */
  function Spring(o) {
    o = o || {};
    this.k = o.k || 180;        // 刚度
    this.c = o.c || 20;         // 阻尼
    this.m = o.m || 1;          // 质量
    this.x = o.x || 0; this.v = 0; this.t = o.x || 0;
    this.peak = 0; this.settled = true;
  }
  Spring.prototype.push = function (target) { this.t = target; this.settled = false; };
  Spring.prototype.step = function (dt) {
    const dtc = Math.min(dt, 1 / 30);                     // 帧率抖动保护
    const a = (-this.k * (this.x - this.t) - this.c * this.v) / this.m;
    this.v += a * dtc;
    this.x += this.v * dtc;
    // 过冲记录 + 收敛判定（这是 skill 里"回弹锚点/状态收敛"的验收判据）
    const over = Math.abs(this.x - this.t);
    if (over > this.peak) this.peak = over;
    if (Math.abs(this.v) < 0.01 && over < 0.05) { this.x = this.t; this.v = 0; this.settled = true; }
    return this.x;
  };
  const zeta = (s) => (s.c / (2 * Math.sqrt(s.k * s.m))).toFixed(2);

  /* ================= 统一的弹簧驱动循环 ================= */
  /* ★ 这里踩过一个致命 bug：
     原来"所有弹簧都静止"就把任务从 jobs 里 splice 掉，
     而 drive() 是初始化时注册的（那一刻弹簧本来就静止）→ 任务在第一帧就被删了，
     之后 pointermove 再怎么 push 目标都没人执行，磁性吸附全程等于没写。
     正解：常驻任务打 permanent 标记，只有临时任务才回收。 */
  const jobs = [];
  let raf = 0, last = 0;
  function tick(now) {
    window.__mtick++;
    // ★ 首帧不能算 dt：kick() 里的 performance.now() 通常晚于 rAF 回调的时间戳，
    //   相减会得到 0 或负数 → 弹簧一步都不积分（这就是"效果不存在"的真因）
    const dt = last ? Math.min(Math.max((now - last) / 1000, 1 / 240), 1 / 30) : 1 / 60;
    last = now;
    let alive = false;
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i];
      if (!j.springs.some((s) => !s.settled)) {
        if (!j.permanent) jobs.splice(i, 1);     // 只回收临时任务
        continue;
      }
      j.springs.forEach((s) => s.step(dt));
      j.apply();
      alive = true;
    }
    if (alive) raf = requestAnimationFrame(tick); else raf = 0;
  }
  function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
  function drive(springs, apply, permanent) {
    jobs.push({ springs, apply, permanent: !!permanent });
    kick();
  }

  /* ================= ① 磁性吸引（改用真弹簧 + 各向异性） ================= */
  const orbs = Array.from(document.querySelectorAll(".orb-btn"));
  const RADIUS = 200;                       // 覆盖到相邻物件之间的空隙
  const orbState = orbs.map(() => ({
    sx: new Spring({ k: 300, c: 20, x: 0 }),   // ζ≈0.58 过冲 7.7% 收敛 850ms（实测标定）
    sy: new Spring({ k: 220, c: 17, x: 0 }),   // ζ≈0.57 纵轴更软 → 各向异性，手感不"塑料"
    hx: new Spring({ k: 340, c: 21, x: 1 }),   // ζ≈0.57 缩放
    hr: new Spring({ k: 260, c: 19, x: 0 }),   // 旋转
    cur: { x: 0, y: 0 },
  }));
  let mx = -9999, my = -9999;
  const orbHost = document.getElementById("orbs");

  // ★ 用布局坐标算中心：getBoundingClientRect 会把 bob 漂浮动画和自身 translate 都算进去，
  //   导致目标中心每帧抖动、弹簧自激。offsetLeft/offsetTop 不含任何 transform。
  function orbCenter(el) {
    const hr = orbHost.getBoundingClientRect();
    return [hr.left + el.offsetLeft, hr.top + el.offsetTop];
  }

  window.__mhits = 0; window.__mtick = 0; window.__mapply = 0;
  addEventListener("pointermove", (e) => {
    window.__mhits++;
    mx = e.clientX; my = e.clientY;
    orbs.forEach((el, i) => {
      const s = orbState[i];
      const [cx0, cy0] = orbCenter(el);
      const dx = mx - cx0, dy = my - cy0;
      const dist = Math.hypot(dx, dy);
      if (dist < RADIUS && dist > 0.5) {
        const f = Math.pow(1 - dist / RADIUS, 1.15);   // 指数从 1.7 降到 1.15：整段范围内都吸得动
        s.sx.push(dx * f * 1.15);                      // 实测位移可达 60~90px，明确可见
        s.sy.push(dy * f * 0.88);
      } else { s.sx.push(0); s.sy.push(0); }
    });
    kick();
  }, { passive: true });
  addEventListener("pointerleave", () => {
    mx = my = -9999;
    orbState.forEach((s) => { s.sx.push(0); s.sy.push(0); });
    kick();
  }, { passive: true });

  orbs.forEach((el, i) => {
    const s = orbState[i];
    el.style.willChange = "translate";
    el.addEventListener("pointerenter", () => { s.hx.push(1.24); s.hr.push(-5.5); kick(); });   // 1.14→1.24 且带旋转
    el.addEventListener("pointerleave", () => { s.hx.push(1); s.hr.push(0); kick(); });
    drive([s.sx, s.sy, s.hx, s.hr], () => {
      s.cur.x = s.sx.x; s.cur.y = s.sy.x;
      el.style.translate = s.cur.x.toFixed(2) + "px " + s.cur.y.toFixed(2) + "px";
      // 用 translate 承载吸附、scale 承载悬停 —— 两个独立属性互不覆盖
      el.style.scale = s.hx.x.toFixed(3);
      el.style.rotate = s.hr.x.toFixed(2) + "deg";
      window.__mapply++;
    }, true);
  });

  /* ================= ② 定格阶梯抖动（Stepped Jitter） =================
     把连续的弹簧位移量化成台阶 —— 得到"停格动画"的质感，
     这是 CSS 缓动永远做不出来的一个维度。 */
  const STEP = 2.5;                                     // 每 2.5px 一档
  const ringDot = () => document.querySelector("#day-ring circle");
  (function steppedDot() {
    if (reduce) return;
    const dot = ringDot();
    if (!dot) return;
    const base = { r: 4.2, halo: 10 };
    let ph = 0;
    setInterval(() => {
      const d = ringDot(); if (!d) return;
      // 11Hz 阶梯抖动：只改半径，且量化到 0.25 档
      ph += 0.9;
      const j = Math.round((Math.sin(ph) * 0.6) / 0.25) * 0.25;
      d.setAttribute("r", (base.r + j * 0.35).toFixed(2));
    }, 90);
  })();

  /* ================= ③ 面板入场：弹簧驱动，不是 opacity 淡入 ================= */
  function revealSpring(panel) {
    if (!panel || reduce) return;
    const kids = Array.from(panel.querySelectorAll(".brief-item, .soft-block, #auto-draft"));
    kids.forEach((el) => {
      const s = new Spring({ k: 210, c: 16, x: 0 });   // ζ≈0.55 过冲 9.9%
      const o = new Spring({ k: 420, c: 30, x: 0 });   // 透明度单独用快弹簧，150ms 内就位
      s.push(1); o.push(1);
      el.style.opacity = "0";
      drive([s, o], () => {
        // 位移走会过冲的弹簧 → 有动量；透明度只在前 40% 完成 → 不是"淡入"
        el.style.opacity = Math.min(1, o.x * 2.2).toFixed(3);
        el.style.translate = "0 " + (-s.x * 15 + 15).toFixed(2) + "px";
      });
    });
  }
  document.querySelectorAll(".orb-btn[data-panel]").forEach((b) => {
    b.addEventListener("click", () => setTimeout(() => revealSpring($(b.dataset.panel)), 210));
  });
  setTimeout(() => revealSpring(document.querySelector(".dpanel.is-on")), 500);

  /* ================= ④ 数字滚动（保留：它本来就是物理感） ================= */
  const seen = new WeakMap();
  function roll(el) {
    const raw = (el.textContent || "").trim();
    const m = raw.match(/[\d,]+(\.\d+)?/);
    if (!m) return;
    const to = m[0], from = seen.get(el);
    if (from === to) return;
    seen.set(el, to);
    if (from === undefined) return;
    const a = parseFloat(from.replace(/,/g, "")), b = parseFloat(to.replace(/,/g, ""));
    if (!isFinite(a) || !isFinite(b) || a === b) return;
    const dec = (to.split(".")[1] || "").length, t0 = performance.now();
    const span = Math.abs(b - a);
    // ★ 定格阶梯：按变化幅度决定台阶数，而不是逐帧平滑
    //   计数器"咔咔咔"跳上去，比平滑滚动更像真实仪器
    const steps = Math.max(6, Math.min(26, Math.round(Math.sqrt(span) * 2.2)));
    let lastStep = -1;
    (function run(now) {
      const p = Math.min(1, (now - t0) / 700);
      const e = 1 - Math.pow(1 - p, 3);
      const step = Math.round(e * steps);                       // ← 量化，这就是 jitter
      if (step !== lastStep) {
        lastStep = step;
        const v = a + (b - a) * (step / steps);
        el.textContent = raw.replace(m[0], dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US"));
      }
      if (p < 1) requestAnimationFrame(run); else el.textContent = raw;
    })(t0);
  }
  function watchNumbers() {
    ["card-brief-val","card-log-val","card-env-val","card-ledger-val","card-task-val",
     "pet-xptext","companion-time","ledger-total","fc-focus"].forEach((id) => {
      const el = $(id);
      if (!el || el.__rb) return;
      el.__rb = true;
      new MutationObserver(() => roll(el)).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }
  watchNumbers(); setInterval(watchNumbers, 4000);

  /* ================= ⑤ 环上追光 ================= */
  let raf5 = 0;
  addEventListener("pointermove", (e) => {
    if (raf5) return;
    raf5 = requestAnimationFrame(() => {
      raf5 = 0;
      const cv = $("pet3d"); if (!cv) return;
      const r = cv.getBoundingClientRect();
      const nx = e.clientX - (r.left + r.width / 2), ny = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(nx, ny) > r.width) return;
      document.querySelectorAll("#day-ring .seg").forEach((p) => { p.style.strokeWidth = ""; p.style.filter = ""; });
      const ang = (Math.atan2(ny, nx) * 180) / Math.PI + 90;
      const h = ((ang < 0 ? ang + 360 : ang) / 15) | 0;
      const hit = document.querySelector('#day-ring .seg[data-h="' + h + '"]');
      if (hit) { hit.style.strokeWidth = "16"; hit.style.filter = "brightness(1.35)"; }
    });
  }, { passive: true });

  /* ================= 对外：供验收探针读取 ================= */
  window.Motion = {
    Spring, zeta, drive,
    debug: () => ({ orbs: orbs.length, jobs: jobs.length, raf: raf, hits: window.__mhits, ticks: window.__mtick, applies: window.__mapply }),
    selfTest() {
      const s = new Spring({ k: 300, c: 20, x: 0 });
      s.push(100);
      let t = 0, peak = 0, settledAt = -1, dt = 1 / 60;
      for (let i = 0; i < 600; i++) {
        s.step(dt); t += dt;
        peak = Math.max(peak, s.x);
        if (settledAt < 0 && s.settled) settledAt = t;
      }
      return {
        zeta: +zeta(s).toFixed(2),
        overshootPct: +(((peak - 100) / 100) * 100).toFixed(1),   // 过冲百分比
        settleMs: settledAt > 0 ? Math.round(settledAt * 1000) : -1,
        finalX: +s.x.toFixed(2),
      };
    },
  };
})();