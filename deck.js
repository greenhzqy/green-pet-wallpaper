/* ============================================================
   Green · 身边的小物件  deck.js（v70）
   不做卡片 —— 把功能做成"宠物身边的物件"，围成一圈浮着。
   · 6 个物件沿椭圆排布，各自有独立的漂浮相位（不会整排一起动）
   · 悬停 → 放大 + 冒出名字；点击 → 一下即执行
   · 数值实时同步（简讯条数 / 余额 / 天气 / 睡眠 / 任务）
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const stage = $("stage"), wrap = $("pet-wrap");
  if (!stage || !wrap) return;

  const orbs = Array.from(document.querySelectorAll(".orb-btn"));

  /* ---------------- 排布：左右两翼，留出顶部（气泡）和底部（地面） ---------------- */
  const ANGLES = [-50, -6, 42, 138, 186, 230];   // 度；0=右，90=下
  function place() {
    const sr = stage.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    if (!sr.width) return;
    const cx = wr.left - sr.left + wr.width / 2;
    const cy = wr.top - sr.top + wr.height * 0.52;
    const rx = Math.min(sr.width * 0.40, wr.width * 0.95);
    const ry = Math.min(sr.height * 0.42, wr.height * 0.92);
    orbs.forEach((el, i) => {
      const a = (ANGLES[i % ANGLES.length] * Math.PI) / 180;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      el.style.left = x + "px";
      el.style.top = y + "px";
      // 漂浮相位错开
      el.style.setProperty("--ph", (i * 0.7).toFixed(2) + "s");
      el.style.setProperty("--rot", ((i % 2 ? 1 : -1) * (1.5 + i * 0.3)).toFixed(2) + "deg");
    });
  }
  place();
  addEventListener("resize", () => { place(); });
  setTimeout(place, 120);
  setTimeout(place, 600);
  // 字体/布局稳定后再排一次
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);

  /* ---------------- 交互 ---------------- */
  const PANEL_ICON = { "p-brief": "radio", "p-chat": "chat", "p-log": "book", "p-env": "bottle" };
  let switchToken = 0;
  function showPanel(id, title) {
    const cur = document.querySelector(".dpanel.is-on");
    if (cur && cur.id !== id) {
      // 有进有出：先让旧的退场（比入场快，用 ease-in）
      const token = ++switchToken;
      cur.classList.add("leaving");
      setTimeout(() => {
        if (token !== switchToken) return;
        cur.classList.remove("leaving");
        document.querySelectorAll(".dpanel").forEach((p) => p.classList.toggle("is-on", p.id === id));
      }, 190);
    } else {
      document.querySelectorAll(".dpanel").forEach((p) => p.classList.toggle("is-on", p.id === id));
    }
    const t = $("ctx-title");
    if (t && title) {
      t.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#i-' + (PANEL_ICON[id] || "sparkle") + '"/></svg><span>' + title + "</span>";
    }
    const ctx = $("context");
    if (ctx && innerWidth < 960) {
      ctx.classList.remove("hidden");
      const sc = $("scrim"); if (sc) sc.classList.remove("hidden");
    }
  }
  function activate(el) {
    if (el.dataset.panel) {
      showPanel(el.dataset.panel, el.dataset.title);
      if (window.Pet && Pet.play) Pet.play("hop");
    } else if (el.dataset.target) {
      const a = $(el.dataset.target);
      if (a) a.click();
      if (window.Pet && Pet.play) Pet.play("wave");
    }
    if (window.Sfx) Sfx.open();
    if (window.FX) {
      const r = el.getBoundingClientRect();
      FX.burst(r.left + r.width / 2, r.top + r.height / 2, 14);
      FX.ripple(r.left + r.width / 2, r.top + r.height / 2);
    }
  }

  let downX = 0, downY = 0, dragged = false;
  stage.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; dragged = false; }, true);
  stage.addEventListener("pointermove", (e) => {
    if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) dragged = true;
  }, true);

  orbs.forEach((el) => {
    el.addEventListener("click", () => {
      if (dragged) return;                 // 刚才在拖宠物，不算点物件
      el.classList.add("hit");
      setTimeout(() => el.classList.remove("hit"), 420);
      activate(el);
    });
  });

  /* ---------------- 数值同步 ---------------- */
  function bind(srcId, cardId, fn) {
    const src = $(srcId), dst = $(cardId);
    if (!src || !dst) return;
    const sync = () => { const v = fn(src.textContent || ""); if (v) dst.textContent = v; };
    new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
    sync();
  }
  bind("brief-cnt", "card-brief-val", (t) => { const s = t.trim(); return s && s !== "—" ? s : ""; });
  bind("ledger-total", "card-ledger-val", (t) => { const m = t.match(/[\d,]+/); return m ? m[0] : ""; });
  bind("task-title", "card-task-val", (t) => { const s = t.trim(); return s && s !== "—" ? "有" : ""; });
  bind("weather-text", "card-env-val", (t) => { const m = t.match(/([+-]?\d+)\s*°?C/); return m ? m[1] + "°" : ""; });
  bind("sleep-list", "card-log-val", (t) => { const m = t.match(/(\d+(?:\.\d+)?)\s*小时/); return m ? m[1] + "h" : ""; });

  /* ---------------- 浮动信息片 ---------------- */
  const DOLABEL = { coding: "写代码", terminal: "敲命令", browsing: "查资料", chat: "聊天", game: "打游戏", video: "看视频", writing: "写字", other: "在用电脑" };
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  setInterval(() => {
    const dt = new Date();
    const e = $("fc-time"); if (e) e.textContent = pad(dt.getHours()) + ":" + pad(dt.getMinutes());
  }, 1000);
  async function senseChips() {
    try {
      const r = await fetch("/sense?t=" + Date.now(), { cache: "no-store" });
      const j = await r.json();
      if (!j || !j.ok) return;
      const sec = j.activeSecToday || 0;
      const h = Math.floor(sec / 3600), mm = Math.round((sec % 3600) / 60);
      const f = $("fc-focus"); if (f) f.textContent = h > 0 ? h + "h" + mm + "m" : mm + "m";
      const g = $("fc-doing"); if (g) g.textContent = j.usingPc ? (DOLABEL[j.activity] || "在用电脑") : "走开了";
    } catch (e) {}
  }
  senseChips(); setInterval(senseChips, 30000);

  /* 初始就把右栏标题渲染好（否则一进来标题是空的） */
  (function initTitle() {
    const on = document.querySelector(".dpanel.is-on");
    if (on) {
      const meta = { "p-brief": ["radio", "今日简讯"], "p-chat": ["chat", "聊聊"], "p-log": ["book", "记录"], "p-env": ["bottle", "环境"] }[on.id];
      if (meta) showPanel(on.id, meta[1]);
    }
  })();

  window.Deck = { showPanel, place, activate };
  window.Orbs = { place };
})();