/* ============================================================
   Green · 程序化音效  sound.js
   零音频文件 —— 全部用 WebAudio 实时合成。
   音效是"精致感"里最被低估的一环：同一个界面，加了对的声音，
   手感会从"网页"变成"产品"。
   ============================================================ */
(function () {
  "use strict";
  const KEY = "green-sound";
  let on = (localStorage.getItem(KEY) || "1") === "1";
  let ctx = null, master = null;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* 一个音：起始频率 → 终止频率，指数衰减包络 */
  function tone(f, dur, type, gain, to, delay) {
    if (!on) return;
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  /* 噪声爆（用于"落地""沙沙"这类质感音） */
  function noise(dur, gain, hp) {
    if (!on) return;
    const c = ac(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.4);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 900;
    const g = c.createGain(); g.gain.value = gain || 0.05;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  const S = {
    tick:    () => tone(1450, 0.03, "sine", 0.012),
    hover:   () => tone(1080, 0.05, "sine", 0.018),
    click:   () => { tone(660, 0.06, "triangle", 0.045); tone(990, 0.09, "sine", 0.022, null, 0.012); },
    snap:    () => { tone(820, 0.055, "sine", 0.028, 1160); noise(0.05, 0.016, 1800); },
    pet:     () => { tone(520, 0.11, "sine", 0.05, 880); tone(780, 0.14, "sine", 0.03, 1180, 0.06); },
    hop:     () => { tone(400, 0.08, "triangle", 0.04, 720); noise(0.06, 0.02, 700); },
    land:    () => noise(0.09, 0.03, 420),
    open:    () => tone(300, 0.15, "sine", 0.045, 640),
    close:   () => tone(640, 0.13, "sine", 0.035, 300),
    error:   () => { tone(220, 0.16, "sawtooth", 0.03, 160); },
    levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.30, "sine", 0.055, null, i * 0.085)),
    chime:   () => [784, 1047, 1319].forEach((f, i) => tone(f, 0.5, "sine", 0.03, null, i * 0.11)),
  };

  /* 浏览器要求"先有用户手势"才能出声 */
  function unlock() { ac(); }
  addEventListener("pointerdown", unlock, { passive: true });
  addEventListener("keydown", unlock);

  /* 全局：给带 data-sfx 的元素自动挂音 */
  function bindDelegates() {
    document.addEventListener("pointerover", (e) => {
      const el = e.target.closest && e.target.closest("[data-sfx-hover],button,.dcard,.thing");
      if (el && el !== bindDelegates._last) { bindDelegates._last = el; S.hover(); }
    }, { passive: true });
    document.addEventListener("pointerout", () => { bindDelegates._last = null; }, { passive: true });
    document.addEventListener("click", (e) => {
      const el = e.target.closest && e.target.closest("[data-sfx],button");
      if (!el) return;
      const kind = el.getAttribute && el.getAttribute("data-sfx");
      (S[kind] || S.click)();
    });
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", bindDelegates);
  else bindDelegates();

  window.Sfx = Object.assign({}, S, {
    isOn: () => on,
    toggle() {
      on = !on;
      localStorage.setItem(KEY, on ? "1" : "0");
      if (on) { ac(); S.click(); }
      document.dispatchEvent(new CustomEvent("green:sound", { detail: on }));
      return on;
    },
  });
})();
