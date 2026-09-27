/* ============================================================
   Green · 时间光照  theme.js
   一整天里，界面的"环境光"会缓慢推移：
     深夜(靛蓝) → 黎明(橙粉) → 清晨(清绿) → 白天(亮绿) → 黄昏(琥珀) → 夜晚(靛蓝)
   做法：按小时对色标做 RGB 线性插值，每 15 秒写一次 CSS 变量。
   （不用 CSS transition：小步长连续插值更像真实光照，且不会"等它慢慢变"）
   ============================================================ */
(function () {
  "use strict";
  const R = document.documentElement;

  const KEYS = ["--accent", "--accent-2", "--amb-1", "--amb-2", "--amb-3", "--bg-1", "--bg-2", "--sky"];

  /* 色标：小时 → 8 个变量。品牌绿在白天保持本色，只在冷暖上微调；
     真正的戏剧性留给三团环境光和顶部天光。 */
  const STOPS = [
    { h: 0,  v: ["#8FE8AC", "#63D68C", "#1E2E6E", "#16224E", "#0E1A3A", "#04060E", "#070B16", "#7C9EFF"] },
    { h: 5,  v: ["#9BE8B0", "#6FD894", "#3A3A70", "#2A2A52", "#1C1C3E", "#07070F", "#0B0B18", "#8FA8FF"] },
    { h: 7,  v: ["#A6F0B8", "#74E094", "#7A4A2A", "#5A3050", "#2E1E30", "#0A0808", "#100B0C", "#FFAE7A"] },
    { h: 10, v: ["#7EE787", "#4ADE80", "#3FBF6F", "#22A06B", "#1E7A4F", "#06100B", "#0A1811", "#7EE787"] },
    { h: 16, v: ["#8FEBA0", "#5FD989", "#4A9E5A", "#2F8A66", "#226A4A", "#070F0B", "#0C1610", "#9BEEB8"] },
    { h: 19, v: ["#C8F09A", "#A8E88A", "#8A5A2A", "#6A3A4A", "#38222E", "#0C0909", "#140D0D", "#FFB27A"] },
    { h: 22, v: ["#9FE8B4", "#6FD894", "#2A3A72", "#1F2C58", "#162044", "#05070F", "#080C18", "#8FA8FF"] },
    { h: 24, v: ["#8FE8AC", "#63D68C", "#1E2E6E", "#16224E", "#0E1A3A", "#04060E", "#070B16", "#7C9EFF"] },
  ];

  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const PRE = STOPS.map((s) => s.v.map(hex2rgb));
  const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

  function phaseName(h) {
    if (h < 5) return "深夜";
    if (h < 7) return "黎明";
    if (h < 10) return "清晨";
    if (h < 16) return "白天";
    if (h < 19) return "黄昏";
    if (h < 22) return "夜晚";
    return "深夜";
  }

  function applyAt(hourOverride) {
    const d = new Date();
    const h = (typeof hourOverride === "number")
      ? hourOverride
      : d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    let i = 0;
    while (i < STOPS.length - 2 && h >= STOPS[i + 1].h) i++;
    const a = STOPS[i], b = STOPS[i + 1];
    const t = (h - a.h) / Math.max(0.001, b.h - a.h);
    for (let j = 0; j < KEYS.length; j++) {
      const c = mix(PRE[i][j], PRE[i + 1][j], t);
      R.style.setProperty(KEYS[j], "rgb(" + c[0] + " " + c[1] + " " + c[2] + ")");
    }
    document.body.dataset.phase = phaseName(h);
  }

  function apply() { applyAt(); }
  apply();
  setInterval(apply, 15000);
  window.Theme = { apply, applyAt, phase: () => document.body.dataset.phase, name: phaseName };
})();
