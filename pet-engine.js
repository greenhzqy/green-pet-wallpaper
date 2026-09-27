/* ============================================================
   Green · 角色动画引擎  pet-engine.js
   目标：QQ 宠物级的"活"——不是几个 CSS 关键帧，而是——
     · 每帧驱动的骨骼动画（全身关节独立）
     · 弹簧物理做次级运动（耳朵/手臂/头都滞后于身体）
     · 眼球扫视（saccade）+ 随机眨眼（灵动感的最大来源）
     · 行为状态机 + 走位（会走、会跳、会坐、会睡、会反应）
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  if (!$("pet-svg")) return;

  /* ---------- 数学 ---------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ---------- 弹簧（次级运动用） ---------- */
  function spr(v) { return { v: v || 0, t: v || 0, vel: 0, k: 0.22, d: 0.76 }; }
  function stepS(s) {
    s.vel = (s.vel + (s.t - s.v) * s.k) * s.d;
    s.v += s.vel;
    return s.v;
  }

  /* ---------- 关节 ---------- */
  const J = {
    root: $("g-root"), body: $("g-body"), face: $("g-face"),
    earL: $("g-earL"), earR: $("g-earR"),
    armL: $("g-armL"), armR: $("g-armR"),
    legL: $("g-legL"), legR: $("g-legR"), legFL: $("g-legFL"), legFR: $("g-legFR"),
    shadow: $("g-shadow"), orbit: $("g-orbit"),
    eyes: $("g-eyes"), pupilL: $("pupilL"), pupilR: $("pupilR"),
    mouth: $("g-mouths"),
  };
  const EXP = {
    eyes: J.eyes, happy: $("eyesHappy"), surprised: $("eyesSurprised"),
    closed: $("eyesClosed"), sad: $("eyesSad"), focus: $("eyesFocus"),
  };
  const MOUTH = {
    smile: $("m-smile"), open: $("m-open"), oh: $("m-oh"),
    flat: $("m-flat"), frown: $("m-frown"), w: $("m-w"),
  };

  /* 写 transform：先位移，再绕枢轴缩放+旋转 */
  function xf(el, dx, dy, rot, sx, sy, px, py) {
    if (!el) return;
    el.setAttribute(
      "transform",
      "translate(" + dx.toFixed(2) + " " + dy.toFixed(2) + ") " +
      "translate(" + px + " " + py + ") rotate(" + rot.toFixed(2) + ") " +
      "scale(" + sx.toFixed(4) + " " + sy.toFixed(4) + ") translate(" + -px + " " + -py + ")"
    );
  }

  /* ---------- 表情 ---------- */
  let curExp = null;   // 必须是 null：否则首次 showExpr 会被提前 return，初始化不执行
  function showExpr(name) {
    if (name === curExp) return;
    curExp = name;
    const on = { eyes: false, happy: false, surprised: false, closed: false, sad: false, focus: false };
    if (name === "normal") on.eyes = true;
    else if (name === "happy") on.happy = true;
    else if (name === "surprised") on.surprised = true;
    else if (name === "closed" || name === "sleepy") on.closed = true;
    else if (name === "sad") on.sad = true;
    else if (name === "focus") on.focus = true;
    for (const k in on) if (EXP[k]) EXP[k].style.display = on[k] ? "" : "none";
  }
  let curMouth = null; // 同上
  function showMouth(name) {
    if (name === curMouth) return;
    curMouth = name;
    for (const k in MOUTH) if (MOUTH[k]) MOUTH[k].style.display = k === name ? "" : "none";
  }
  showExpr("normal"); showMouth("smile");

  /* ---------- 眼球扫视（saccade）：灵动感的第一来源 ---------- */
  let gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
  function saccade(now) {
    if (now < gaze.next) return;
    // 60% 看向鼠标，40% 随机（真实眼球就是到处瞟）
    if (cursor.active && Math.random() < 0.6) {
      const r = J.root.getBoundingClientRect ? null : null;
      gaze.tx = clamp(cursor.nx * 1.6, -1, 1);
      gaze.ty = clamp(cursor.ny * 1.3, -0.7, 1);
    } else {
      gaze.tx = rnd(-1, 1);
      gaze.ty = rnd(-0.6, 0.9);
    }
    gaze.next = now + rnd(520, 2400);
  }
  const cursor = { x: 0, y: 0, nx: 0, ny: 0, active: false };
  addEventListener("pointermove", (e) => {
    cursor.x = e.clientX; cursor.y = e.clientY; cursor.active = true;
    const r = J.root && J.root.ownerSVGElement ? J.root.ownerSVGElement.getBoundingClientRect() : null;
    if (r && r.width) {
      cursor.nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      cursor.ny = (e.clientY - (r.top + r.height * 0.6)) / (r.height / 2);
    }
  }, { passive: true });

  /* ---------- 眨眼 ---------- */
  let blink = { next: performance.now() + 1200, until: 0, closing: 0, queue: 0 };
  function blinkTick(now) {
    if (now > blink.next) {
      blink.closing = 1;
      blink.until = now + 110;
      blink.next = now + rnd(1900, 5200);
      if (Math.random() < 0.25) blink.queue = 1;   // 偶尔连眨
    }
    if (blink.queue && now > blink.until + 90) { blink.closing = 1; blink.until = now + 100; blink.queue = 0; }
    if (blink.closing && now > blink.until) blink.closing = 0;
  }

  /* ---------- 行为状态机 ---------- */
  const BEH = ["hop", "tiltL", "tiltR", "stretch", "lean", "nod", "shake", "spin",
    "look", "look", "look", "sit", "wave", "walk", "walk", "sneeze", "stretch"];
  let beh = null, behT = 0, behDur = 0, nextBeh = 0;

  function play(name, dur) {
    beh = name; behT = 0;
    behDur = dur || ({ hop: 720, tiltL: 900, tiltR: 900, stretch: 1100, lean: 900,
      nod: 760, shake: 620, spin: 900, look: 1200, sit: 2600, wave: 1500,
      walk: 2200, sneeze: 700 }[name] || 900);
    if (name === "sit") { showExpr("normal"); showMouth("smile"); }
    if (name === "wave") { showExpr("happy"); showMouth("open"); }
    if (name === "sneeze") { showExpr("closed"); showMouth("oh"); }
  }
  function endBeh() {
    beh = null; behT = 0;
    showExpr("normal"); showMouth("smile");
    nextBeh = performance.now() + rnd(1400, 4200);
  }

  /* 走位 */
  const walk = { x: 0, target: 0, facing: 1, speed: 0.16 };
  function pickWalkTarget() {
    let t = clamp(walk.x + rnd(-90, 90), -78, 78);
    if (Math.abs(t - walk.x) < 26) t = clamp(walk.x + (Math.random() < 0.5 ? -52 : 52), -78, 78);
    walk.target = t;
  }

  /* ---------- 次级运动弹簧 ---------- */
  const S = {
    earL: spr(), earR: spr(), armL: spr(), armR: spr(),
    bodyY: spr(), headRot: spr(), shadow: spr(1),
  };

  /* ---------- 睡眠 / 状态 ---------- */
  let sleepy = false, joy = 0;
  function readExternalState() {
    const spr2 = $("sprite");
    const cls = spr2 ? spr2.className : "";
    const forcedSleep = /sleepy/.test(cls);
    const forcedHappy = /happy/.test(cls);
    const sense = (window.PetFX && window.PetFX.sense && window.PetFX.sense()) || null;
    const away = sense && sense.ok && (sense.idleSec || 0) > 420;
    sleepy = forcedSleep || away;
    if (forcedHappy) joy = Math.max(joy, 0.8);
  }

  /* ---------- 主循环 ---------- */
  let frameNo = 0;
  let last = performance.now();
  const t0 = last;
  function frame(now) {
    frameNo++;
    // ★ dt 必须钳在 [0,3]：rAF 时间戳可能早于看门狗用的 performance.now()，
    //   负 dt 会让 lerp/弹簧系数变负且绝对值>1 → 指数发散
    let dt = (now - last) / 16.667;
    last = now;
    dt = dt < 0 ? 0 : (dt > 3 ? 3 : dt);
    const t = (now - t0) / 1000;
    readExternalState();
    saccade(now);
    blinkTick(now);

    /* ===== 1) 待机层：永远在动（呼吸 + 微晃 + 噪声） ===== */
    let rootDX = 0, rootDY = 0, rootRot = 0, rootSX = 1, rootSY = 1;
    let bodyDY = 0, bodyRot = 0, bodySX = 1, bodySY = 1;
    let earLT = 0, earRT = 0, armLT = 0, armRT = 0;
    let legDY = 0, shadowS = 1, shadowO = 0.42;
    let headRotT = 0;
    let blinkAmt = blink.closing ? 1 : 0;

    const breathSpeed = sleepy ? 0.85 : 1.85;
    const br = Math.sin(t * breathSpeed);
    rootDY += br * (sleepy ? 2.2 : 1.3);
    rootSY = 1 + br * (sleepy ? 0.032 : 0.022);
    rootSX = 1 - br * (sleepy ? 0.026 : 0.018);
    // 微晃（两个不同频率叠加 → 永远不重复）
    rootRot += Math.sin(t * 0.83) * 1.15 + Math.sin(t * 2.27 + 1.1) * 0.4;
    rootDX += Math.sin(t * 0.57 + 0.4) * 1.5;
    // 耳朵/手臂滞后摆动
    earLT += Math.sin(t * breathSpeed - 0.9) * 6.5;
    earRT += Math.sin(t * breathSpeed - 1.15) * 6.5;
    armLT += Math.sin(t * breathSpeed - 0.7) * 5;
    armRT += Math.sin(t * breathSpeed - 0.95) * 5;
    // 极低幅噪声：让它"绝不静止"
    rootDY += (Math.random() - 0.5) * 0.32;
    rootRot += (Math.random() - 0.5) * 0.22;

    /* ===== 2) 行为层 ===== */
    if (!beh && now > nextBeh) play(sleepy ? "sit" : pick(BEH));
    if (beh) {
      behT += dt * 16.667;
      const p = clamp(behT / behDur, 0, 1);
      switch (beh) {
        case "hop": {
          const a = clamp(p / 0.18, 0, 1), u = clamp((p - 0.18) / 0.52, 0, 1), d = clamp((p - 0.7) / 0.3, 0, 1);
          if (p < 0.18) { rootSY = 1 - 0.14 * a; rootSX = 1 + 0.12 * a; rootDY += 5 * a; }
          else if (p < 0.7) { const h = Math.sin(u * Math.PI); rootDY -= 34 * h; rootSY = 1 + 0.13 * h; rootSX = 1 - 0.1 * h; }
          else { const sq = Math.sin(d * Math.PI); rootDY += 7 * sq; rootSY = 1 - 0.15 * sq; rootSX = 1 + 0.13 * sq; }
          shadowS = 1 - clamp(Math.max(0, 1 - Math.abs(rootDY) / 30), 0, 1) * 0.42;
          shadowO = 0.42 - clamp(Math.abs(rootDY) / 40, 0, 1) * 0.2;
          earLT += -18 * clamp((p - 0.18) / 0.4, 0, 1); earRT += -18 * clamp((p - 0.18) / 0.4, 0, 1);
          armLT += -26 * clamp((p - 0.18) / 0.4, 0, 1); armRT += 26 * clamp((p - 0.18) / 0.4, 0, 1);
          break;
        }
        case "tiltL": { const w = Math.sin(p * Math.PI); bodyRot -= 9 * w; earLT += 14 * w; earRT += 20 * w; break; }
        case "tiltR": { const w = Math.sin(p * Math.PI); bodyRot += 9 * w; earRT -= 14 * w; earLT -= 20 * w; break; }
        case "stretch": { const w = Math.sin(p * Math.PI); rootSY = 1 + 0.16 * w; rootSX = 1 - 0.12 * w; rootDY -= 7 * w; armLT += -30 * w; armRT += 30 * w; break; }
        case "lean": { const w = Math.sin(p * Math.PI); rootDX += 13 * w; bodyRot += 5 * w; earLT += 22 * w; earRT += 12 * w; break; }
        case "nod": { bodyRot += Math.sin(p * TAU * 1.6) * 3.5; rootDY += Math.abs(Math.sin(p * TAU * 1.6)) * 3; break; }
        case "shake": { rootRot += Math.sin(p * TAU * 3.2) * 8 * (1 - p); earLT += Math.sin(p * TAU * 3.6) * 22 * (1 - p); earRT -= Math.sin(p * TAU * 3.6) * 22 * (1 - p); break; }
        case "spin": { const w = easeIO(p); rootRot += w * 360; rootDY -= Math.sin(p * Math.PI) * 16; rootSY = 1 - Math.sin(p * Math.PI) * 0.08; break; }
        case "look": { headRotT = Math.sin(p * Math.PI) * 7; break; }
        case "sit": { const w = easeOut(clamp(p / 0.25, 0, 1)); rootDY += 9 * w; rootSY = 1 - 0.07 * w; rootSX = 1 + 0.06 * w; armLT += 10 * w; armRT -= 10 * w; break; }
        case "wave": { const w = Math.sin(p * Math.PI); armRT -= 78 * w; armRT += Math.sin(p * TAU * 3) * 18 * w; bodyRot += 4 * w; break; }
        case "sneeze": {
          const a = clamp(p / 0.45, 0, 1), b = clamp((p - 0.45) / 0.2, 0, 1);
          if (p < 0.45) { rootSY = 1 - 0.1 * a; rootSX = 1 + 0.09 * a; rootRot += 5 * a; }
          else { const j = 1 - b; rootDY -= 13 * Math.sin(b * Math.PI); rootSY = 1 + 0.18 * Math.sin(b * Math.PI); rootSX = 1 - 0.14 * Math.sin(b * Math.PI); rootRot -= 7 * Math.sin(b * Math.PI); earLT -= 30 * Math.sin(b * Math.PI); armLT -= 24 * Math.sin(b * Math.PI); armRT -= 24 * Math.sin(b * Math.PI); }
          break;
        }
        case "walk": {
          if (p < 0.06) pickWalkTarget();
          const dir = Math.sign(walk.target - walk.x) || 1;
          walk.facing = dir;
          walk.x += dir * walk.speed * 16.667 * dt;
          if ((dir > 0 && walk.x >= walk.target) || (dir < 0 && walk.x <= walk.target)) walk.x = walk.target;
          const cyc = (now / 118) % 1;
          const stepA = Math.sin(cyc * TAU), stepB = Math.sin(cyc * TAU + Math.PI);
          xf(J.legL, stepA * 6, -Math.max(0, stepA) * 7, stepA * 18, 1, 1, 84, 166);
          xf(J.legR, stepB * 6, -Math.max(0, stepB) * 7, stepB * 18, 1, 1, 136, 166);
          rootDY += Math.abs(Math.sin(cyc * TAU)) * -3.4;
          rootRot += Math.sin(cyc * TAU) * 2.4;
          armLT += stepB * 24; armRT += stepA * 24;
          // 走路时两粒电子跟着上下颠
          earLT += Math.sin(cyc * TAU + 0.5) * 16; earRT += Math.sin(cyc * TAU + 0.8) * 16;
          walk.legDone = true;
          break;
        }
      }
      if (behT >= behDur) endBeh();
    }

    /* ===== 3) 走路位移（不在 walk 行为时平滑回落，并左右翻身） ===== */
    if (beh !== "walk") walk.x = lerp(walk.x, 0, 0.02 * dt);
    const flip = walk.facing;

    /* ===== 4) 睡眠表现 ===== */
    if (sleepy && beh !== "sneeze") {
      if (beh !== "sit") { showExpr("closed"); }
      showMouth("w");
    }

    /* ===== 5) 写回关节 ===== */
    xf(J.root, rootDX + walk.x, rootDY, rootRot, rootSX * flip, rootSY, 110, 170);
    if (beh !== "walk") {
      xf(J.legL, 0, 0, 0, 1, 1, 84, 166);
      xf(J.legR, 0, 0, 0, 1, 1, 136, 166);
    }
    xf(J.body, 0, bodyDY, bodyRot, bodySX, bodySY, 110, 170);
    S.earL.t = earLT; S.earR.t = earRT;
    S.armL.t = armLT; S.armR.t = armRT;
    xf(J.earL, 0, 0, stepS(S.earL), 1, 1, 34, 76);
    xf(J.earR, 0, 0, stepS(S.earR), 1, 1, 186, 76);
    xf(J.armL, 0, 0, stepS(S.armL), 1, 1, 48, 128);
    xf(J.armR, 0, 0, stepS(S.armR), 1, 1, 172, 128);
    // 影子
    shadowS = lerp(shadowS, 1 - clamp(-rootDY / 44, 0, 1) * 0.4, 0.3);
    xf(J.shadow, walk.x * 0.7, 0, 0, shadowS, shadowS, 110, 181);
    if (J.shadow) J.shadow.setAttribute("opacity", clamp(0.42 - clamp(-rootDY / 60, 0, 1) * 0.18, 0.1, 0.5).toFixed(3));

    /* ===== 6) 眼球（扫视 + 眨眼） ===== */
    gaze.x = lerp(gaze.x, gaze.tx, 0.28 * dt);
    gaze.y = lerp(gaze.y, gaze.ty, 0.28 * dt);
    const gx = gaze.x * 3.4, gy = gaze.y * 2.4;
    if (J.pupilL) J.pupilL.setAttribute("transform", "translate(" + gx.toFixed(2) + " " + gy.toFixed(2) + ")");
    if (J.pupilR) J.pupilR.setAttribute("transform", "translate(" + gx.toFixed(2) + " " + gy.toFixed(2) + ")");
    // 眨眼：眼睛纵向压扁
    const bs = blink.closing ? 0.08 : 1;
    if (J.eyes) {
      J.eyes.setAttribute("transform", "translate(110 94) scale(1 " + bs + ") translate(-110 -94)");
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* 看门狗：浏览器在后台标签页会节流 requestAnimationFrame，
     宠物会"僵住"。超过 260ms 没有 rAF 就用定时器兜底驱动，
     保证它在任何情况下都在动。 */
  let rAFbeat = performance.now();
  const _frameInner = frame;
  frame = function (now) { rAFbeat = performance.now(); _frameInner(now); };
  requestAnimationFrame(frame);
  setInterval(() => {
    const now = performance.now();
    if (now - rAFbeat > 260) _frameInner(now);
  }, 33);

  /* ---------- 对外接口 ---------- */
  let blushBoost = 0;
  window.PetDebug = () => ({ frame: frameNo, beh: beh, t: ((last - t0) / 1000).toFixed(1), walkX: walk.x.toFixed(1), gaze: gaze.x.toFixed(2) + ',' + gaze.y.toFixed(2), sleepy: sleepy });
  window.Pet = {
    play,
    expr: showExpr,
    mouth: showMouth,
    blush(v) { blushBoost = v; },
    cheer() { play("hop"); showExpr("happy"); showMouth("open"); joy = 1; },
    pet() { play("hop"); showExpr("happy"); showMouth("open"); },
    say(t) { if (window.PetFX && window.PetFX.say) window.PetFX.say(t); },
  };
})();