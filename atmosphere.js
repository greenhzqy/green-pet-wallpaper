/* ============================================================
   Green · 氛围层  atmosphere.js
   对标顶尖前端缺的四件事，一次补齐：
     ① 视差纵深   —— 鼠标移动时各层以不同速度位移，画面立刻"有厚度"
     ② 入场编排   —— 不是一起淡入，而是错开时序、有先后关系地登场
     ③ 数据可视化 —— 八维属性从"进度条列表"改成手绘雷达图
     ④ 签名元素   —— 顶栏那条手绘线，变成"今天走到哪了"的日轨
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- ① 视差纵深 ---------------- */
  const layers = [
    ["#pet-wrap", 9, 7],
    ["#orbs", -6, -5],
    ["#ambient .o1", -22, -16],
    ["#ambient .o2", 16, 12],
    ["#ambient .o3", -12, -9],
    ["#sidebar", 3.2, 1.6],
    ["#context", -2.6, 1.2],
  ];
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  function apply() {
    raf = 0;
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    root.style.setProperty("--px", cx.toFixed(4));
    root.style.setProperty("--py", cy.toFixed(4));
    const moving = Math.abs(tx - cx) > 0.004 || Math.abs(ty - cy) > 0.004;
    root.dataset.parallax = moving ? "1" : "0";     // 只有真要动的时候才开 GPU 图层
    if (moving) schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(apply); }
  if (!reduce) {
    addEventListener("pointermove", (e) => {
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
      schedule();
    }, { passive: true });
  }

  /* ---------------- ② 入场编排 ---------------- */
  const seq = [
    ["#topbar", 0],
    ["#sidebar", 90],
    ["#orbs", 180],
    ["#pet-wrap", 210],
    ["#bubble", 420],
    ["#ambient-line", 480],
    ["#context", 300],
    ["#statusbar", 620],
  ];
  document.body.classList.add("booting");
  addEventListener("load", () => {});
  setTimeout(() => {
    seq.forEach(([sel, delay]) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.animationDelay = delay + "ms";
        el.classList.add("enter");
      });
    });
    document.body.classList.remove("booting");
    // 兜底：动画若因环境原因不推进，1.4 秒后强制落到终态，绝不留元素在不可见状态
    setTimeout(() => {
      seq.forEach(([sel]) => {
        document.querySelectorAll(sel).forEach((el) => {
          el.style.animation = "none";
          el.style.opacity = "";
          el.style.transform = "";
        });
      });
    }, 1400);
  }, 60);

  /* ---------------- ③ 八维雷达图 ---------------- */
  const NAMES = ["行动力", "目标感", "创造力", "自我觉察", "抗压", "临场过载", "拒斥力", "身体素质"];
  function radar() {
    const host = $("pet-stats");
    const box = $("stats-radar");
    if (!host || !box) return;
    const fills = host.querySelectorAll(".stat-fill");
    if (!fills.length) return;
    const vals = Array.from(fills).map((f) => {
      const w = f.style.width || getComputedStyle(f).width;
      const n = parseFloat(w);
      return isNaN(n) ? 0 : Math.max(0, Math.min(100, n)) / 100;
    });
    if (vals.length < 3) return;

    const S = 176, C = S / 2, R = 54, n = vals.length;
    const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
    const pt = (i, r) => [C + Math.cos(ang(i)) * r, C + Math.sin(ang(i)) * r];

    let g = "";
    // 网格：三级同心多边形（细虚线，像手绘的）
    [0.34, 0.67, 1].forEach((k) => {
      const p = vals.map((_, i) => pt(i, R * k).map((v) => v.toFixed(1)).join(",")).join(" ");
      g += '<polygon points="' + p + '" fill="none" stroke="currentColor" stroke-opacity="' + (k === 1 ? 0.22 : 0.1) + '" stroke-width="1" stroke-dasharray="2 3"/>';
    });
    // 轴线
    vals.forEach((_, i) => {
      const [x, y] = pt(i, R);
      g += '<line x1="' + C + '" y1="' + C + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="currentColor" stroke-opacity="0.09" stroke-width="1"/>';
    });
    // 数据多边形
    const dp = vals.map((v, i) => pt(i, R * Math.max(0.06, v)).map((x) => x.toFixed(1)).join(",")).join(" ");
    g += '<polygon points="' + dp + '" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-opacity="0.85" stroke-width="1.7" stroke-linejoin="round"/>';
    // 顶点
    vals.forEach((v, i) => {
      const [x, y] = pt(i, R * Math.max(0.06, v));
      g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.1" fill="currentColor"/>';
    });
    // 标签（只放首字，避免拥挤）
    vals.forEach((v, i) => {
      const [x, y] = pt(i, R + 15);
      g += '<text x="' + x.toFixed(1) + '" y="' + (y + 3.4).toFixed(1) + '" text-anchor="middle" font-size="9" fill="currentColor" fill-opacity="0.55">' + (NAMES[i] || "") + "</text>";
    });

    box.innerHTML = '<svg viewBox="0 0 ' + S + " " + S + '" width="100%" style="color:var(--accent)">' + g + "</svg>";
    box.classList.add("on");
  }
  radar();
  const mo = new MutationObserver(() => radar());
  if ($("pet-stats")) mo.observe($("pet-stats"), { subtree: true, attributes: true, attributeFilter: ["style"], childList: true });

  /* ---------------- ④ 日轨：顶栏那条手绘线变成"今天走到哪了" ---------------- */
  const SUNRISE = 6.2, SUNSET = 19.3;
  function dayArc() {
    const box = $("day-arc");
    if (!box) return;
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    const W = Math.max(160, box.clientWidth || 300), H = 13, PAD = 3;
    const t = (h - SUNRISE) / (SUNSET - SUNRISE);
    const up = t >= 0 && t <= 1;
    // 弧：日出到日落的一段半椭圆
    const ax = (k) => PAD + k * (W - PAD * 2);
    const ay = (k) => H - 1.2 - Math.sin(Math.max(0, Math.min(1, k)) * Math.PI) * (H - 4.4);
    let d = "M " + ax(0) + " " + ay(0);
    for (let i = 1; i <= 40; i++) { const k = i / 40; d += " L " + ax(k).toFixed(1) + " " + ay(k).toFixed(1); }
    // 已经走过的部分画亮
    const kNow = up ? t : (h < SUNRISE ? 0 : 1);
    let d2 = "M " + ax(0) + " " + ay(0);
    for (let i = 1; i <= 40; i++) { const k = (i / 40) * kNow; d2 += " L " + ax(k).toFixed(1) + " " + ay(k).toFixed(1); }
    const mx = ax(kNow), my = ay(kNow);
    box.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="' + H + '">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-opacity="0.16" stroke-width="1.1" stroke-linecap="round"/>' +
      '<path d="' + d2 + '" fill="none" stroke="currentColor" stroke-opacity="0.75" stroke-width="1.6" stroke-linecap="round"/>' +
      (up ? '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="2.6" fill="currentColor"/>' +
            '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="5.4" fill="currentColor" fill-opacity="0.18"/>' : "") +
      "</svg>";
    box.title = "日轨：" + (up ? "白天 " + Math.round(kNow * 100) + "%" : (h < SUNRISE ? "天还没亮" : "天黑了"));
  }
  dayArc();
  setInterval(dayArc, 60000);

  /* ---------------- ⑤ 宠物会对界面做反应 ----------------
     悬停简讯 / 物件 / 属性 / 雷达图时，把那个元素的屏幕位置换算成归一化坐标，
     交给 pet3d 的注视系统 —— 于是它会"转头去看你在看的东西"。 */
  const FOCUS_SEL = ".orb-btn, .brief-item, #stats-radar, .hc, #ledger-cards > *, .soft-title";
  let focusEl = null;
  document.addEventListener("pointerover", (e) => {
    const el = e.target && e.target.closest ? e.target.closest(FOCUS_SEL) : null;
    if (el) focusEl = el;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { focusEl = null; }, { passive: true });

  const clamp = (v, a2, b2) => (v < a2 ? a2 : v > b2 ? b2 : v);
  function tickFocus() {
    const cv = document.getElementById("pet3d");
    if (!focusEl || !cv || !document.body.contains(focusEl)) {
      window.PetFocus = { active: false, x: 0, y: 0 };
      return;
    }
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const b = focusEl.getBoundingClientRect();
    const nx = (b.left + b.width / 2 - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (b.top + b.height / 2 - (r.top + r.height * 0.45)) / (r.height / 2);
    window.PetFocus = { active: true, x: clamp(nx, -1.7, 1.7), y: clamp(ny, -1.4, 1.4) };
  }
  setInterval(tickFocus, 110);

  window.Atmosphere = { radar, dayArc };
})();