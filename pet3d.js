/* ============================================================
   Green · 氢之卡比 3D  pet3d.js
   用 three.js 现搭一个真三维的氢之卡比（程序化建模，零模型文件）：
     · 球体身体 + 大椭圆眼 + 腮红 + 小嘴 + 短手 + 大脚 + 头顶嫩芽
     · 三点布光（主光带阴影 + 轮廓光 + 环境光）+ ACES 色调映射
     · 呼吸 / 眨眼 / 眼球跟随 / 跳跃 / 走路 / 挥手 / 转圈 / 打喷嚏
     · 保留 window.Pet 接口，上层（卡牌/命令面板/音效）不用改
   ============================================================ */
(function () {
  "use strict";
  const host = document.getElementById("sprite");
  if (!host) return;
  function fallback2D(why) {
    console.warn("[Green] 3D 不可用，回退 2D：", why);
    if (!document.querySelector('script[data-pet2d]')) {
      const s = document.createElement("script");
      s.src = "pet-engine.js";          // 不写版本号：服务端已发 no-cache, must-revalidate，永远取最新
      s.setAttribute("data-pet2d", "1");
      s.onerror = () => console.error("[Green] 2D 兜底脚本加载失败");
      s.onload = () => console.log("[Green] 已回退到 2D 引擎");
      document.head.appendChild(s);
    }
  }
  if (!window.THREE) { fallback2D("three.js 未加载"); return; }

  /* ---------- 渲染器 ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { fallback2D("WebGL 初始化失败: " + e.message); return; }
  const _dprCap = window.__petDprCap || 1.5;   // 壁纸场景会压到 1.25，省 GPU
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, _dprCap));
  if (THREE.SRGBColorSpace && "outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else if ("outputEncoding" in renderer && THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.76;
  // 不再设置已弃用的 useLegacyLights（r155+ 默认物理正确光照），各光强度已乘 π 补偿
  // ★ 关掉阴影贴图：每帧少跑一整趟渲染。接触阴影用的是下面的 canvas 贴图，效果更好也更便宜
  renderer.shadowMap.enabled = false;
  renderer.domElement.id = "pet3d";
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
  host.appendChild(renderer.domElement);

  /* ---------- 场景 / 相机 ---------- */
  const scene = new THREE.Scene();
  /* ★ 修复：hop 把整只宠物抬高 0.82 世界单位，而原构图上方只剩 ~0.38 的余量，
     于是跳跃时头顶/嫩芽被 canvas 视口裁掉（"被无形框住"）。
     fov 34→37 让可视半高 1.514→1.657，lookAt.y 0.02→0.16 把构图下移，
     两者合计给上方腾出 ~0.44 的余量。代价：宠物视觉上小约 8.6%。 */
  /* ★ 修复：宠物的动作包络比画布大 ——
     手臂最外缘 ±1.30（walk 再横移 ±0.30）、hop 时头顶 2.05、坐下时脚底 -1.15。
     实测包络：x ±1.79、y [-1.69, +2.08]（世界坐标）。
     fov 40 固定，把相机沿视线后拉 13%（4.92→5.56），可视半高 1.803→2.04；
     lookAt.y 定在包络中心 0.20。这样手臂与头顶都不再撞边。 */
  const camera = new THREE.PerspectiveCamera(40, 1, 1.0, 18);
  camera.position.set(0, 0.66, 5.56);
  camera.lookAt(0, 0.20, 0);

  /* ---------- 环境贴图：影棚打光（没有它 clearcoat 出不来反光） ---------- */
  (function buildEnv() {
    try {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 256;
      const x = c.getContext("2d");
      // 上亮下暖的垂直渐变（天空 → 地面反射）
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0.00, "#e6e6e6");
      g.addColorStop(0.34, "#c9e8da");
      g.addColorStop(0.52, "#96c2ac");
      g.addColorStop(0.72, "#5f8f76");
      g.addColorStop(1.00, "#2f4d3c");
      x.fillStyle = g; x.fillRect(0, 0, 512, 256);
      // 主光柔光斑（决定了高光的位置和形状）
      const rg = x.createRadialGradient(140, 66, 0, 140, 66, 130);
      rg.addColorStop(0, "rgba(255,255,255,0.9)");
      rg.addColorStop(0.5, "rgba(255,255,255,.55)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 512, 256);
      // 侧后方补一个冷光斑，给边缘一层轮廓
      const rg2 = x.createRadialGradient(410, 96, 0, 410, 96, 110);
      rg2.addColorStop(0, "rgba(200,255,235,.6)");
      rg2.addColorStop(1, "rgba(200,255,235,0)");
      x.fillStyle = rg2; x.fillRect(0, 0, 512, 256);

      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      if (THREE.SRGBColorSpace && "colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
      else if (THREE.sRGBEncoding !== undefined && "encoding" in tex) tex.encoding = THREE.sRGBEncoding;
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose(); tex.dispose();
    } catch (e) { console.warn("[Green] 环境贴图失败（不影响主流程）", e); }
  })();

  /* ---------- 布光 ---------- */
  scene.add(new THREE.HemisphereLight(0xe2fff0, 0x3d7055, 1.19));

  const key = new THREE.DirectionalLight(0xfffdf6, 3.33);
  key.position.set(-2.2, 3.4, 3.0);
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 12;
  key.shadow.camera.left = -2; key.shadow.camera.right = 2;
  key.shadow.camera.top = 2; key.shadow.camera.bottom = -2;
  key.shadow.radius = 7; key.shadow.bias = -0.0018;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xc8ffe2, 1.45);
  rim.position.set(2.6, 1.4, -2.4);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xdffaff, 0.82);
  fill.position.set(1.4, -0.6, 2.2);
  scene.add(fill);

  /* ---------- 材质 ---------- */
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x27a054, roughness: 0.34, metalness: 0.0,
    clearcoat: 0.50, clearcoatRoughness: 0.18,
    // ★ 性能：sheen 是织物 BRDF，在这种光面塑料上肉眼不可见，却要多跑一整条光照通路
    envMapIntensity: 0.26,
  });
  const limbMat = new THREE.MeshPhysicalMaterial({ color: 0x219148, roughness: 0.30, clearcoat: 0.52, clearcoatRoughness: 0.18, envMapIntensity: 0.26 });
  const footMat = new THREE.MeshPhysicalMaterial({ color: 0x1d8742, roughness: 0.30, clearcoat: 0.50, clearcoatRoughness: 0.19, envMapIntensity: 0.25 });
  const eyeMat  = new THREE.MeshPhysicalMaterial({ color: 0x26264e, roughness: 0.20, metalness: 0.0, clearcoat: 0.70, clearcoatRoughness: 0.10, envMapIntensity: 0.28 });
  const hlMat   = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blueMat = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.8 });
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff6b93, transparent: true, opacity: 0.72 });
  const mouthMat = new THREE.MeshPhysicalMaterial({ color: 0x2a1430, roughness: 0.3, clearcoat: 0.8 });
  const leafMat  = new THREE.MeshPhysicalMaterial({ color: 0x49c47a, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.6, side: THREE.DoubleSide });
  const leafMat2 = new THREE.MeshPhysicalMaterial({ color: 0x1f8a48, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.6, side: THREE.DoubleSide });
  const ringMat  = new THREE.MeshBasicMaterial({ color: 0x9BF0B4, transparent: true, opacity: 0.16 });

  /* ---------- 角色根 ---------- */
  const R = 1;                       // 身体半径
  const root = new THREE.Group();    // 位置 / 缩放（跳、走、呼吸）
  const body = new THREE.Group();    // 身体容器（自转、歪头）
  root.add(body);
  scene.add(root);

  /* 身体 */
  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), bodyMat);
  bodyMesh.scale.set(1, 0.97, 1);

  body.add(bodyMesh);

  /* 在球面上放一小片"贴片"的通用做法：把 group 转到那个方向，再在里面放扁平物 */
  function onSurface(dir, dist) {
    const g = new THREE.Group();
    const d = dir.clone().normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    const holder = new THREE.Group();
    holder.position.z = dist;
    g.add(holder);
    body.add(g);
    return { g, holder };
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* 眼睛：竖直大椭圆（贴片做法，自动贴合球面朝向） */
  const EYE = { r: 0.152, h: 0.226 };
  function makeEye(sx) {
    // 不再用 onSurface 的旋转组：直接作为 body 的子节点 + 明确坐标 + 有厚度
    const g = new THREE.Group();
    g.position.set(sx * 0.322, 0.398, 0.871);
    g.rotation.y = sx * 0.33;      // 稍微朝外，贴合球面
    g.rotation.x = -0.41;          // 朝上，贴合球面法线
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), eyeMat);
    disc.scale.set(EYE.r, EYE.h, 0.060);
    disc.castShadow = false;
    disc.renderOrder = 2;
    g.add(disc);
    const h1 = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), hlMat);
    h1.scale.set(0.060, 0.080, 0.030);
    h1.position.set(-sx * 0.037, 0.066, 0.066);
    g.add(h1);
    const h2 = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), blueMat);
    h2.scale.set(0.036, 0.048, 0.022);
    h2.position.set(sx * 0.039, -0.080, 0.062);
    g.add(h2);
    body.add(g);
    return { holder: g, disc, h1, h2, baseZ: g.position.z, baseX: g.position.x, baseY: g.position.y };
  }
  const eyeL = makeEye(-1);
  const eyeR = makeEye(1);

  /* 腮红 */
  [-1, 1].forEach((sx) => {
    const { holder } = onSurface(V(sx * 0.63, 0.030, 1), R * 1.008);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), blushMat);
    m.scale.set(0.160, 0.100, 0.02);
    holder.add(m);
  });

  /* 嘴：一条微笑的圆环弧 */
  const mouthPivot = onSurface(V(0, -0.145, 1), R * 1.010);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.026, 10, 32, Math.PI), mouthMat);
  smile.rotation.z = Math.PI;
  mouthPivot.holder.add(smile);
  const mouthO = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mouthMat);
  mouthO.scale.set(0.055, 0.075, 0.03);
  mouthO.position.y = -0.04;
  mouthO.visible = false;
  mouthPivot.holder.add(mouthO);

  /* 手：短圆手臂（挂在一个可动的枢轴上） */
  function makeArm(sx) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.92, -0.08, 0.05);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), limbMat);
    m.scale.set(0.20, 0.26, 0.20);
    m.position.set(sx * 0.16, -0.06, 0);
    pivot.add(m);
    body.add(pivot);
    return pivot;
  }
  const armL = makeArm(-1), armR = makeArm(1);

  /* 脚：两只大椭圆外八脚 */
  function makeFoot(sx) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.42, -0.86, 0.30);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), footMat);
    m.scale.set(0.34, 0.21, 0.42);
    m.rotation.y = sx * 0.22;
    m.castShadow = true;
    pivot.add(m);
    body.add(pivot);
    return pivot;
  }
  const footL = makeFoot(-1), footR = makeFoot(1);

  /* 头顶嫩芽 */
  const sprout = new THREE.Group();
  sprout.position.set(0, 0.955, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.025, 0.12, 12), leafMat2);
  stem.position.y = 0.060;
  sprout.add(stem);
  const leafGeo = new THREE.SphereGeometry(1, 28, 18);
  const lf1 = new THREE.Mesh(leafGeo, leafMat);
  lf1.scale.set(0.140, 0.058, 0.095); lf1.position.set(-0.105, 0.172, 0.01); lf1.rotation.z = 0.95;
  const lf2 = new THREE.Mesh(leafGeo, leafMat2);
  lf2.scale.set(0.140, 0.058, 0.095); lf2.position.set(0.105, 0.165, -0.01); lf2.rotation.z = -0.80;
  sprout.add(lf1, lf2);
  body.add(sprout);

  /* 氢：电子轨道 + 绕核电子 */
  const orbit = new THREE.Group();
  orbit.position.y = -0.14;
