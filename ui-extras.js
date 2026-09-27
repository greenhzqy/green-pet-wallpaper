/* ============================================================
   Green · 收尾打磨  ui-extras.js
     · 陪伴热力图（近 10 周，数据来自 /history）
     · 音效开关按钮
     · 命令面板入口
     · 升级 / 长陪伴 → 彩带 + 和弦庆祝
     · 卡牌点击音、宠物触摸音
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* ---------------- 陪伴热力图 ---------------- */
  const WEEKS = 10;
  function level(sec) {
    const m = sec / 60;
    if (m <= 0) return 0;
    if (m < 30) return 1;
    if (m < 90) return 2;
    if (m < 180) return 3;
    return 4;
  }
  async function heat() {
    const box = $("heat"); if (!box) return;
    let days = {};
    try {
      const r = await fetch("/history?t=" + Date.now(), { cache: "no-store" });
      const j = await r.json();
      if (j && j.ok) days = j.days || {};
    } catch (e) {}
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // 对齐到本周日，往回 10 周
    const end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end); start.setDate(start.getDate() - (WEEKS * 7 - 1));
    let html = "";
    for (let w = 0; w < WEEKS; w++) {
      html += '<div class="hcol">';
      for (let d = 0; d < 7; d++) {
        const cur = new Date(start); cur.setDate(cur.getDate() + w * 7 + d);
        const key = cur.toISOString().slice(0, 10);
        const future = cur > today;
        const sec = days[key] || 0;
        const lv = future ? -1 : level(sec);
        const mins = Math.round(sec / 60);
        html += '<i class="hc h' + (lv < 0 ? "x" : lv) + '" title="' +
          key + "　" + (future ? "—" : mins + " 分钟") + '"></i>';
      }
      html += "</div>";
    }
    box.innerHTML = html;
  }
  heat(); setInterval(heat, 5 * 60 * 1000);

  /* ---------------- 音效开关 ---------------- */
  const sbtn = $("sound-toggle");
  function paintSound() {
    if (!sbtn || !window.Sfx) return;
    const on = Sfx.isOn();
    sbtn.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#i-' + (on ? "sound" : "mute") + '"/></svg>';
    sbtn.classList.toggle("off", !on);
  }
  if (sbtn) sbtn.addEventListener("click", () => { if (window.Sfx) Sfx.toggle(); paintSound(); });
  document.addEventListener("green:sound", paintSound);
  paintSound();

  /* ---------------- 命令面板入口 ---------------- */
  const kb = $("cmdk-hint");
  if (kb) kb.addEventListener("click", () => window.CmdK && CmdK.open());

  /* ---------------- 升级庆祝 ---------------- */
  const lvEl = $("pet-level");
  if (lvEl) {
    let lastLv = lvEl.textContent;
    new MutationObserver(() => {
      const now = lvEl.textContent;
      if (now === lastLv) return;
      const up = (parseInt(now, 10) || 0) > (parseInt(lastLv, 10) || 0);
      lastLv = now;
      if (!up) return;
      if (window.FX) {
        FX.confetti(innerWidth / 2, innerHeight * 0.4, 64);
        FX.burst(innerWidth / 2, innerHeight * 0.4, 26);
      }
      if (window.Sfx) Sfx.levelup();
      if (window.Pet) { Pet.cheer(); }
      if (window.toast) toast("升到 Lv." + now + " 了");
    }).observe(lvEl, { childList: true, characterData: true, subtree: true });
  }

  /* ---------------- 交互音 ---------------- */
  // 卡牌：吸附与激活
  document.addEventListener("click", (e) => {
    const c = e.target.closest && e.target.closest(".dcard");
    if (c && window.Sfx) (c.classList.contains("is-center") ? Sfx.open : Sfx.snap)();
  }, true);

  // 摸宠：粉心 + 呼噜声
  const sp = $("sprite");
  if (sp) {
    sp.addEventListener("pointerup", () => {
      if (window.Sfx) Sfx.pet();
      if (window.FX) {
        const r = sp.getBoundingClientRect();
        FX.burst(r.left + r.width / 2, r.top + r.height * 0.42, 10);
      }
    });
  }

  // 点击任意处：涟漪（很轻，但整页会"活"起来）
  addEventListener("pointerdown", (e) => {
    if (e.target.closest("#cmdk")) return;
    if (window.FX) FX.ripple(e.clientX, e.clientY);
  }, { passive: true });
})();