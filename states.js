/* ============================================================
   Green · 状态与细节  states.js
     ① 空态/离线态：服务断了不能永远转"加载中…"
     ② 宠物对更多事件做反应（保存记录 / 切面板 / 读简讯）
     ③ 中文排版的细节（交给 CSS，这里只补行为）
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* ---------------- ① 空态 / 离线态 ---------------- */
  const WATCH = [
    { id: "brief-list",   icon: "radio",  msg: "情报还没送到",   sub: "服务没在跑，或今天还没更新", retry: true },
    { id: "balance-line", icon: "coin",   msg: "读不到余额",     sub: "需要填写 API key 才能查" },
    { id: "weather-text", icon: "cloud",  msg: "天气拿不到",     sub: "网络或服务离线" },
    { id: "chat-log",     icon: "chat",   msg: "还没聊过",       sub: "在下面说一句试试" },
    { id: "sleep-list",   icon: "moon",   msg: "最近没记睡眠",   sub: "睡醒顺手填一下就好" },
    { id: "todos",        icon: "check",  msg: "没有待办",       sub: "挺好" },
    { id: "ledger-cards", icon: "purse",  msg: "账本还是空的",   sub: "记第一笔就有数据了" }
  ];
  function emptyHTML(w) {
    return '<div class="empty-state"><svg class="ico"><use href="#i-' + w.icon + '"/></svg>' +
      '<div class="es-msg">' + w.msg + '</div><div class="es-sub">' + w.sub + "</div>" +
      (w.retry ? '<button class="es-retry" data-retry="' + w.id + '">重试一下</button>' : "") + "</div>";
  }
  function sweep() {
    WATCH.forEach((w) => {
      const el = $(w.id);
      if (!el || el.dataset.emptied === "1") return;
      const t = (el.textContent || "").trim();
      const isPlaceholder = t === "" || t === "—" || t === "加载中…" || t === "加载中" || t === "— · —";
      if (isPlaceholder) {
        // 给它 6 秒机会，之后才判定为空/离线
        if (!el.__t0) el.__t0 = Date.now();
        if (Date.now() - el.__t0 > 6000) { el.innerHTML = emptyHTML(w); el.dataset.emptied = "1"; }
      }
    });
  }
  sweep();
  setInterval(sweep, 3000);
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".es-retry");
    if (!b) return;
    const el = $(b.dataset.retry);
    if (el) { el.dataset.emptied = "0"; el.__t0 = 0; el.textContent = "重试中…"; }
    if (window.toast) toast("重新拉一次…");
    location.reload();
  });

  /* ---------------- ② 宠物对更多事件做反应 ---------------- */
  // 面板切换时轻跳（orb 已有），这里补：保存成功、悬停简讯、字体加载完
  document.addEventListener("green:saved", () => { if (window.Pet) Pet.cheer(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && window.Pet) Pet.play("look");
  });
  // 简讯悬停时宠物"看过去"（atmosphere.js 已经在做视线，这里加一点情绪反馈）
  let hoverTimer = 0;
  document.addEventListener("pointerover", (e) => {
    const it = e.target.closest && e.target.closest(".brief-item");
    if (!it || !window.Pet) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => Pet.play("nod"), 420);   // 停够 0.4 秒才点头，掠过不打扰
  }, { passive: true });
  document.addEventListener("pointerout", () => clearTimeout(hoverTimer), { passive: true });

  /* ---------------- ③ 首次进入：给它一次"自我介绍" ---------------- */
  try {
    if (!localStorage.getItem("green-met")) {
      localStorage.setItem("green-met", "1");
      setTimeout(() => {
        if (window.Pet) Pet.cheer();
        if (window.toast) toast("我是 Green。不用管我，在电脑前待着就行。");
      }, 1400);
    }
  } catch (e) {}
})();
