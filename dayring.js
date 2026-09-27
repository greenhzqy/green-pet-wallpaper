/* ============================================================
   Green · 今日之环  dayring.js
   把"今天"画成一个环，宠物就站在环中央。
     · 24 段弧 = 24 小时，亮度 = 那一小时的真实活跃度（数据来自 /sense）
     · 凌晨 0-5 点单独用暖橙，一眼看出昨晚熬到几点
     · 当前小时有光点 + 指向手；悬停任意一段显示那一刻在干嘛
     · 旁边一行自动草稿：机器已经替你写好今天，点一下就算记过了
     · 环是一根软绳：数据到达时被"拨"一下，位移以行波绕环传一圈再回声
       衰减；停下来之后写回数据本身的精确值（详见下方 §绳索）
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  if (!stage) return;

  const R = 150, CX = 200, CY = 200, SW = 13, GAP = 1.6;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "day-ring";
  svg.setAttribute("viewBox", "0 0 400 400");
  // 日环承载"今天几点在干什么" —— 规范要求图表必须有文字替代，
  // 直接 aria-hidden 等于对屏幕阅读器隐身。改成 role="img" + 动态 aria-label。
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "今日活动环，正在加载");
  const track = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(track);
  const segs = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(segs);
  const hand = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(hand);
  stage.insertBefore(svg, stage.firstChild);

  const tip = document.createElement("div");
  tip.id = "day-tip";
  tip.className = "hidden";
  stage.appendChild(tip);

  const polar = (deg, r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
  };
  function arcPath(a0, a1, r) {
    const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
    const large = a1 - a0 > 180 ? 1 : 0;
    return "M " + x0.toFixed(2) + " " + y0.toFixed(2) +
      " A " + r + " " + r + " 0 " + large + " 1 " + x1.toFixed(2) + " " + y1.toFixed(2);
  }

  // 静态：外圈细轨 + 四个时刻刻度
  (function base() {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    t.setAttribute("cx", CX); t.setAttribute("cy", CY); t.setAttribute("r", R);
    t.setAttribute("fill", "none");
    t.setAttribute("stroke", "currentColor"); t.setAttribute("stroke-opacity", "0.07");
    t.setAttribute("stroke-width", SW);
    track.appendChild(t);
    [0, 6, 12, 18].forEach((h) => {
      const [x1, y1] = polar(h * 15, R + SW / 2 + 2), [x2, y2] = polar(h * 15, R + SW / 2 + 8);
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", x1); ln.setAttribute("y1", y1);
      ln.setAttribute("x2", x2); ln.setAttribute("y2", y2);
      ln.setAttribute("stroke", "currentColor"); ln.setAttribute("stroke-opacity", "0.22");
      ln.setAttribute("stroke-width", "1.2"); ln.setAttribute("stroke-linecap", "round");
      track.appendChild(ln);
      const [lx, ly] = polar(h * 15, R + SW / 2 + 20);
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", lx); tx.setAttribute("y", ly + 3.4);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("font-size", "11"); tx.setAttribute("fill", "currentColor");
      tx.setAttribute("fill-opacity", "0.42");
      tx.textContent = h + "时";
      track.appendChild(tx);
    });
  })();

  let maxSec = 1;
  // 无障碍：日环承载"今天几点在干什么"，不能对屏幕阅读器隐身。
  // 生成一句人能听懂、屏幕阅读器能读出来的摘要，随数据更新。
  function describe(hours, activeSec) {
    try {
      const total = activeSec || hours.reduce((a, b) => a + b, 0);
      const H = Math.floor(total / 3600), M = Math.round((total % 3600) / 60);
      const peak = hours.indexOf(Math.max(...hours));
      const late = hours.slice(0, 6).reduce((a, b) => a + b, 0);
      let s = "今日活动环。共陪伴 " + (H ? H + " 小时 " : "") + (M ? M + " 分" : "") + "。";
      if (total > 60 && peak >= 0) s += "最活跃的是 " + peak + " 点前后。";
      if (late > 1800) s += "其中凌晨时段 " + Math.round(late / 60) + " 分钟。";
      svg.setAttribute("aria-label", s);
    } catch (e) {}
  }

  /* ============================================================
     §绳索 —— 整圈弹性余振（软体绳索质感）
     判据（motion-web · string-clock）：
       「松弛的弹性绳指针，但尖端硬弹簧确保读数绝对准确 ——
         笔画在撒谎，而时间没有。」
     · 24 段不是各自独立地颤：它们是同一根绳上的 24 个采样点。一次拨动
       从 0 点出发，第 i 段比第 0 段晚 i·LAG 秒起振，绕环一圈后再以 LAP
       的强度回声一次 —— 这才是"整圈有传播感"而不是"24 段一起闪"。
     · 二阶弹簧阻尼 F = -k(x-t) - c·v，半隐式欧拉（与 motion.js 的 Spring
       同一套积分与收敛判据）；ζ = c/(2√(km)) ≈ 0.55 → 轻微过冲。
     · 光点（hand）全程不参与：那是"时间"，必须绝对精确，一帧都不许抖。
     · 数据到 → 跑约 1.5s → 精确复位 → cancelAnimationFrame，绝不常驻。
     ★ 数据驱动的东西不能走 CSS 过渡（Apple Design §3）：拨动期间把 .seg
       上那条 220ms 的 transition 临时摘掉，否则每帧写入都会被过渡糊平。
     ============================================================ */
  const ROPE = {
    LAG: 0.045,    // 相邻两段的传播延迟（秒）；24×LAG ≈ 1.08s 绕环一圈
    LAP: 0.38,     // 绕回起点后的回声强度（环是有周期边界的）
    K: 240, C: 17, M: 1,             // ζ = 17/(2√240) ≈ 0.55 → 过冲约 12%
    R_AMP: 4.2,    // 横向摆动幅度（px）：绳子被拨动时向外鼓
    W_RATIO: 0.30, // 粗细起伏：被拉长的地方变细
    O_ADD: 0.10, O_MUL: 0.34,        // 亮度起伏：暗的段也会被波"照亮"一下
    EPS: 0.004,    // 收敛阈值
    TMAX: 3.2,     // 兜底：无论发生什么，超过这么久一定停
  };
  const LAP_T = ROPE.LAG * 24;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function RopeSpring(k, c, m) {
    this.k = k; this.c = c; this.m = m;
    this.x = 0; this.v = 0; this.t = 0; this.settled = true;
  }
  RopeSpring.prototype.pluck = function (amp) { this.x = amp; this.v = 0; this.t = 0; this.settled = false; };
  RopeSpring.prototype.step = function (dt) {
    const h = dt > 1 / 30 ? 1 / 30 : dt;                          // 帧率抖动保护
    this.v += ((-this.k * (this.x - this.t) - this.c * this.v) / this.m) * h;
    this.x += this.v * h;
    if (Math.abs(this.v) < 0.01 && Math.abs(this.x) < ROPE.EPS) { this.x = 0; this.v = 0; this.settled = true; }
    return this.x;
  };

  const spring = new RopeSpring(ROPE.K, ROPE.C, ROPE.M);
  const hist = [];                       // {t,v} 位移采样；行波靠"回看历史"取延迟值
  let ropeRaf = 0, ropeT0 = 0, ropeT = 0, ropeFrames = 0, ropeMaxE = 0;
  let segEls = [], segBaseO = [], segA0 = [], segA1 = [];
  let prevHours = null;
  window.__ropeFrames = 0; window.__ropeMaxE = 0; window.__ropeRunning = false;

  // 取 tq 时刻的绳位移（线性插值）。★ 拨动之前绳子是静止的 → 0：
  // 这一条是"传播感"的关键，晚起的段必须从 0 开始，不能跟着一起跳。
  function ropeAt(tq) {
    const n = hist.length;
    if (!n || tq < hist[0].t) return 0;
    if (tq >= hist[n - 1].t) return hist[n - 1].v;
    for (let i = n - 1; i > 0; i--) {
      const a = hist[i - 1], b = hist[i];
      if (a.t <= tq && tq <= b.t) {
        const f = (tq - a.t) / Math.max(1e-6, b.t - a.t);
        return a.v + (b.v - a.v) * f;
      }
    }
    return 0;
  }

  // 把行波画到 24 段上。只有这里会写 segs；hand 永远不碰。
  function ropeDraw(t) {
    let maxE = 0;
    for (let i = 0; i < 24; i++) {
      const p = segEls[i];
      if (!p) continue;
      const lag = t - i * ROPE.LAG;
      const e = ropeAt(lag) + ROPE.LAP * ropeAt(lag - LAP_T);
      const ae = e < 0 ? -e : e;
      if (ae > maxE) maxE = ae;
      const base = segBaseO[i];
      let o = base + e * (ROPE.O_ADD + ROPE.O_MUL * base);
      if (o < 0) o = 0; else if (o > 1) o = 1;
      p.setAttribute("stroke-opacity", o.toFixed(3));
      p.setAttribute("stroke-width", (SW * (1 + e * ROPE.W_RATIO)).toFixed(2));
      if (ae > 0.002) p.setAttribute("d", arcPath(segA0[i], segA1[i], R + e * ROPE.R_AMP));
    }
    return maxE;
  }

  function ropeStep(t, dt) {
    const v = spring.step(dt);
    hist.push({ t: t, v: v });
    while (hist.length && t - hist[0].t > LAP_T + 1.2) hist.shift();
    const m = ropeDraw(t);
    ropeMaxE = m; ropeFrames++;
    window.__ropeFrames = ropeFrames; window.__ropeMaxE = m;
    return m;
  }

  // 收敛后精确复位：静止态与"没有绳索"时逐位相同 —— 读数不撒谎
  function ropeStop() {
    if (ropeRaf) { cancelAnimationFrame(ropeRaf); ropeRaf = 0; }
    hist.length = 0;
    for (let i = 0; i < 24; i++) {
      const p = segEls[i];
      if (!p) continue;
      p.setAttribute("d", arcPath(segA0[i], segA1[i], R));
      p.setAttribute("stroke-width", String(SW));
      p.setAttribute("stroke-opacity", segBaseO[i].toFixed(3));
      if (p.style.transition === "none") p.style.transition = "";   // 还原 .seg 的悬停过渡
    }
    window.__ropeRunning = false;
  }

  function ropeFrame(nowMs) {
    ropeRaf = 0;
    const t = Math.max(nowMs / 1000, ropeT + 1 / 240);   // rAF 时间戳可能早于 push 时刻，保证单调
    const dt = ropeT ? Math.min(Math.max(t - ropeT, 1 / 240), 1 / 30) : 1 / 60;
    ropeT = t;
    const m = ropeStep(t, dt);
    if ((spring.settled && m < ROPE.EPS) || t - ropeT0 > ROPE.TMAX) { ropeStop(); return; }
    ropeRaf = requestAnimationFrame(ropeFrame);
  }

  // 拨一下：amp 0~1。返回是否真的启动（数据没变就别启动 rAF）
  function pluck(amp) {
    if (reduce || !segEls.length || !(amp > 0)) return false;
    if (ropeRaf) { cancelAnimationFrame(ropeRaf); ropeRaf = 0; }
    hist.length = 0;
    spring.pluck(amp);
    ropeT0 = ropeT = performance.now() / 1000;
    // CSS 过渡会把弹簧糊平 —— 拨动期间临时摘掉（结束后 ropeStop 还回去）
    for (let i = 0; i < 24; i++) if (segEls[i]) segEls[i].style.transition = "none";
    ropeStep(ropeT, 1 / 60);              // 首帧：波从 0 点起，之后靠延迟传出去
    window.__ropeRunning = true;
    ropeRaf = requestAnimationFrame(ropeFrame);
    return true;
  }

  // 数据变了多少 → 拨多狠。完全没变就一点都不拨（连一次 rAF 都不启动）。
  function pluckAmp(prev, next) {
    if (reduce) return 0;
    if (!prev) return 0.5;                        // 首次上屏：轻轻安放一下
    let d = 0, mx = 60;
    for (let i = 0; i < 24; i++) {
      const a = prev[i] || 0, b = next[i] || 0;
      d += Math.abs(b - a);
      if (b > mx) mx = b;
    }
    if (d < 0.5) return 0;                        // 没有任何变化：绳子不动
    return Math.min(1, 0.5 + 0.9 * (d / mx));
  }

  // 验收探针专用：固定 dt 确定性推进，与真实帧率无关，可精确复现某一相位
  function ropeAdvance(ms) {
    if (ropeRaf) { cancelAnimationFrame(ropeRaf); ropeRaf = 0; }
    const n = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let k = 0; k < n; k++) {
      ropeT += 1 / 60;
      const m = ropeStep(ropeT, 1 / 60);
      if (spring.settled && m < ROPE.EPS) { ropeStop(); break; }
    }
    return ropeMaxE;
  }

  function render(hours, acts, activeSec) {
    describe(hours, activeSec);
    maxSec = Math.max(60, ...hours);
    segs.textContent = "";
    segEls = []; segBaseO = []; segA0 = []; segA1 = [];
    hours.forEach((sec, h) => {
      const a0 = h * 15 + GAP / 2, a1 = (h + 1) * 15 - GAP / 2;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", arcPath(a0, a1, R));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-width", SW);
      const k = Math.min(1, sec / maxSec);
      // 这一份是"数据本身"的精确值：绳索拨动时围绕它起伏，停下后原样写回
      const o = sec > 0 ? 0.18 + k * 0.72 : 0.045;
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-opacity", o.toFixed(3));
      if (h < 6 || h === 23) p.style.color = "var(--late, #ffb27a)";
      p.className.baseVal = "seg";
      p.dataset.h = h;
      p.dataset.sec = Math.round(sec);
      segs.appendChild(p);
      segEls[h] = p; segBaseO[h] = o; segA0[h] = a0; segA1[h] = a1;
    });

    // 当前时刻的手
    hand.textContent = "";
    const now = new Date();
    const deg = (now.getHours() + now.getMinutes() / 60) * 15;
    const [hx, hy] = polar(deg, R);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    // 光点是"时间"：它的坐标只由 Date 决定，绳索一帧都不许碰它（探针靠这个 id 取证）
    dot.id = "day-now";
    dot.setAttribute("cx", hx); dot.setAttribute("cy", hy); dot.setAttribute("r", 4.2);
    dot.setAttribute("fill", "currentColor");
    hand.appendChild(dot);
    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("cx", hx); halo.setAttribute("cy", hy); halo.setAttribute("r", 10);
    halo.setAttribute("fill", "currentColor"); halo.setAttribute("fill-opacity", "0.16");
    hand.appendChild(halo);
    const [ix, iy] = polar(deg, R - SW - 8);
    const inner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    inner.setAttribute("cx", ix); inner.setAttribute("cy", iy); inner.setAttribute("r", 2);
    inner.setAttribute("fill", "currentColor"); inner.setAttribute("fill-opacity", "0.5");
    hand.appendChild(inner);

    // 悬停提示
    segs.querySelectorAll(".seg").forEach((p) => {
      p.addEventListener("pointerenter", (e) => {
        const h = +p.dataset.h, sec = +p.dataset.sec;
        const m = Math.round(sec / 60);
        tip.textContent = String(h).padStart(2, "0") + ":00 - " + (m >= 60 ? Math.floor(m / 60) + " 小时 " + (m % 60) + " 分" : m + " 分钟");
        tip.classList.remove("hidden");
        const r = stage.getBoundingClientRect(), b = p.getBoundingClientRect();
        tip.style.left = (b.left - r.left + b.width / 2) + "px";
        tip.style.top = (b.top - r.top - 10) + "px";
      });
      p.addEventListener("pointerleave", () => tip.classList.add("hidden"));
    });

    // 新数据到了 → 拨一下绳子。data 变了多少就拨多狠；一点没变则连 rAF 都不启动。
    const amp = pluckAmp(prevHours, hours);
    prevHours = hours.slice();
    if (amp > 0) pluck(amp);
  }

  /* ---------- 自动草稿：机器替你写好今天 ---------- */
  const LABEL = { coding: "写代码", terminal: "敲命令", browsing: "查资料", chat: "聊天", game: "打游戏", video: "看视频", writing: "写字", other: "在电脑前" };
  function draft(hours, acts, activeSec) {
    const box = $("auto-draft");
    if (!box) return;
    const mins = Math.round(activeSec / 60);
    if (mins < 5) { box.classList.add("hidden"); return; }
    const hh = Math.floor(mins / 60), mm = mins % 60;
    const parts = ["今天在电脑前 " + (hh ? hh + " 小时 " : "") + (mm ? mm + " 分" : hh ? "" : "不到 1 分钟")];
    const top = Object.entries(acts || {}).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 600) parts.push("大半时间在" + (LABEL[top[0]] || "电脑前"));
    const late = (hours[0] || 0) + (hours[1] || 0) + (hours[2] || 0) + (hours[3] || 0) + (hours[4] || 0);
    if (late > 900) parts.push("凌晨还在 " + Math.round(late / 60) + " 分");
    const peak = hours.indexOf(Math.max(...hours));
    if (peak >= 0 && hours[peak] > 1800) parts.push("最投入是 " + peak + " 点那会儿");
    box.innerHTML = '<div class="ad-label">今天，我已经替你写好了</div>' +
      '<div class="ad-text">' + parts.join("，") + "。</div>" +
      '<div class="ad-actions"><button id="ad-yes" class="ad-btn">就这样，记下</button>' +
      '<button id="ad-no" class="ad-btn ghost">不记</button></div>';
    box.classList.remove("hidden");
    const yes = $("ad-yes"), mood = $("mood");
    if (yes) yes.addEventListener("click", () => {
      if (!mood) return;
      mood.value = parts.join("，") + "。";
      mood.dispatchEvent(new Event("input", { bubbles: true }));
      mood.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      box.innerHTML = '<div class="ad-label">记下了</div><div class="ad-text">「' + mood.value + '」</div>';
      if (window.Sfx) Sfx.chime();
      if (window.FX) FX.confetti(innerWidth * 0.78, innerHeight * 0.4, 40);
      if (window.Pet) Pet.cheer();
    });
    const no = $("ad-no");
    if (no) no.addEventListener("click", () => box.classList.add("hidden"));
  }

  let last = null;
  async function pull() {
    try {
      const r = await fetch("/sense?t=" + Date.now(), { cache: "no-store" });
      const j = await r.json();
      if (!j || !j.ok || !j.hours) return;
      render(j.hours, j.acts, j.activeSecToday || 0);
      draft(j.hours, j.acts, j.activeSecToday || 0);
      last = j;
    } catch (e) {}
  }
  pull();
  setInterval(pull, 60000);

  window.DayRing = {
    pull, R, CX, CY,
    // 验收探针：rope.state() 读弹簧状态；rope.pluck/advance 用来精确复现某个相位
    rope: {
      pluck, advance: ropeAdvance,
      state: () => ({
        amp: +spring.x.toFixed(5), vel: +spring.v.toFixed(5), settled: spring.settled,
        frames: ropeFrames, running: !!ropeRaf, maxE: +ropeMaxE.toFixed(5),
        histLen: hist.length, zeta: +(ROPE.C / (2 * Math.sqrt(ROPE.K * ROPE.M))).toFixed(3),
      }),
    },
  };
})();