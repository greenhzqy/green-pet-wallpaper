/* ============================================================
   Green · 性能闸门  perf.js
   必须在所有其它脚本之前加载。

   原则：**你在看的时候给满帧，你不看的时候几乎停下来。**

   ---- 为什么不是简单的 fpsCap = 30 ----
   这块屏是 BOE NE160QDM-NYM，165Hz。但实测发现 WebView2 交给壁纸的
   rAF 只有 60Hz —— 所以不能按屏幕刷新率去写死分频。

   而且用「距上一帧 >= 1000/60 - 1.5 = 15.2ms」这种时间容差卡帧率，
   实际间隔会在 12.12 / 18.18ms 之间来回跳：平均是 55fps，
   但**帧间隔不均匀，看起来就是顿的**。观感上均匀比高帧率更重要。

   所以：先量出真实 rAF 频率，再按"目标帧率"取整数分频。
   每一个放行帧的间隔都严格相等，不会抖。
     60Hz  → idle 30fps   away 15fps
    165Hz  → idle 41fps   away 15fps
   两种屏都落在同一个观感区间。

   ---- 护屏 ----
   这块屏是 IPS，烧屏不是主要风险；真正折寿的是**发热**和**背光时长**。
   所以不用的时候同时做四件事：降帧、压暗、停 CSS 动画、静态文字像素漂移。
   另外插电/电池感知：用电池时连 active 也降下来。
   ============================================================ */
(function () {
  "use strict";

  // 目标帧率。0 = 原生，能跑多快跑多快。
  var TARGET = { active: 0, idle: 40, away: 15 };
  var BATTERY_FPS = 40;      // 电池供电时 active 的目标
  var IDLE_AFTER = 15;       // 秒：多久没动静算 idle
  var AWAY_AFTER = 150;      // 秒：多久没动静算 away

  var Perf = {
    active: !document.hidden,
    fpsCap: 0,          // 兼容旧接口：>0 时作为目标帧率的上限
    level: "active",
    div: 1,             // 当前分频：每 div 个刷新帧放行一次
    vsync: 0,           // 实测 rAF 间隔 ms
    fps: 0,             // 实测帧率
    onBattery: false,
    gapN: 0, estN: 0, rafN: 0,   // 诊断用
  };
  window.Perf = Perf;

  /* ---------------- 活动计时 ---------------- */
  var lastAct = performance.now();

  function setLevel(name) {
    if (!(name in TARGET) || Perf.level === name) return;
    Perf.level = name;
    document.documentElement.dataset.lvl = name;
    recompute();
  }
  Perf.setLevel = setLevel;

  Perf.poke = function () {
    lastAct = performance.now();
    if (Perf.level !== "active") setLevel("active");
  };

  function recompute() {
    var hz = 1000 / (Perf.vsync || 16.7);
    var tgt = TARGET[Perf.level];
    if (Perf.level === "active" && Perf.onBattery) tgt = BATTERY_FPS;
    if (Perf.fpsCap > 0) tgt = tgt > 0 ? Math.min(tgt, Perf.fpsCap) : Perf.fpsCap;
    // 至少 div=2，否则 idle 和 active 没区别
    Perf.div = tgt > 0 ? Math.max(2, Math.round(hz / tgt)) : 1;
    Perf.fps = Math.round(hz / Perf.div);
  }
  Perf.recompute = recompute;

  /* ---------------- 电池感知（护屏） ---------------- */
  try {
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        var upd = function () {
          Perf.onBattery = !b.charging && b.level < 0.95;
          recompute();
        };
        b.addEventListener("chargingchange", upd);
        b.addEventListener("levelchange", upd);
        upd();
      })["catch"](function () {});
    }
  } catch (e) {}

  /* ---------------- 帧闸门 ---------------- */
  var tick = 0, lastTs = -1, countAt = 0, frames = 0;
  var gaps = [];

  var _raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return _raf(function (t) {
      Perf.rafN++;                                   // 诊断：真实 rAF 回调数（早于任何 return）
      if (!Perf.active) { window.requestAnimationFrame(cb); return; }

      // 一个新时间戳 = 一个真实刷新帧。
      // 必须按"帧"判断，不能按"回调"判断：一帧内第一个回调通过后闸门若就关了，
      // 同一帧里其余回调会被无限期重新排队 —— three.js 的循环永远抢在前面，
      // 后面的循环（比如壁纸的光照）一次都跑不到。这是踩过的老坑。
      if (t !== lastTs) {
        if (lastTs >= 0) {
          var gap = t - lastTs;
          if (gap > 2 && gap < 200) { gaps.push(gap); if (gaps.length > 120) gaps.shift(); }
        }
        lastTs = t;
        tick++;
        frames++;
        if (!countAt) countAt = t;
        if (t - countAt >= 1000) {
          Perf.fps = Math.round(frames * 1000 / (t - countAt));
          // 锁存峰值：壁纸只在桌面露出来的时候才真正跑得动。
          // 存住最好的那一次，之后任何时候读遥测都能知道"露出来时能跑到多少"。
          if (Perf.fps > (Perf.fpsMax || 0)) Perf.fpsMax = Perf.fps;
          Perf.estAt = Date.now();
          frames = 0; countAt = t;
          Perf.gapN = gaps.length; Perf.estN++;
          // 每秒重估一次，不锁存。
          // ★ 之前锁存过一次，结果锁到了"窗口被遮挡时"的坏样本（13.1ms → 76Hz），
          //   分频全算错。窗口在遮挡/恢复之间切换时帧间隔会剧烈变化，必须持续跟。
          if (gaps.length >= 20) {
            var s = gaps.slice().sort(function (a, b) { return a - b; });
            Perf.vsync = s[s.length >> 1];     // 中位数，抗抖
            recompute();
          }
        }
      }

      if (Perf.div > 1 && (tick % Perf.div) !== 0) { window.requestAnimationFrame(cb); return; }
      Perf.tickOpen = (Perf.tickOpen || 0) + 1;
      cb(t);
    });
  };

  /* ---------------- 不可见时连函数体都不进 ---------------- */
  var _si = window.setInterval.bind(window);
  window.setInterval = function (fn, ms) {
    if (typeof fn !== "function") return _si(fn, ms);
    return _si(function () {
      if (!Perf.active) return;
      try { fn.apply(this, arguments); } catch (e) { console.warn("[Green] interval error", e); }
    }, ms);
  };

  function sync() {
    Perf.active = !document.hidden;
    document.documentElement.dataset.hidden = document.hidden ? "1" : "0";
    if (!document.hidden) {
      Perf.poke();
      window.dispatchEvent(new Event("green:resume"));
    }
  }
  document.addEventListener("visibilitychange", sync);
  sync();

  /* ---------------- 活动老化 ---------------- */
  _si(function () {
    var idleSec = (performance.now() - lastAct) / 1000;
    setLevel(idleSec < IDLE_AFTER ? "active" : (idleSec < AWAY_AFTER ? "idle" : "away"));
  }, 1000);

  document.documentElement.dataset.lvl = "active";

  // 首帧之后清掉加载态，让入场动画开始。只做一次 ——
  // 写成 setInterval(fn, 0) 会每 4ms 写一次 DOM，永远不停。
  _raf(function () { document.documentElement.dataset.ready = "1"; });
})();