/* ============================================================
   Green · 交互层 v30
   目标：可交互性拉满 + 无感陪伴
   - 眼睛跟鼠标 / 眨眼 / 摸摸 / 拖拽回弹 / 粒子
   - 环形进度 = 今日陪伴（你不用看数字也知道）
   - 抽屉化：重内容按需滑出，平时不占屏
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const BASE = location.origin;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sprite = $("sprite");

  /* ---------------- 3. 粒子 ---------------- */
  function spark(x, y, ch, n) {
    if (reduced) return;
    n = n || 1;
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "spark";
      el.textContent = ch || "♥";
      el.style.left = (x + (Math.random() - 0.5) * 46) + "px";
      el.style.top = (y + (Math.random() - 0.5) * 22) + "px";
      el.style.setProperty("--dx", ((Math.random() - 0.5) * 90).toFixed(0) + "px");
      el.style.setProperty("--dy", (-50 - Math.random() * 70).toFixed(0) + "px");
      el.style.fontSize = (12 + Math.random() * 11).toFixed(0) + "px";
      el.style.animationDelay = (i * 45) + "ms";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1500);
    }
  }
  window.GreenSpark = spark;

  /* ---------------- 4. 摸摸 + 拖拽 ---------------- */
  let blush = 0.55, blushTarget = 0.55;
  let drag = null;
  const blushL = $("blushL"), blushR = $("blushR");

  function pet(e) {
    blushTarget = 0.95;
    const r = sprite.getBoundingClientRect();
    spark(e ? e.clientX : r.left + r.width / 2, e ? e.clientY : r.top, "♥", 4);
    if (window.Pet && Pet.pet) Pet.pet();
    setTimeout(() => { blushTarget = 0.55; }, 1400);
  }

  if (sprite) {
    sprite.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      sprite.setPointerCapture(e.pointerId);
      sprite.classList.add("squish");
    });
    sprite.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) {
        sprite.style.transform = `translate(${dx}px,${dy * 0.7}px) rotate(${(dx * 0.03).toFixed(2)}deg)`;
      }
    });
    sprite.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      sprite.classList.remove("squish");
      if (moved) {
        sprite.style.transition = "transform .7s cubic-bezier(.34,1.56,.64,1)";
        sprite.style.transform = "";
        setTimeout(() => { sprite.style.transition = ""; }, 720);
      } else {
        pet(e);
      }
    });
    sprite.addEventListener("pointercancel", () => {
      drag = null;
      sprite.classList.remove("squish");
      sprite.style.transform = "";
    });
    // 悬停也会脸红（温和的反馈，不用点）
    sprite.addEventListener("pointerenter", () => { blushTarget = 0.8; });
    sprite.addEventListener("pointerleave", () => { if (!drag) blushTarget = 0.55; });
  }

  (function blushLoop() {
    blush += (blushTarget - blush) * 0.08;
    const o = blush.toFixed(3);
    if (blushL) blushL.setAttribute("opacity", o);
    if (blushR) blushR.setAttribute("opacity", o);
    requestAnimationFrame(blushLoop);
  })();

  /* ---------------- 5. 气泡：文本一变就弹一下 ---------------- */
  const quote = $("quote"), bubble = $("bubble");
  if (quote && bubble) {
    let last = quote.textContent;
    new MutationObserver(() => {
      if (quote.textContent === last) return;
      last = quote.textContent;
      bubble.classList.remove("pop");
      void bubble.offsetWidth;
      bubble.classList.add("pop");
    }).observe(quote, { childList: true, characterData: true, subtree: true });
  }

  /* ---------------- 6. 环形进度 = 今日陪伴 ---------------- */
  const ringFg = $("ring-fg");
  const RING_LEN = 653.45;
  const DAY_GOAL = 6 * 3600;   // 6 小时算满环

  function setRing(ratio) {
    if (!ringFg) return;
    const r = Math.max(0, Math.min(1, ratio));
    ringFg.style.strokeDashoffset = (RING_LEN * (1 - r)).toFixed(1);
  }

  let lastSense = null;
  async function sense() {
    try {
      const r = await fetch(BASE + "/sense?t=" + Date.now(), { cache: "no-store" });
      const j = await r.json();
      lastSense = j;
      if (j && j.ok) {
        setRing((j.activeSecToday || 0) / DAY_GOAL);
        // 它自己发现你回来了 → 主动说一句（不用你点）
        if (j.justReturned && quote) {
          setTimeout(() => { quote.textContent = "你回来啦。"; }, 700);
        }
        // 离开 → 进入待机（sleepy 视觉：Zzz）
        const wrap = $("pet-wrap");
        if (wrap) wrap.classList.toggle("sleepy", (j.idleSec || 0) >= 420 && (j.idleSec || 0) < 3600);
      }
    } catch (e) { /* 服务没起就算了，静态也好看 */ }
  }
  sense();
  setInterval(sense, 30000);

  /* 环境浮尘已迁移到 fx.js（避免同一块 canvas 两个渲染器） */

  /* ---------------- 8. 右栏 / 抽屉（宽屏常驻，窄屏覆盖） ---------------- */
  const drawer = $("context"), scrim = $("scrim");
  const dockBtns = { "brief-toggle": "p-brief", "chat-toggle": "p-chat", "more-toggle": "p-env" };
  const isWide = () => innerWidth >= 960;

  function showPanel(panelId) {
    document.querySelectorAll(".dpanel").forEach((p) => p.classList.toggle("is-on", p.id === panelId));
    document.querySelectorAll(".dtab").forEach((t) => t.classList.toggle("is-on", t.dataset.panel === panelId));
  }
  function markDock(panelId) {
    Object.entries(dockBtns).forEach(([btn, pid]) => {
      const b = $(btn); if (b) b.classList.toggle("is-on", pid === panelId);
    });
  }
  function openPanel(panelId) {
    if (!drawer) return;
    if (isWide()) {
      drawer.classList.remove("hidden");
      if (scrim) scrim.classList.add("hidden");
    } else {
      drawer.classList.remove("hidden");
      if (scrim) scrim.classList.remove("hidden");
    }
    if (panelId) { showPanel(panelId); markDock(panelId); }
  }
  function closePanel() {
    if (!drawer) return;
    if (isWide()) {
      // 宽屏：右栏是常驻的，不关；只把高亮清掉
      document.querySelectorAll("#dock .thing").forEach((b) => b.classList.remove("is-on"));
      return;
    }
    drawer.classList.add("hidden");
    if (scrim) scrim.classList.add("hidden");
    document.querySelectorAll("#dock .thing").forEach((b) => b.classList.remove("is-on"));
  }

  Object.entries(dockBtns).forEach(([btn, pid]) => {
    const b = $(btn);
    if (b) b.addEventListener("click", () => {
      const on = b.classList.contains("is-on");
      if (on && !isWide()) closePanel();
      else openPanel(pid);
    });
  });
  const closeBtn = $("drawer-close");
  if (closeBtn) closeBtn.addEventListener("click", closePanel);
  if (scrim) scrim.addEventListener("click", closePanel);
  document.querySelectorAll(".dtab").forEach((t) => {
    t.addEventListener("click", () => { showPanel(t.dataset.panel); markDock(t.dataset.panel); });
  });

  // 窗口尺寸变化：切到窄屏就把右栏收成抽屉，切回宽屏就展开
  let lastWide = null;
  function syncLayout() {
    const w = isWide();
    if (w === lastWide) return;
    lastWide = w;
    if (w) {
      if (drawer) drawer.classList.remove("hidden");
      if (scrim) scrim.classList.add("hidden");
    } else {
      // 窄屏：右栏收起来，不默认盖在宠物脸上
      if (drawer) drawer.classList.add("hidden");
      if (scrim) scrim.classList.add("hidden");
      document.querySelectorAll("#dock .thing").forEach((b) => b.classList.remove("is-on"));
    }
  }
  addEventListener("resize", syncLayout);
  syncLayout();

  // Esc 关掉弹层（宽屏不动右栏）
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal:not(.hidden)").forEach((m) => m.classList.add("hidden"));
    closePanel();
  });

  /* ---------------- 9. 键盘彩蛋：空格摸摸 ---------------- */
  addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    if (!sprite) return;
    const r = sprite.getBoundingClientRect();
    spark(r.left + r.width / 2, r.top + r.height / 2, "✦", 5);
    sprite.classList.remove("bounce");
    void sprite.offsetWidth;
    if (window.Pet && Pet.play) Pet.play("hop");
  });

  /* ---------------- 10. 暴露给其它脚本 ---------------- */
  window.PetFX = {
    spark,
    say(t) { if (quote) quote.textContent = t; },
    cheer() {
      if (!sprite) return;
      const r = sprite.getBoundingClientRect();
      spark(r.left + r.width / 2, r.top + r.height / 2, "✦", 8);
      sprite.classList.remove("squish");
      void sprite.offsetWidth;
      sprite.classList.add("squish");
    },
    sense: () => lastSense,
  };
})();