orbit.rotation.set(0.62, 0, 0.22);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.012, 8, 128), ringMat);
  orbit.add(ring);
  const electron = new THREE.Mesh(new THREE.SphereGeometry(0.038, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xe8fff0 }));
  orbit.add(electron);
  scene.add(orbit);

  /* 接触阴影（软影子，比 shadowMap 更"玩具感"） */
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(18,48,32,0.38)");
    g.addColorStop(0.42, "rgba(18,48,32,0.16)");
    g.addColorStop(1, "rgba(18,48,32,0)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.06;
  scene.add(shadowPlane);

  /* ---------- 尺寸 ---------- */
  function resize() {
    const w = host.clientWidth || 260, h = host.clientHeight || 260;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
  setTimeout(resize, 80); setTimeout(resize, 400);

  /* ---------- 动画状态 ---------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function spr() { return { v: 0, t: 0, vel: 0, k: 0.22, d: 0.76 }; }
  function stepS(s) { s.vel = (s.vel + (s.t - s.v) * s.k) * s.d; s.v += s.vel; return s.v; }

  const S = { armL: spr(), armR: spr(), footL: spr(), footR: spr(), sprout: spr() };

  /* ★★ 踩键盘的状态必须放在 IIFE 顶层，不能放在 frame() 里。
     放在 frame() 里的话，window.Pet3D.step 这个闭包看不到它们 ——
     每次调用都抛 "stepL is not defined"，而我用 try/catch 把异常吞了，
     所以表现成"调用了但毫无效果"，一路查错方向查了很久。 */
  let stepL = 0, stepR = 0, stepTilt = 0, stepShift = 0;
  // 每只脚各自的落点：nx 横向 -1..1（对应键盘左右），row 纵深 0..1（对应第几排）
  let tgtL = { nx: 0, row: 0 }, tgtR = { nx: 0, row: 0 };

  const BEH = ["hop", "tiltL", "tiltR", "stretch", "lean", "nod", "shake",
    "look", "look", "look", "sit", "wave", "walk", "walk", "sneeze"];
  let beh = null, behT = 0, behDur = 0, nextBeh = 0;
  const DUR = { hop: 720, tiltL: 900, tiltR: 900, stretch: 1100, lean: 900, nod: 760,
    shake: 620, spin: 620, look: 1200, sit: 2600, wave: 1500, walk: 2200, sneeze: 700,
    cheer: 980, yawn: 1750 };

  /* ★ 慵懒度：很久没记录时的状态，外部用 Pet3D.setIdleDays(n) 设置。
     0 = 完全正常，1 = 最懒。所有影响都写成 lazy===0 时与原来逐位等价的乘子，
     绝不动呼吸 / 眨眼 / 注视 / 走路的任何基准常量。 */
  let idleDays = 0, lazy = 0;
  function setLazy(d) {
    idleDays = Math.max(0, Number(d) || 0);
    lazy = clamp((idleDays - 0.5) / 3.5, 0, 1);   // 半天以内不变化，4 天以上满档
    return lazy;
  }

  function play(name) {
    if (name !== "walk") walk.manual = false;   // 非走路动作 → 清掉外部指定的走路目标
    beh = name; behT = 0; behDur = DUR[name] || 900;
  }
  function endBeh() {
    if (beh === "walk") walk.manual = false;    // 一次走路走完 → 恢复随机选点
    beh = null; behT = 0;
    // 越懒，两次动作之间歇得越久（lazy=0 时与原值完全一致）
    nextBeh = performance.now() + rnd(1400, 4200) * (1 + 1.1 * lazy);
  }

  /* 眨眼 */
  let blink = { next: performance.now() + 1200, until: 0, closing: false, queue: false };
  /* 眼球扫视 */
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
  const cursor = { active: false, nx: 0, ny: 0, at: -1e9 };
  addEventListener("pointermove", (e) => {
    cursor.active = true;
    cursor.at = performance.now();
    const r = host.getBoundingClientRect();
    if (!r.width) return;
    cursor.nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1.6, 1.6);
    cursor.ny = clamp((e.clientY - (r.top + r.height * 0.45)) / (r.height / 2), -1.4, 1.4);
  }, { passive: true });

  /* 走路 */
  const walk = { x: 0, target: 0, facing: 1, manual: false, hold: false };
  function pickWalkTarget() {
    let t = clamp(walk.x + rnd(-0.45, 0.45), -0.30, 0.30);   // ★ 0.85→0.30：手臂外缘 ±1.30，游走太远会被 canvas 切掉
    if (Math.abs(t - walk.x) < 0.15) t = clamp(walk.x + (Math.random() < 0.5 ? -0.3 : 0.3), -0.30, 0.30);
    walk.target = t;
  }

  /* ---------- 对外：走动（A） ----------
     自动游走的幅度就是 ±0.30（再远手臂会被 canvas 切掉），外部控制沿用同一个安全范围。
     walkTo(x)      → 走到 x 并停在那里（hold 默认开）
     walkTo(x,false)→ 走到 x，走完照旧慢慢回中（与自动行为一致）
     stop()         → 立刻结束这次走路，回到原来的待机（会慢慢回中）
     不碰任何走路速度 / 步频 / 时长参数。 */
  const WALK_MIN = -0.30, WALK_MAX = 0.30;
  function walkTo(x, hold) {
    const tx = clamp(Number(x) || 0, WALK_MIN, WALK_MAX);
    walk.manual = true;                 // 这一次不走 pickWalkTarget 的随机点
    walk.hold = hold !== false;         // 默认停在目标点
    walk.target = tx;
    play("walk");
    return tx;
  }
  function stop() {
    walk.hold = false;
    walk.manual = false;
    walk.target = walk.x;
    if (beh === "walk") endBeh();
  }

  /* 上层控制 */
  let forcedSleepy = false, forcedHappy = false;
  function readExternal() {
    const cls = host.className || "";
    forcedSleepy = /sleepy/.test(cls);
    forcedHappy = /happy/.test(cls);
  }
  const sense = { idle: 0, active: 0 };

  /* ---------- 主循环 ---------- */
  let last = performance.now(), frameNo = 0, beat = last, lidNow = 1;
  function frame(now) {
    frameNo++;
    // ★ dt 必须钳在 [0,3]：rAF 时间戳可能早于 performance.now()（看门狗用的是后者），
    //   负的 dt 会让 lerp 系数变成负数且绝对值>1 → 指数发散（眼球被推到画面外就是这个原因）
    let dt = (now - last) / 16.667;
    last = now;
    dt = dt < 0 ? 0 : (dt > 3 ? 3 : dt);
    const t = now / 1000;

    readExternal();
    const sleepy = forcedSleepy || (sense.idle > 420 && sense.active > 0);
    const motion = 1 - 0.32 * lazy;   // 慵懒时动作整体放慢；lazy=0 → 1，原速

    /* 眨眼 */
    if (now > blink.next) { blink.closing = true; blink.until = now + 110; blink.next = now + rnd(1900, 5200); if (Math.random() < 0.25) blink.queue = true; }
    if (blink.queue && now > blink.until + 90) { blink.closing = true; blink.until = now + 100; blink.queue = false; }
    if (blink.closing && now > blink.until) blink.closing = false;
    const blinkAmt = (sleepy || blink.closing) ? 0.16 : 1;   // 闭眼留一条可见的线

    /* 扫视 / 盯住界面元素 */
    let focusLean = 0;
    const F = window.PetFocus;
    if (F && F.active) {
      // 你在看哪条内容，它就转头去看哪 —— 偏移量比随机扫视大得多，看得出是在"看东西"
      gaze.tx = F.x * 0.62;
      gaze.ty = F.y * 0.5;
      gaze.next = now + 220;
      focusLean = clamp(F.x, -1, 1) * 0.10;
    }
    // ★ 光标还活着就逐帧跟住它。
    //   原来这段被 gaze.next 定时器管着，每 520~2400ms 才瞄一次，还有 40% 概率随机看别处，
    //   所以鼠标动了眼睛要等一两秒才跟上 —— 这就是"灵敏度低 + 卡"的根源。
    //   现在：光标在动就连续跟随，只有光标真正停下 1.8 秒后才恢复随机扫视。
    const tracking = !(F && F.active) && cursor.active && (now - cursor.at) < 1800;
    if (tracking) {
      gaze.tx = cursor.nx;            // 幅度 0.5 → 1.0
      gaze.ty = -cursor.ny * 0.8;
    } else if (now > gaze.next) {
      gaze.tx = rnd(-0.5, 0.5); gaze.ty = rnd(-0.3, 0.4);
      gaze.next = now + rnd(520, 2400);
    }
    // 跟随时用更快的一阶滤波 → "跟手"，不再拖泥带水
    const gk = (tracking ? 0.34 : 0.16) * dt;
    gaze.x = clamp(lerp(gaze.x, gaze.tx, gk), -0.9, 0.9);   // 硬上限，双保险
    gaze.y = clamp(lerp(gaze.y, gaze.ty, gk), -0.9, 0.9);

    /* ---- 待机层 ---- */
    // 慵懒时呼吸更慢、更深：只给原基准值乘系数，lazy=0 时与原值完全一致
    const calm = 1 + 0.55 * lazy;
    const breathSpeed = (sleepy ? 0.85 : 1.85) * (1 - 0.34 * lazy);
    const br = Math.sin(t * breathSpeed);
    let dy = br * (sleepy ? 0.05 : 0.03) * calm;
    let sy = 1 + br * (sleepy ? 0.045 : 0.03) * calm;
    let sx = 1 - br * (sleepy ? 0.035 : 0.024) * calm;
    let rot = (Math.sin(t * 0.83) * 1.5 + Math.sin(t * 2.27) * 0.5) * Math.PI / 180;
    let rotZ = Math.sin(t * 0.6) * 0.03;
    let armLT = Math.sin(t * breathSpeed - 0.7) * 0.09;
    let armRT = Math.sin(t * breathSpeed - 0.95) * 0.09;
    let sproutT = Math.sin(t * 1.6) * 0.10;
    let footLT = 0, footRT = 0;
    lidNow = 1;          // 探针用：本帧的睁眼量（不参与任何画面计算）
    let squint = 1;      // 眨眼之外的眯眼（打哈欠用）；1 = 不眯，取 min 后与原来完全一致
    let yawnAmt = 0;     // 打哈欠张嘴量；0 = 闭嘴，与原状一致
    let leanX = 0;       // 身体前后倾（打哈欠时后仰）；0 与原状一致

    /* ---- 行为层 ---- */
    if (!beh && now > nextBeh) {
      if (sleepy) play("sit");
      else if (lazy > 0.25 && Math.random() < 0.35) play("yawn");   // 很久没记录 → 偶尔打个哈欠
      else play(pick(BEH));
    }
    if (beh) {
      behT += dt * 16.667 * motion;
      const p = clamp(behT / behDur, 0, 1);
      switch (beh) {
        case "hop": {
          const a = clamp(p / 0.18, 0, 1), u = clamp((p - 0.18) / 0.52, 0, 1), d = clamp((p - 0.7) / 0.3, 0, 1);
          if (p < 0.18) { sy = 1 - 0.16 * a; sx = 1 + 0.14 * a; dy += 0.08 * a; }
          else if (p < 0.7) { const h = Math.sin(u * Math.PI); dy += 0.55 * h; sy = 1 + 0.15 * h; sx = 1 - 0.12 * h; }   // ★ 0.82→0.55：原幅度会顶穿 canvas 上边界
          else { const q = Math.sin(d * Math.PI); dy -= 0.1 * q; sy = 1 - 0.17 * q; sx = 1 + 0.15 * q; }
          armLT += -0.9 * clamp((p - 0.18) / 0.4, 0, 1); armRT += 0.9 * clamp((p - 0.18) / 0.4, 0, 1);
          sproutT += -0.5 * clamp((p - 0.18) / 0.4, 0, 1);
          break;
        }
        case "tiltL": { const w = Math.sin(p * Math.PI); rotZ -= 0.16 * w; sproutT += 0.5 * w; break; }
        case "tiltR": { const w = Math.sin(p * Math.PI); rotZ += 0.16 * w; sproutT -= 0.5 * w; break; }
        case "stretch": { const w = Math.sin(p * Math.PI); sy = 1 + 0.2 * w; sx = 1 - 0.15 * w; dy += 0.1 * w; armLT -= 0.5 * w; armRT += 0.5 * w; break; }
        case "lean": { const w = Math.sin(p * Math.PI); rotZ += 0.1 * w; rot += 0.1 * w; break; }
        case "nod": { rot += Math.sin(p * TAU * 1.6) * 0.07; dy += Math.abs(Math.sin(p * TAU * 1.6)) * 0.03; break; }
        case "shake": { rotZ += Math.sin(p * TAU * 3.2) * 0.16 * (1 - p); sproutT += Math.sin(p * TAU * 3.6) * 0.8 * (1 - p); break; }
        case "spin": { rot += easeIO(p) * TAU; dy += Math.sin(p * Math.PI) * 0.28; break; }
        case "look": { rot += Math.sin(p * Math.PI) * 0.12; break; }
        case "sit": { const w = easeOut(clamp(p / 0.25, 0, 1)); dy -= 0.16 * w; sy = 1 - 0.09 * w; sx = 1 + 0.08 * w; break; }
        case "wave": { const w = Math.sin(p * Math.PI); armRT -= 2.3 * w; armRT += Math.sin(p * TAU * 3) * 0.4 * w; break; }
        case "sneeze": {
          const a = clamp(p / 0.45, 0, 1), b = clamp((p - 0.45) / 0.2, 0, 1);
          if (p < 0.45) { sy = 1 - 0.12 * a; sx = 1 + 0.1 * a; }
          else { const s = Math.sin(b * Math.PI); dy += 0.3 * s; sy = 1 + 0.2 * s; sx = 1 - 0.16 * s; rotZ -= 0.14 * s; sproutT -= 0.9 * s; }
          break;
        }
        case "walk": {
          if (p < 0.06 && !walk.manual) pickWalkTarget();   // 外部 walkTo 指定的目标不被随机点覆盖
          const dir = Math.sign(walk.target - walk.x) || 1;
          walk.facing = dir;
          walk.x += dir * 0.0125 * 16.667 * dt;
          if ((dir > 0 && walk.x >= walk.target) || (dir < 0 && walk.x <= walk.target)) walk.x = walk.target;
          const cyc = (now / 118) % 1;
          const a1 = Math.sin(cyc * TAU), a2 = Math.sin(cyc * TAU + Math.PI);
          footLT += a1 * 0.34; footRT += a2 * 0.34;
          dy += Math.abs(Math.sin(cyc * TAU)) * -0.07;
          rotZ += Math.sin(cyc * TAU) * 0.05;
          armLT += a2 * 0.7; armRT += a1 * 0.7;
          sproutT += Math.sin(cyc * TAU + 0.6) * 0.3;
          break;
        }
        /* ★ 开心地跳一下（green:saved / 摸一摸 的因果反应）——
           完整的 蓄力 → 蹬地 → 滞空 → 落地缓冲 四段，高度曲线在分段处连续，
           不是缩放一下：脚会收起来、手会甩过头顶、嫩芽会滞后、影子跟着变小变淡。 */
        case "cheer": {
          const K1 = 0.14, K2 = 0.86;        // 蓄力结束 / 落地开始
          if (p < K1) {
            const e = (p / K1) * (p / K1);   // 加速下蹲
            dy -= 0.14 * e;
            sy = 1 - 0.20 * e; sx = 1 + 0.17 * e;
            armLT += 0.55 * e; armRT -= 0.55 * e;   // 双手向后收
            sproutT += 0.50 * e;                    // 嫩芽向前甩
            rotZ += 0.04 * e;
          } else if (p < K2) {
            const u = (p - K1) / (K2 - K1);
            const h = Math.sin(u * Math.PI);        // 抛物线：起跳-滞空-落地
            const v = Math.cos(u * Math.PI);        // 归一化垂直速度（决定拉伸/压缩）
            dy += 0.59 * h - 0.14 * (1 - u);        // 起跳端接住下蹲的 -0.14，峰值 ≈ 0.52
            sy = 1 + 0.17 * v - 0.06 * (1 - h);
            sx = 1 - 0.12 * v + 0.05 * (1 - h);
            armLT -= 1.55 * h; armRT += 1.55 * h;   // 双手举过头顶
            footLT -= 0.72 * h; footRT -= 0.72 * h; // 收脚 —— 看得出是"离地"不是"拉长"
            sproutT -= 1.00 * h;
            rotZ += Math.sin(u * Math.PI * 2) * 0.03;
          } else {
            const q = (p - K2) / (1 - K2);
            const e = Math.sin(clamp(q, 0, 1) * Math.PI);            // 落地压一下
            const e2 = Math.sin(clamp(q, 0, 1) * Math.PI * 2) * 0.35; // 余弹
            dy -= 0.12 * e;
            sy = 1 - 0.19 * e + 0.05 * e2;
            sx = 1 + 0.15 * e - 0.05 * e2;
            armLT += 0.35 * e; armRT -= 0.35 * e;
            sproutT += 0.55 * e;
          }
          break;
        }
        /* ★ 打哈欠（很久没记录时的慵懒动作）：张嘴、眯眼、后仰、伸懒腰 */
        case "yawn": {
          if (p < 0.28) yawnAmt = easeOut(p / 0.28);
          else if (p < 0.62) yawnAmt = 1 + Math.sin((p - 0.28) * 40) * 0.06;   // 张到最大后轻轻发抖
          else yawnAmt = 1 - easeIO((p - 0.62) / 0.38);
          yawnAmt = clamp(yawnAmt, 0, 1);
          squint = 1 - 0.42 * yawnAmt;            // 眼睛眯成一条（只压 lid，不动眨眼逻辑）
          sy = 1 + 0.055 * yawnAmt; dy += 0.035 * yawnAmt;   // 深吸一口气、整个人拔高
          leanX -= 0.075 * yawnAmt;               // 头微微后仰
          armLT -= 0.40 * yawnAmt; armRT += 0.40 * yawnAmt;  // 伸个懒腰
          rotZ += Math.sin(t * 5.5) * 0.012 * yawnAmt;
          sproutT -= 0.28 * yawnAmt;
          break;
        }
      }
      if (behT >= behDur) endBeh();
    }
    if (beh !== "walk" && !walk.hold) walk.x = lerp(walk.x, 0, 0.02 * dt);   // ★ 0.004→0.02：回中太慢会一直贴着边缘

    /* ---- 踩键盘（跳舞机式）----
       原来只驱动脚的 rotation.x —— 旋转一个压扁的球，几乎看不出来，用户说"只是转身"。
       现在改成：脚真的往下位移 + 压扁 + 重心压过去 + 倾斜加倍。 */
    if (stepL > 0.004 || stepR > 0.004) {
      const dec = Math.pow(0.935, dt);       // 放慢回位，看清一次完整的"踩下去—抬起来"
      stepL *= dec; stepR *= dec;
      footLT -= stepL * 0.42;                // 脚再补一点旋转
      footRT -= stepR * 0.42;
      dy -= (stepL + stepR) * 0.16;          // 重心压得更低
      stepTilt = (stepR - stepL) * 0.62;     // 倾斜 24° → 35°
    } else { stepL = 0; stepR = 0; stepTilt *= Math.pow(0.935, dt); }
    // 脚：往下位移 + 压扁。这两条才是"踩"的关键 —— 旋转看不出来，位移看得出来。
    // ★ 伸脚：越靠下的排，脚伸得越长（row 0..1 → 伸长 0.16..0.46）
    // 拉伸量收敛：原来 0.30 + 0.55 让脚变成一根触手，实际"脚"要短粗才像腿
    const reachL = stepL * (0.20 + tgtL.row * 0.30);
    const reachR = stepR * (0.20 + tgtR.row * 0.30);
    // 横向移到那个键所在的列（0.34 是脚能横向移动的幅度）
    footL.position.x = -0.42 + tgtL.nx * 0.44;
    footR.position.x = 0.42 + tgtR.nx * 0.44;
    // 往下伸 + 纵向拉长 + 横向收窄 —— "变长变形"，像真的伸腿去踩
    footL.position.y = -0.86 - reachL;
    footR.position.y = -0.86 - reachR;
    // 纵向拉长，但横向只收一点点 —— 收太多就成"触手"了，要短粗
    footL.scale.set(1 - reachL * 0.16, 1 + reachL * 1.5, 1 - reachL * 0.16);
    footR.scale.set(1 - reachR * 0.16, 1 + reachR * 1.5, 1 - reachR * 0.16);
    stepShift = (stepR - stepL) * 0.16;      // 整个人往踩的那一侧挪

    /* ---- 写回 ---- */
    root.position.set(walk.x + stepShift, dy, 0);
    root.rotation.z = stepTilt;
    root.scale.set(sx, sy, sx);
    root.rotation.y = rot + (walk.facing < 0 ? Math.PI : 0) * 0;
    body.rotation.z = rotZ + focusLean;   // 视线的方向带一点身体侧倾
    body.rotation.y = rot * 0.0;
    body.rotation.x = leanX;              // 只在打哈欠时非 0（后仰），其余时刻恒为 0

    S.armL.t = armLT; S.armR.t = armRT;
    armL.rotation.z = stepS(S.armL) * 0.6;
    armR.rotation.z = stepS(S.armR) * 0.6;
    armL.rotation.x = -stepS(S.armL) * 0.35;
    armR.rotation.x = -stepS(S.armR) * 0.35;

    S.footL.t = footLT; S.footR.t = footRT;
    footL.rotation.x = stepS(S.footL);
    footR.rotation.x = stepS(S.footR);

    S.sprout.t = sproutT;
    sprout.rotation.z = stepS(S.sprout);
    sprout.rotation.x = Math.sin(t * 1.3 + 0.6) * 0.07;

    /* 眼睛：眨眼 + 跟随 */
    const gx = gaze.x * 0.13, gy = gaze.y * 0.115;
    // blinkAmt 就是原来的眨眼量；squint 只在打哈欠时把它压低一点。
    // 不哈欠时 squint===1，取 min 后 lid === blinkAmt —— 眨眼行为逐帧与原来一致。
    const lid = blinkAmt < squint ? blinkAmt : squint;
    lidNow = lid;
    [eyeL, eyeR].forEach((e) => {
      e.disc.scale.y = EYE.h * (lid < 1 ? lid : 1);
      e.h1.scale.y = 0.080 * (lid < 1 ? lid : 1);
      e.h2.scale.y = 0.048 * (lid < 1 ? lid : 1);
      e.holder.position.set(e.baseX + gx, e.baseY + gy, e.baseZ);
      e.disc.visible = true;                       // 永不整块隐藏：闭眼靠压扁，靠 visible 开关太脆弱
      e.h1.visible = lid > 0.5;
      e.h2.visible = lid > 0.5;
    });

    /* 嘴：普通微笑 / 张嘴 / 睡觉的小圆嘴 / 打哈欠的大张嘴 */
    const open = beh === "sneeze" || beh === "cheer" || yawnAmt > 0.02 || (forcedHappy && !sleepy);
    smile.visible = !open && !sleepy;
    mouthO.visible = open || sleepy;
    mouthO.scale.set(0.055 * (1 + 0.35 * yawnAmt), 0.075 * (1 + 1.45 * yawnAmt), 0.03);
    mouthO.position.y = -0.04 - 0.035 * yawnAmt;   // yawnAmt=0 → 与建模型时的值逐位一致

    /* 电子轨道 */
    orbit.position.y = dy * 0.6;
    orbit.rotation.z = 0.22 + t * 0.22;
    const ea = t * 1.6;
    electron.position.set(Math.cos(ea) * 1.38, Math.sin(ea) * 1.38, 0);

    /* 影子：跳起变小变淡 */
    const lift = clamp(dy, 0, 1);
    shadowPlane.position.x = walk.x;
    const ss = 1 - lift * 0.42;
    shadowPlane.scale.set(ss, ss, 1);
    shadowPlane.material.opacity = 1 - lift * 0.45;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  /* 后台标签页 rAF 会被节流 → 定时器兜底 */
  setInterval(() => { if (performance.now() - beat > 300) { beat = performance.now(); frame(beat); } }, 40);
  const _f = frame;
  frame = function (n) { beat = performance.now(); _f(n); };

  /* ---------- 因果反应：保存成功 → 开心地跳一下 ----------
     states.js 已经在 document 上监听 green:saved 并调用 Pet.cheer()，所以这里不重复订阅业务事件，
     只补一个 window 上的兜底（有些调用方把事件派发在 window 上，document 收不到）。
     120ms 去重：两个来源同时命中时也只跳一下，不会连跳两次。 */
  let lastCheer = -1e9, happyTimer = 0;
  function cheerJump() {
    const now = performance.now();
    if (now - lastCheer < 120) return false;
    lastCheer = now;
    forcedHappy = true;
    clearTimeout(happyTimer);
    happyTimer = setTimeout(() => { forcedHappy = false; }, DUR.cheer);
    play("cheer");          // 真正的 起跳-滞空-落地，不是缩放一下
    return true;
  }
  addEventListener("green:saved", cheerJump);

  /* ---------- 对外接口（与 2D 版一致） ---------- */
  window.Pet = {
    play,
    expr: (n) => { forcedSleepy = n === "sleepy" || n === "closed"; forcedHappy = n === "happy"; },
    mouth: () => {},
    blush: () => {},
    cheer: cheerJump,
    pet: cheerJump,
    say(t) { if (window.PetFX && window.PetFX.say) window.PetFX.say(t); },
    three: { scene, camera, renderer, root },
  };

  /* ---------- 对外：3D 专属控制 ---------- */
  window.Pet3D = {
    ready: true,
    walkTo, stop, cheer: cheerJump,
    setIdleDays: setLazy,
    // 踩一下：side = "L" | "R"，对应键盘左半 / 右半
    // side: "L" | "R"；nx 是键在键盘上的横向位置(-1..1)，row 是第几排(0..1)
    // 探针：把脚的实时位置/形变报出去。看不到桌面时，这是唯一能定位"脚到底动没动"的办法
    debugFoot: function () {
      return {
        stepL: +stepL.toFixed(3), stepR: +stepR.toFixed(3),
        tgtL: [tgtL.nx, tgtL.row], tgtR: [tgtR.nx, tgtR.row],
        L: [+footL.position.x.toFixed(2), +footL.position.y.toFixed(2), +footL.scale.y.toFixed(2)],
        R: [+footR.position.x.toFixed(2), +footR.position.y.toFixed(2), +footR.scale.y.toFixed(2)],
        baseY: -0.86,
      };
    },
    step: function (side, nx, row) {
      if (side === "L") { stepL = 1; tgtL.nx = nx || 0; tgtL.row = row || 0; }
      else { stepR = 1; tgtR.nx = nx || 0; tgtR.row = row || 0; }
    },
    getIdleDays: () => idleDays,
    state: () => ({ beh: beh, x: +walk.x.toFixed(3), target: +walk.target.toFixed(3),
      idleDays: idleDays, lazy: +lazy.toFixed(2) }),
  };
  // 轻量探针（保留：排查渲染问题极其有用，但不再持有大对象）
  window.Pet3DDebug = () => ({
    frame: frameNo, beh: beh, sleepy: (function(){ try { return /sleepy/.test(host.className); } catch(e){ return false; } })(),
    L_ndc: (function(){ var v=new THREE.Vector3(); eyeL.disc.getWorldPosition(v); v.project(camera); return [+v.x.toFixed(2), +v.y.toFixed(2)]; })(),
    R_ndc: (function(){ var v=new THREE.Vector3(); eyeR.disc.getWorldPosition(v); v.project(camera); return [+v.x.toFixed(2), +v.y.toFixed(2)]; })(),
    camZ: camera.position.z, rootRotY: +root.rotation.y.toFixed(3),
    y: +root.position.y.toFixed(4), sx: +root.scale.x.toFixed(3), sy: +root.scale.y.toFixed(3),
    walkX: +walk.x.toFixed(3), walkTarget: +walk.target.toFixed(3), lazy: +lazy.toFixed(2),
    p: behDur ? +(behT / behDur).toFixed(3) : 0, ms: Math.round(behT), dur: Math.round(behDur), lid: +lidNow.toFixed(2),
  });

  /* 真 3D 起来了就把 2D 的 SVG 收起来（留着做兜底） */
  const svg = document.getElementById("pet-svg");
  if (svg) svg.style.display = "none";
  host.classList.add("is3d");
  console.log("[Green] 3D 模型已就绪 · three.js r" + THREE.REVISION);
})();