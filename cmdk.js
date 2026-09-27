/* ============================================================
   Green · 命令面板  cmdk.js   （Ctrl / ⌘ + K）
   一个界面有没有"产品感"，很大程度看有没有这个东西：
   所有操作都能一键搜到，键盘全程可用。
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const CMDS = [
    { id: "pet",      ico: "heart", name: "摸摸 Green",        hint: "它会跳一下",       run: () => { if (window.Pet) Pet.pet(); toast("摸摸 🫶"); } },
    { id: "hop",      ico: "jump", name: "让它跳一下",        hint: "hop",             run: () => { if (window.Pet) Pet.play("hop"); } },
    { id: "wave",     ico: "paw", name: "让它挥挥手",        hint: "wave",            run: () => { if (window.Pet) Pet.play("wave"); } },
    { id: "dance",    ico: "spin", name: "让它转个圈",        hint: "spin",            run: () => { if (window.Pet) Pet.play("spin"); } },
    { id: "sleepy",   ico: "moon", name: "让它装睡",          hint: "sleepy 表情",     run: () => document.getElementById("sprite").className = "sprite sleepy" },
    { id: "wake",     ico: "sun", name: "叫醒它",            hint: "恢复表情",        run: () => document.getElementById("sprite").className = "sprite" },
    { id: "brief",    ico: "radio", name: "打开 · 今日简讯",    hint: "20 条定制情报",    run: () => panel("p-brief", "📡 今日简讯") },
    { id: "chat",     ico: "chat", name: "打开 · 聊聊",        hint: "DSH 大脑",         run: () => panel("p-chat", "💬 聊聊") },
    { id: "log",      ico: "book", name: "打开 · 记录",        hint: "睡眠 / 随记 / 待办", run: () => panel("p-log", "🌱 记录") },
    { id: "env",      ico: "bottle", name: "打开 · 环境",        hint: "余额 / 天气 / 闹钟", run: () => panel("p-env", "🌦 环境") },
    { id: "ledger",   ico: "purse", name: "打开 · 副业账本",    hint: "四渠道流水",        run: () => click("ledger-entry") },
    { id: "task",     ico: "scroll", name: "打开 · 任务书",      hint: "六步详解 + 计时",   run: () => click("task-entry") },
    { id: "confetti", ico: "sparkle", name: "撒一次彩带",         hint: "纯炫耀",           run: () => confettiAt() },
    { id: "sound",    ico: "sound", name: "切换音效",           hint: "开 / 关",          run: () => toast("音效：" + (window.Sfx && Sfx.toggle() ? "开" : "关")) },
    { id: "full",     ico: "fullscreen",  name: "全屏切换",           hint: "F11 感受一下",     run: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } },
    { id: "reload",   ico: "refresh",  name: "重新加载界面",       hint: "刷新页面",          run: () => location.reload() },
    { id: "light-now", ico: "dusk", name: "光照 · 当前时段",    hint: () => "现在：" + (window.Theme ? Theme.phase() : ""), run: () => toast("现在是「" + Theme.phase() + "」") },
    { id: "day",      ico: "sun", name: "光照 · 预览白天",    hint: "看它变绿",          run: () => previewLight(11) },
    { id: "dusk",     ico: "dusk", name: "光照 · 预览黄昏",    hint: "看它变琥珀",        run: () => previewLight(18) },
    { id: "night",    ico: "night", name: "光照 · 预览深夜",    hint: "看它变靛蓝",        run: () => previewLight(1) },
    { id: "today",    ico: "calendar", name: "复制今天的日期",     hint: "YYYY-MM-DD",       run: () => copy(new Date().toISOString().slice(0, 10)) },
  ];

  /* ---------- 模糊匹配（子序列 + 连续加分） ---------- */
  function score(q, s) {
    if (!q) return 1;
    q = q.toLowerCase(); s = s.toLowerCase();
    let qi = 0, sc = 0, streak = 0;
    for (let i = 0; i < s.length && qi < q.length; i++) {
      if (s[i] === q[qi]) { qi++; streak++; sc += 1 + streak * 1.6; }
      else streak = 0;
    }
    return qi === q.length ? sc : 0;
  }

  /* ---------- 构建 ---------- */
  const root = document.createElement("div");
  root.id = "cmdk";
  root.className = "hidden";
  root.innerHTML =
    '<div id="cmdk-panel" role="dialog" aria-label="命令面板">' +
      '<div id="cmdk-inputrow"><span id="cmdk-ico">⌘</span>' +
        '<input id="cmdk-input" placeholder="输入命令…  例如：简讯 / 摸摸 / 黄昏" autocomplete="off" spellcheck="false">' +
        '<kbd>Esc</kbd></div>' +
      '<div id="cmdk-list"></div>' +
      '<div id="cmdk-foot"><span>↑↓ 选择</span><span>↵ 执行</span><span id="cmdk-count"></span></div>' +
    "</div>";
  document.body.appendChild(root);

  const input = root.querySelector("#cmdk-input");
  const list = root.querySelector("#cmdk-list");
  const count = root.querySelector("#cmdk-count");
  let shown = [], idx = 0;

  function render() {
    const q = input.value.trim();
    shown = CMDS.map((c) => ({ c, s: score(q, c.name + " " + c.hint + " " + c.id) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map((x) => x.c);
    if (idx >= shown.length) idx = 0;
    list.innerHTML = shown.map((c, i) => {
      const hint = typeof c.hint === "function" ? c.hint() : c.hint;
      return '<button class="cmdk-row' + (i === idx ? " is-on" : "") + '" data-i="' + i + '">' +
        '<span class="ci"><svg class="ico" viewBox="0 0 24 24"><use href="#i-' + c.ico + '"/></svg></span>' +
        '<span class="cn">' + c.name + "</span>" +
        '<span class="ch">' + (hint || "") + "</span>" +
      "</button>";
    }).join("") || '<div class="cmdk-empty">没有匹配的命令</div>';
    count.textContent = shown.length + " 项";
  }

  function open() {
    root.classList.remove("hidden");
    input.value = ""; idx = 0; render();
    setTimeout(() => input.focus(), 20);
    if (window.Sfx) Sfx.open();
    if (window.FX) FX.ripple(innerWidth / 2, innerHeight * 0.34);
  }
  function close() {
    root.classList.add("hidden");
    if (window.Sfx) Sfx.close();
  }
  function run(i) {
    const c = shown[i];
    if (!c) return;
    close();
    try { c.run(); } catch (e) {}
  }

  input.addEventListener("input", () => { idx = 0; render(); if (window.Sfx) Sfx.tick(); });
  list.addEventListener("click", (e) => {
    const b = e.target.closest(".cmdk-row"); if (b) run(+b.dataset.i);
  });
  root.addEventListener("pointerdown", (e) => { if (e.target === root) close(); });

  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "k") { e.preventDefault(); root.classList.contains("hidden") ? open() : close(); return; }
    if (root.classList.contains("hidden")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, shown.length - 1); render(); if (window.Sfx) Sfx.tick(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); render(); if (window.Sfx) Sfx.tick(); }
    else if (e.key === "Enter") { e.preventDefault(); run(idx); }
  });

  /* ---------- 小工具 ---------- */
  function click(id) { const el = $(id); if (el) el.click(); }
  function panel(id, title) { window.Deck ? Deck.showPanel(id, title) : null; }
  function confettiAt() {
    if (window.FX) { FX.confetti(innerWidth / 2, innerHeight * 0.42, 60); FX.burst(innerWidth / 2, innerHeight * 0.42, 24); }
    if (window.Sfx) Sfx.levelup();
  }
  function copy(t) {
    navigator.clipboard && navigator.clipboard.writeText(t);
    toast("已复制：" + t);
  }
  function previewLight(h) {
    if (window.Theme && Theme.applyAt) Theme.applyAt(h);
    toast("光照预览：" + h + ":00（约 1 分钟后自动回到当前时刻）");
  }
  function toast(text) {
    let t = $("green-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "green-toast";
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1900);
  }

  window.CmdK = { open, close, toast };
  window.toast = toast;
})();