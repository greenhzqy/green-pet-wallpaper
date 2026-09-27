/* ============================================================
   Green · 桌面壁纸  wallpaper.js
   舞台结构：方大同的照片是宠物身后的背景屏，宠物在台前，文字在右下。
   左侧完全留空给桌面图标。照片与文案都由用户自己放进 assets/。
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const API = (location.port === "8765") ? "" : "http://127.0.0.1:8765";
  const CYCLE_MS = 45000;

  /* ---------------- 今日之环 ---------------- */
  const R = 92, C = 100, SW = 2.4;
  const svg = $("day-ring");
  let segs = null;
  if (svg) {
    segs = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(segs);
    const base = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    base.setAttribute("cx", C); base.setAttribute("cy", C); base.setAttribute("r", R);
    base.setAttribute("fill", "none"); base.setAttribute("stroke", "currentColor");
    base.setAttribute("stroke-opacity", ".06"); base.setAttribute("stroke-width", SW);
    svg.insertBefore(base, segs);
  }
  const polar = (deg, r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [C + Math.cos(a) * r, C + Math.sin(a) * r];
  };
  function arc(a0, a1, r) {
    const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
    return "M " + x0.toFixed(1) + " " + y0.toFixed(1) + " A " + r + " " + r + " 0 0 1 " + x1.toFixed(1) + " " + y1.toFixed(1);
  }
  function drawRing(hours) {
    if (!segs) return;
    const max = Math.max(60, ...hours);
    segs.textContent = "";
    hours.forEach((sec, h) => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", arc(h * 15 + 0.6, (h + 1) * 15 - 0.6, R));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-width", SW);
      const k = Math.min(1, sec / max);
      p.setAttribute("stroke-opacity", sec > 0 ? (0.12 + k * 0.68).toFixed(3) : "0.03");
      if (h < 6 || h === 23) p.style.color = "#ffb27a";
      segs.appendChild(p);
    });
    const now = new Date();
    const [hx, hy] = polar((now.getHours() + now.getMinutes() / 60) * 15, R);
    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("cx", hx); halo.setAttribute("cy", hy); halo.setAttribute("r", 4.5);
    halo.setAttribute("fill", "currentColor"); halo.setAttribute("fill-opacity", ".15");
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", hx); dot.setAttribute("cy", hy);
    dot.setAttribute("r", 1.8); dot.setAttribute("fill", "currentColor");
    segs.appendChild(halo); segs.appendChild(dot);
  }

  /* ---------------- 右下文字 ---------------- */
  const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const LABEL = { coding: "写代码", terminal: "敲命令", browsing: "查资料", chat: "聊天", game: "打游戏", video: "看视频", writing: "写字", other: "在用电脑" };
  function paintMeta(sense) {
    const dt = new Date();
    const de = $("wp-date");
    if (de) de.textContent = (dt.getMonth() + 1) + " 月 " + dt.getDate() + " 日 · " + WEEK[dt.getDay()];
    const el = $("wp-line");
    if (!el) return;
    const mins = Math.round(((sense && sense.activeSecToday) || 0) / 60);
    const hh = Math.floor(mins / 60), mm = mins % 60;
    if (mins < 5) { el.textContent = wxText ? "今天还没怎么用电脑 · " + wxText : "今天还没怎么用电脑"; return; }
    const parts = ["今天陪了你 " + (hh ? hh + " 小时 " : "") + (mm ? mm + " 分" : "")];
    if (sense && sense.usingPc && LABEL[sense.activity]) parts.push("现在在" + LABEL[sense.activity]);
    if (wxText) parts.push(wxText);      // 天气并进同一行，不再单独占一行（会撞到底部对话框）
    el.textContent = parts.join(" · ");
  }

  /* ---------------- 舞台轮换：4 位音乐人 ----------------
     照片由用户按音乐人分文件夹放：assets/<id>/1.jpg 2.jpg …
     清单在 assets/artists.json。我不经手任何有版权的图片。 */
  // file:// 页面发起的 fetch 可能既不成功也不失败地挂住 —— 必须带超时
  function fetchT(url, ms) {
    return new Promise((res) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res(null); } }, ms || 2500);
      fetch(url, { cache: "no-store" })
        .then((r) => { if (!done) { done = true; clearTimeout(t); res(r); } })
        .catch(() => { if (!done) { done = true; clearTimeout(t); res(null); } });
    });
  }
  function loadOne(src) {
    return new Promise((res) => {
      const t = new Image();
      t.onload = () => res(true);
      t.onerror = () => res(false);
      t.src = src;
    });
  }
  // 逐张往下探，遇到第一张缺失就停。
  // 原来穷举 9 张 x 4 种扩展名 x 4 位 = 144 次请求，本地要跑十几秒才出图；
  // 改成"找到就停"后，6 张照片只需 10 次左右。
  async function findPhotos(id) {
    const out = [];
    for (let n = 1; n <= 12; n++) {
      let hit = null;
      for (const x of EXTS) {
        const src = "assets/" + id + "/" + n + "." + x;
        if (await loadOne(src)) { hit = src; break; }
      }
      if (!hit) break;
      out.push(hit);
    }
    return out;
  }
  // 竖图铺满方形屏会被裁 —— 按宽高比定裁切锚点，越细长越往上收，保住脸
  function cropOf(el) {
    const w = el.naturalWidth, hh = el.naturalHeight;
    if (!w || !hh) return "26%";
    const r = w / hh;
    if (r >= 0.92) return "42%";
    if (r >= 0.78) return "30%";
    if (r >= 0.62) return "24%";
    if (r >= 0.48) return "17%";
    return "11%";
  }
  const EXTS = ["jpg", "png", "jpeg", "webp"];

  let play = [];          // 展平的播放列表：{ a: 音乐人, src: 图片, k: 该音乐人的第几张 }
  let idx = -1;
  const stage = { a: null, b: null, onA: true, cap: null, list: null, en: null };

  function paintSetlist(artistId) {
    if (!stage.list) return;
    Array.prototype.forEach.call(stage.list.children, (li) => {
      const wasOn = li.classList.contains("on");
      const isOn = li.dataset.id === artistId;
      li.classList.toggle("on", isOn);
      // 换到哪一位，就把那一位"翻"出来 —— 不做淡入淡出，做停格硬切
      if (isOn && !wasOn) {
        li.classList.remove("flip");
        void li.offsetWidth;          // 强制重排，动画才能重放
        li.classList.add("flip");
      }
    });
    const cur = play[idx];
    if (stage.en && cur) stage.en.textContent = cur.a.en || "";
  }

  function show(i) {
    const cur = play[i];
    if (!cur || !stage.a || !stage.b) return;
    const nxt = stage.onA ? stage.a : stage.b;
    const prv = stage.onA ? stage.b : stage.a;
    nxt.addEventListener("load", () => nxt.style.setProperty("--crop", cropOf(nxt)), { once: true });
    nxt.src = cur.src;
    // 内联 opacity：不依赖 class + CSS 过渡是否推进（被节流时过渡会卡在 0）
    nxt.style.opacity = "1";
    prv.style.opacity = "0";
    stage.onA = !stage.onA;
    paintSetlist(cur.a.id);
    // 题词：该音乐人的第 k 句
    if (stage.cap && cur.a.lines && cur.a.lines.length) {
      stage.cap.style.opacity = "0";
      setTimeout(() => {
        stage.cap.textContent = cur.a.lines[cur.k % cur.a.lines.length].slice(0, 48);
        stage.cap.style.opacity = "";
      }, 650);
    }
  }

  function advance() {
    if (play.length < 2) return;
    idx = (idx + 1) % play.length;
    show(idx);
  }

  async function boot() {
    stage.a = $("sc-a"); stage.b = $("sc-b");
    stage.cap = $("wp-cap"); stage.list = $("sl-list"); stage.en = $("sl-en");
    if (stage.b) stage.b.style.opacity = "0";

    let artists = [];
    try {
      const r = await fetchT(API + "/assets/artists.json?t=" + Date.now(), 2500);
      if (!r || !r.ok) throw new Error("no json");
      artists = await r.json();
    } catch (err) {
      // Chrome 禁止 file:// 页面发起 fetch（与目标有没有 CORS 无关），
      // 所以本地直接打开时一定走这里 —— 4 位必须都写全，
      // 否则曲目牌只会显示第一位。照片探测走相对路径，本地照样能出。
      artists = [
        { id: "khalil",   name: "方大同", en: "Khalil Fong" },
        { id: "davidtao", name: "陶喆",   en: "David Tao" },
        { id: "cheer",    name: "陈绮贞", en: "Cheer Chen" },
        { id: "crowdlu",  name: "卢广仲", en: "Crowd Lu" },
      ];
    }
    if (!Array.isArray(artists) || !artists.length) return;

    // 左侧曲目牌：先按清单渲染出来，照片有没有都能显示
    if (stage.list) {
      stage.list.innerHTML = "";
      artists.forEach((a) => {
        const li = document.createElement("li");
        li.dataset.id = a.id;
        li.textContent = a.name;
        stage.list.appendChild(li);
      });
    }

    // ★ 先只扫照片、立刻出图。
    //   题词如果放在前面 await，file:// 下 fetch 挂住会把整条启动链卡死 —— 图永远不出来。
    for (const a of artists) {
      a.lines = [];
      const found = await findPhotos(a.id);
      found.forEach((src, k) => play.push({ a: a, src: src, k: k }));
    }

    if (play.length) { idx = 0; show(0); }

    // 题词丢后台，不挡出图
    artists.forEach((a) => {
      fetchT(API + "/assets/" + a.id + "/lyric.txt?t=" + Date.now(), 2500).then((r) => {
        if (!r || !r.ok) return;
        return r.text().then((t) => {
          a.lines = (t || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        });
      }).catch(() => {});
    });
    if (!play.length) {
      // 一张照片都没有：曲目牌照常显示，屏幕留暗底
      paintSetlist(artists[0].id);
      if (stage.cap) stage.cap.textContent = artists[0].en || "";
    }
    if (play.length > 1) setInterval(advance, CYCLE_MS);
  }

  /* ---------------- 开场标题卡 ----------------
     壁纸每次加载出现一次，4.2 秒后淡走。
     用 .off 做渐隐（过渡只在 .off 上，移除是瞬时的）。 */
  function wireIntro() {
    const el = $("intro");
    if (!el) return;
    setTimeout(() => el.classList.add("off"), 4200);
    // 之后从 DOM 摘掉，免得一直挂着一个全屏层
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 6200);
  }

  /* ---------------- 天气 ----------------
     接口返回的是 "Chongqing: 🌦️  +21°C" —— 英文城市名 + emoji + 多余空格。
     规范里这个项目不用 emoji，所以把符号翻成中文，城市名也换掉。 */
  const CITY_CN = { Chongqing: "重庆", Beijing: "北京", Shanghai: "上海", Chengdu: "成都" };
  const WX_CN = [
    ["☀", "晴"], ["⛅", "多云"], ["☁", "阴"], ["🌦", "小雨"], ["🌧", "雨"],
    ["⛈", "雷阵雨"], ["❄", "雪"], ["🌫", "雾"], ["🌤", "晴间多云"],
  ];
  function humanWeather(raw) {
    let s = String(raw || "");
    if (!s) return "";
    // 去掉代理对 emoji（☀️ 这类是 符号 + U+FE0F）
    s = s.replace(/[\u{1F300}-\u{1FAFF}]/gu, (m) => {
      for (const [sym, cn] of WX_CN) if (m.startsWith(sym)) return cn;
      return "";
    });
    s = s.replace(/[\u2600-\u26FF]\uFE0F?/g, (m) => {
      for (const [sym, cn] of WX_CN) if (m.startsWith(sym)) return cn;
      return "";
    });
    // ★ 收尾清理：🌦️ 这类是"符号 + 变体选择符 U+FE0F"，上面只换掉了符号本体，
    //   变体选择符会留下来 —— 肉眼看不见但确实在字符串里。必须单独剥掉。
    s = s.replace(/[\uFE00-\uFE0F]/g, "");
    s = s.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
    s = s.replace(/[\u2600-\u27BF]/g, "");
    s = s.replace(/\s+/g, " ").trim();
    // 城市名换中文
    for (const k in CITY_CN) s = s.replace(k, CITY_CN[k]);
    // "重庆: 小雨 +21°C" → "重庆 · 小雨 +21°C"
    s = s.replace(/\s*:\s*/, " · ");
    return s;
  }
  let wxText = "";
  async function loadWeather() {
    try {
      const r = await fetchT(API + "/weather?t=" + Date.now(), 3500);
      if (!r || !r.ok) return null;
      const w = await r.json();
      const txt = humanWeather(w && w.text);
      wxText = txt;          // 存起来，由 paintMeta 并进同一行
      paintMeta(senseNow);
      return txt;
    } catch (e) { return null; }
  }

  /* ---------------- 可见的积累 ----------------
     记录这件事最大的问题是"记了看不见结果"。
     这里把连续天数 + 最近 14 天 + 总条数，直接摆在桌面上。 */
  let allEntries = [];
  let todayCount = 0;
  const dayKey = (dt) => dt.getFullYear() + "-" + (dt.getMonth() + 1) + "-" + dt.getDate();

  function paintStreak() {
    const box = $("streak");
    if (!box) return;
    const days = new Set();
    let today = 0;
    const tk = dayKey(new Date());
    allEntries.forEach((e) => {
      const dt = new Date(e.t || e.time || 0);
      if (isNaN(dt)) return;
      const k = dayKey(dt);
      days.add(k);
      if (k === tk) today++;
    });
    todayCount = today + (todayCount > today ? todayCount - today : 0);   // 保留刚存进去的
    if (todayCount < today) todayCount = today;

    // 连续天数：从今天往回数（今天还没写不算断，给一天缓冲）
    let streak = 0;
    const cur = new Date();
    for (let i = 0; i < 400; i++) {
      const k = dayKey(cur);
      if (days.has(k)) streak++;
      else if (i > 0) break;
      cur.setDate(cur.getDate() - 1);
    }

    // 最近 14 天的小方块（右边是今天）
    let dots = "";
    const d2 = new Date();
    d2.setDate(d2.getDate() - 13);
    for (let i = 0; i < 14; i++) {
      const k = dayKey(d2);
      const isToday = k === tk;
      dots += '<i class="' + (isToday ? "today" : (days.has(k) ? "on" : "")) + '"></i>';
      d2.setDate(d2.getDate() + 1);
    }
    const total = allEntries.length;
    box.innerHTML = '<span class="st-dots">' + dots + '</span>' +
      '<span class="st-n">' + (streak > 1 ? '连续 <b>' + streak + '</b> 天 · ' : '') +
      '共 <b>' + total + '</b> 条</span>';
  }

  // ★ 记忆：宠物记得你上次写了什么。
  //   这是"伙伴"和"通知"的分界线 —— 通知只会说"你 N 天没写了"，
  //   伙伴会说"上次你写的是关于结题的，后来怎么样了"。
  let lastNote = null, lastNoteGap = -1;
  function memoryLine() {
    if (!lastNote) return null;
    const t = String(lastNote.text || lastNote.note || "").trim();
    if (!t) return null;
    const short = t.length > 26 ? t.slice(0, 26) + "…" : t;
    if (lastNoteGap <= 0) return "今天你写了「" + short + "」，我记着呢。";
    if (lastNoteGap === 1) return "昨天你写的是「" + short + "」。今天呢？";
    if (lastNoteGap <= 3) return "上次你写「" + short + "」，是 " + lastNoteGap + " 天前了。";
    return "好久没听你说话了。上次是「" + short + "」。";
  }
  function pickLastNote(entries) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      const txt = String(e.text || e.note || "").trim();
      if (!txt || e.type === "fitness") continue;
      const dt = new Date(e.t || e.time || 0);
      if (isNaN(dt)) continue;
      const gap = Math.floor((Date.now() - dt.getTime()) / 86400000);
      lastNote = e; lastNoteGap = gap;
      return;
    }
  }

  function paintSpirit(justSaved) {
    const el = $("spirit");
    if (!el) return;
    let text, cls;
    if (justSaved) { text = "精神很好"; cls = "good"; }
    else if (lastNoteGap <= 0) { text = "精神很好"; cls = "good"; }
    else if (lastNoteGap === 1) { text = "还行"; cls = "meh"; }
    else if (lastNoteGap <= 3) { text = "有点蔫"; cls = "low"; }
    else { text = "蔫了"; cls = "low"; }
    el.className = cls;
    el.innerHTML = "<i></i>" + text + (justSaved ? " · 谢谢" : "");
  }

  async function loadStreak() {
    try {
      const r = await fetchT(API + "/log?t=" + Date.now(), 3000);
      if (!r || !r.ok) return;
      const lg = await r.json();
      allEntries = (lg && lg.entries) || [];
      pickLastNote(allEntries);
      paintStreak();
      paintSpirit();
    } catch (e) {}
  }

  /* ---------------- 鼠标驱动光照 ----------------
     参考 motion-web 的 wheel-rail：不是定时播放动画，而是输入直接驱动场景。
     鼠标在左 → 光从左边来；在右 → 光从右边来。
     实现上只动 transform（合成层），不改 gradient 的中心点 ——
     改 gradient 会让大面积重新光栅化，那是性能灾难。 */
  const light = { tx: 0.5, ty: 0.5, x: 0.5, y: 0.5, on: false };
  addEventListener("pointermove", (e) => {
    light.on = true;
    light.tx = e.clientX / Math.max(1, innerWidth);
    light.ty = e.clientY / Math.max(1, innerHeight);
    startLight();          // ★ 循环收敛后已退出，这里把它唤醒（函数声明有提升，可以先用后定义）
    if (window.Perf && Perf.poke) Perf.poke();   // ★ 你在用 → 拉回原生刷新率
  }, { passive: true });
  window.__lt = 0; window.__lerr = "";
  function computeGeoOnBoot() { try { computeGeo(); } catch (e) {} }
  /* ★ 性能：这个循环原来永不停止 —— 鼠标不动也每帧写 3 次 style，
     每次都触发样式重算。现在加两道闸：
       ① 死区：变化小于阈值就不写 DOM
       ② 收敛即停：光稳定下来就退出 rAF，pointermove 时再唤醒
     这样空闲时它一帧都不跑。 */
  const DEAD = 0.0012;
  let lightRaf = 0, lightLastX = -9, lightLastY = -9;
  function tickLight() {
    light.x += (light.tx - light.x) * 0.06;
    light.y += (light.ty - light.y) * 0.06;
    const dx = (light.x - 0.5) * 2;
    const dy = (light.y - 0.5) * 2;
    const moved = Math.abs(light.x - lightLastX) > DEAD || Math.abs(light.y - lightLastY) > DEAD;
    if (moved) {
      window.__lt++;      // 只在真正写 DOM 时计数 —— 这才是有效的渲染帧
      lightLastX = light.x; lightLastY = light.y;
      const beams = $("beams");
      if (beams) beams.style.transform = "translate(" + (dx * 34).toFixed(1) + "px," + (dy * 10).toFixed(1) + "px) rotate(" + (dx * 1.6).toFixed(2) + "deg)";
      const glow = $("leftglow");
      if (glow) glow.style.transform = "translate(" + (dx * 18).toFixed(1) + "px,0)";
      const wash = $("floorwash");
      if (wash) wash.style.transform = "translateY(-6%) translateX(" + (dx * 10).toFixed(1) + "px)";
    }
    // 已经贴住目标且没在动 → 停掉循环，别再空转
    if (Math.abs(light.x - light.tx) < 0.0008 && Math.abs(light.y - light.ty) < 0.0008) {
      lightRaf = 0;
      return;
    }
    lightRaf = requestAnimationFrame(tickLight);
  }
  function startLight() {
    if (lightRaf) return;
    lightRaf = requestAnimationFrame(tickLight);
  }

  /* ---------------- 深夜模式 ----------------
     1:00 - 5:00 整场只剩一束追光。每 60 秒检查一次，跨过 5 点会自动退出。 */
  function applyLateMode() {
    const hh = new Date().getHours();
    const late = hh >= 1 && hh < 5;
    document.documentElement.dataset.late = late ? "1" : "0";
  }

  /* ---------------- 数据 ---------------- */
  let lastHours = null;
  async function pull() {
    try {
      const r = await fetch(API + "/sense?t=" + Date.now(), { cache: "no-store" });
      const j = await r.json();
      if (j && j.ok) {
        senseNow = j;
        if (j.hours) { lastHours = j.hours; drawRing(j.hours); }
        paintMeta(j);
      }
    } catch (e) { paintMeta(null); }
  }

  /* ---------------- Galgame 对话框 ----------------
     宠物用它说话，面板里的简讯/待办也从这里推。
     非强制仍然是设计目标：一次只说一句，说完就换，不累积成清单。
     点击规则按 galgame 手感：正在打字就先补完，打完了才"进去"。 */
  const PROMPTS = [
    "现在在想什么？记一句",
    "今天有什么值得留下的？",
    "刚才那件事，写两句",
    "这会儿的感觉，一句话就够",
  ];
  const LABEL2 = { coding: "写代码", terminal: "敲命令", browsing: "查资料", chat: "聊天", game: "打游戏", video: "看视频", writing: "写字", other: "在用电脑" };
  let senseNow = null;
  let dq = [];              // 台词队列
  let dqi = -1;
  let typing = false, typeT = 0, fullText = "", shown = 0;

  function petLine() {
    const hh = new Date().getHours();
    const mins = Math.round(((senseNow && senseNow.activeSecToday) || 0) / 60);
    const H = Math.floor(mins / 60), M = mins % 60;
    const spent = mins >= 5 ? "今天陪了你 " + (H ? H + " 小时 " : "") + (M ? M + " 分" : "") : "";
    const doing = senseNow && senseNow.usingPc ? (LABEL2[senseNow.activity] || "在用电脑") : "";
    if (mins < 5) return hh < 7 ? "这么早就起来了？" : "我在。";
    if (hh >= 1 && hh < 5) return "凌晨了，" + spent + "。睡吧。";
    if (hh >= 18 && hh < 23) return spent + "，该收一收了。";
    if (doing) return spent + "，现在在" + doing + "。";
    return spent + "。";
  }

  function renderDots() {
    const box = $("d-dots");
    if (!box) return;
    box.textContent = "";
    const n = Math.min(dq.length, 9);
    for (let i = 0; i < n; i++) {
      const it = document.createElement("i");
      if (i === dqi % n) it.className = "on";
      box.appendChild(it);
    }
  }

  // 打字机：逐字显示。这是 galgame 的灵魂，不能省。
  function typeOut(text, tag, who, cta) {
    const el = $("d-text");
    if (!el) return;
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v || ""; };
    set("d-tag", tag); set("d-who", who || "Green"); set("d-cta", cta || "");
    fullText = String(text || "");
    shown = 0; typing = true;
    el.textContent = "";
    const cur = document.createElement("span");
    cur.className = "cur";
    el.appendChild(cur);
    clearInterval(typeT);
    typeT = setInterval(() => {
      shown++;
      el.textContent = fullText.slice(0, shown);
      el.appendChild(cur);
      if (shown >= fullText.length) { clearInterval(typeT); typing = false; cur.remove(); }
    }, 26);
  }
  function finishTyping() {
    if (!typing) return false;
    clearInterval(typeT);
    typing = false;
    const el = $("d-text");
    if (el) el.textContent = fullText;
    return true;
  }

  function showDlg() { const b = $("dlg"); if (b) b.classList.remove("off"); }
  function hideDlg() { const b = $("dlg"); if (b) b.classList.add("off"); }

  function nextLine() {
    if (!dq.length) return;
    dqi = (dqi + 1) % dq.length;
    const it = dq[dqi];
    renderDots();
    showDlg();
    typeOut(it.text, it.tag, it.who, it.cta);
  }

  // 点击：★ 主行为改成"直接写一句"，而不是"打开面板"。
  //   原来点两下是去面板里找输入框 —— 那就是 6 步成本的来源。
  function wireDlg() {
    const box = $("dlg");
    if (!box) return;

    // ★ 壁纸收不到键盘（Lively 的限制 —— 鼠标能穿透，键盘不能）。
    //   所以点击不是"聚焦输入框"，而是开一个能拿到键盘的小窗口。
    //   一次点击，不切应用，打完回车它自己关掉。
    function armInput() {
      box.classList.add("wants");
      box.classList.remove("saved");
      openNote();
    }
    function disarm() {
      box.classList.remove("wants");
    }

    const fb = $("d-fallback");
    if (fb) {
      fb.addEventListener("click", (ev) => {
        ev.stopPropagation();
        typeOut("去面板里写…", "Green", "Green", "");
        openPanelForce("#mood");
      });
    }
    box.addEventListener("click", (ev) => {
      // 点到"打开面板"小字时才去面板；点别处都是要写字
      if (ev.target && ev.target.id === "d-cta") {
        const cur = dq[dqi];
        openPanel(cur && cur.focus);
        return;
      }
      if (finishTyping()) return;   // 第一下：补完打字机（galgame 手感）
      armInput();                    // 第二下：直接开始写
    });

    // 开「记一笔」小窗口：它有键盘焦点，写完自己关
    let noteAt = 0;
    function openNote() {
      const t = Date.now();
      if (t - noteAt < 1200) return;
      noteAt = t;
      try { fetch(API + "/note").catch(() => {}); } catch (e) {}
    }

    // 悬停宠物：立刻让它说一句当前状态
    const wrap = $("pet-wrap");
    if (wrap) {
      wrap.addEventListener("pointerenter", () => {
        if (window.Pet && Pet.play) Pet.play("look");
        showDlg();
        typeOut(petLine(), "Green 在说", "Green", "点这里打开面板 ›");
      });

      // ★ 点宠物 → 进主页面。
      //   笔记里记着最早的行为就是"双击宠物 → 面板打开"（悬浮球时代；
      //   "记录一次要 6 步"那个吐槽正是从这里数起的）。
      //   搬到 Lively 壁纸之后这个监听器丢了，pet-wrap 上只剩 hover ——
      //   于是"点宠物"变成什么都没发生。现在补回来。
      //   两个入口各司其职，别混：
      //     · 点宠物   → 主页面（看全部 / 翻记录 / 改设置）
      //     · 点对话框 → 记一笔（有键盘焦点的小窗，打完回车自己关）
      //   已验证宠物没有被任何元素盖住：elementFromPoint 在它身上 6 个采样点
      //   全部返回 CANVAS#pet3d，z-index:8 高于键盘的 6。
      wrap.addEventListener("click", (ev) => {
        ev.stopPropagation();          // 别冒泡出去被别处再处理一遍
        if (window.Pet && Pet.play) Pet.play("cheer");   // 点一下要看得见反应
        showDlg();
        openPanel("");                 // 服务端有 4 秒冷却 + Edge 复用窗口，连点不会开出一堆
      });
    }
  }

  let openAt = 0, lastFocus = "";
  // 强制打开（降级路径用）：绕过冷却，并带上要聚焦的选择器
  function openPanelForce(sel) {
    openAt = 0; lastFocus = "";
    fetch(API + "/panel?focus=" + encodeURIComponent(sel)).catch(() => {});
  }
  function openPanel(focus) {
    const t = Date.now();
    // 同一个面板刚开过就别重复拉 —— 但换了 focus 要允许（那是"去看另一条"）
    if (t - openAt < 4000 && focus === lastFocus) return;
    openAt = t; lastFocus = focus || "";
    typeOut(focus ? "正在打开那一条…" : "正在打开面板…", "Green", "Green", "");
    fetch(API + "/panel" + (focus ? "?focus=" + encodeURIComponent(focus) : "")).catch(() => {});
  }

  /* ---------------- 跟着你按键 ----------------
     轮询 /keys，把刚按下的键在小键盘上点亮，同时让宠物有反应。
     服务端只存"最后一个键"，所以这里靠 keyAt 的时间戳判断"是不是新的"。 */
  // 4 行紧凑配列（用户要求保持原样）
  const KB_ROWS = [[["`",192,1],["1",49,1],["2",50,1],["3",51,1],["4",52,1],["5",53,1],["6",54,1],["7",55,1],["8",56,1],["9",57,1],["0",48,1],["-",189,1],["=",187,1],["⌫",8,1.5]],[["⇥",9,1.5],["Q",81,1],["W",87,1],["E",69,1],["R",82,1],["T",84,1],["Y",89,1],["U",85,1],["I",73,1],["O",79,1],["P",80,1],["[",219,1],["]",221,1],["\\",220,1.2]],[["⇪",20,1.7],["A",65,1],["S",83,1],["D",68,1],["F",70,1],["G",71,1],["H",72,1],["J",74,1],["K",75,1],["L",76,1],[";",186,1],["'",222,1],["⏎",13,1.8]],[["⇧",16,2.2],["Z",90,1],["X",88,1],["C",67,1],["V",86,1],["B",66,1],["N",78,1],["M",77,1],[",",188,1],[".",190,1],["/",191,1],["⇧",16,2.2]]];
  const MODS = { 8:1, 9:1, 13:1, 16:1, 17:1, 18:1, 20:1, 27:1 };
  const kbKeys = {};      // vk -> [elements]
  let kbLit = {}, kbTimer = 0, kbWarmT = 0;
  // ★ 跳舞机式踩键：左半区 → 宠物左脚踩，右半区 → 右脚踩。
  //   宠物站在键盘上，所以驱动力来自 pet3d 里已有的脚 pivot + 整体重心。
  //   注意：不改 3D 模型本身，只驱动姿态 —— 用户明确要求"不要改变宠物的 3D 形象"。
  /* ★ 性能：原来每按一个键都要 getBoundingClientRect() 两次 —— 那是强制同步布局，
     一次键盘输入 2~5 个键就是 4~10 次重排，全卡在按键这一帧上。
     现在改成"建键盘时算一次、之后纯查表"：热路径里一次 layout 都没有。
     窗口尺寸变了或 Lively 改了 --pet（键盘跟着缩放）时置脏重算。 */
  let geoReady = false;
  function computeGeo() {
    const kbd = $("kbd");
    if (!kbd) return;
    const kr = kbd.getBoundingClientRect();
    if (!kr.width) return;                       // 还没排版，下次再说
    const rows = kbd.querySelectorAll(".kb-row");
    const cx = kr.left + kr.width / 2, half = kr.width / 2;
    const last = Math.max(1, rows.length - 1);
    for (let ri = 0; ri < rows.length; ri++) {
      const row = Math.max(0, Math.min(1, ri / last));
      const kids = rows[ri].children;
      for (let i = 0; i < kids.length; i++) {
        const g = kids[i].__geo;
        if (!g) continue;
        const er = kids[i].getBoundingClientRect();
        g.nx = (er.left + er.width / 2 - cx) / half;
        g.row = row;
      }
    }
    geoReady = true;
  }
  addEventListener("resize", () => { geoReady = false; }, { passive: true });

  function stepOn(vk) {
    window.__kd.step++;
    try {
    const el = (kbKeys[vk] || [])[0];
    if (!el) { window.__kd.bailEl++; return; }
    if (!geoReady) computeGeo();
    const g = el.__geo;
    if (!g || !geoReady) { window.__kd.bailW++; return; }
    const side = g.nx < 0 ? "L" : "R";
    if (window.Pet3D && Pet3D.step) { Pet3D.step(side, g.nx, g.row); stepCalls++; }
    } catch (e) { window.__kd.lastErr = String(e && e.message || e).slice(0, 90); }
  }

  function buildKbd() {
    const host = $("kbd");
    if (!host) return;
    KB_ROWS.forEach((row, ri) => {
      const box = host.querySelector('.kb-row[data-row="' + (ri + 1) + '"]');
      if (!box) return;
      row.forEach(([label, vk, w]) => {
        const k = document.createElement("div");
        if (!vk) {
          // TKL 的分区间隔：宽度照占，但不画键帽
          k.className = "kb-gap";
          k.style.flexGrow = String(w || 0.25);
          box.appendChild(k);
          return;
        }
        // 单字符（字母/数字/符号）= 普通键帽；多字符（Esc/Tab/Shift/F1…）= 强调键，暖琥珀色
        const isMod = String(label).length > 1;
        k.className = "kb-key" + (isMod ? " mod" : "");
        k.style.flexGrow = String(w || 1);
        k.textContent = label;
        box.appendChild(k);
        k.__geo = { nx: 0, row: 0 };
        (kbKeys[vk] = kbKeys[vk] || []).push(k);
      });
    });
  }

  // 虚拟键码 → 显示名。字母数字直接显示，命名键给中文，修饰键参与组合。
  const VK_NAME = {
    8:"Backspace",9:"Tab",13:"Enter",16:"Shift",17:"Ctrl",18:"Alt",20:"CapsLock",27:"Esc",32:"Space",
    33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"←",38:"↑",39:"→",40:"↓",
    45:"Insert",46:"Delete",
    186:";",187:"=",188:",",189:"-",190:".",191:"/",192:"`",219:"[",220:"\\",221:"]",222:"'",
  };
  // 只保留"英文名之外还需要中文"的键 —— 原来给 Tab/Esc 也加了（Tab）(Esc)，纯属冗余
  const VK_CN = { 32:"空格", 13:"回车", 8:"退格", 20:"大写锁定", 37:"左", 38:"上", 39:"右", 40:"下" };
  function vkLabel(vk) {
    if (vk >= 65 && vk <= 90) return String.fromCharCode(vk);
    if (vk >= 48 && vk <= 57) return String.fromCharCode(vk);
    if (vk >= 96 && vk <= 105) return "小键盘" + (vk - 96);
    return VK_NAME[vk] || ("VK" + vk);
  }
  // 组合键：按住的修饰键 + 主键，例如 Ctrl + Shift + S
  function comboLabel(vks) {
    const held = vks.filter((v) => v === 16 || v === 17 || v === 18);
    const main = vks.filter((v) => v !== 16 && v !== 17 && v !== 18);
    const mods = [];
    if (held.indexOf(17) > -1) mods.push("Ctrl");
    if (held.indexOf(16) > -1) mods.push("Shift");
    if (held.indexOf(18) > -1) mods.push("Alt");
    if (!main.length) return mods.length ? mods.join(" + ") : "";
    const m = main[main.length - 1];
    const name = vkLabel(m);
    // 有中文名才加括号，且不重复（原来 Space 的英文名里已经带了"空格"，会变成（空格）（空格））
    const cn = VK_CN[m] ? "（" + VK_CN[m] + "）" : "";
    const composed = (mods.length ? mods.join(" + ") + " + " : "") + name + cn;
    // ★ 键帽上已经有的键就不用弹气泡了；键盘上没有的键（方向键、F 键…）必须弹，
    //   否则"按了完全没反应"。这是从白凝冰桌宠那条"其他物理键在气泡中显示"学来的。
    return { text: composed, onCaps: !!kbKeys[m] && mods.length === 0 };
  }
  let bubTimer = 0;
  function showBubble(info) {
    const b = $("kbd-bub");
    if (!b || !info || !info.text) return;
    if (info.onCaps) { b.classList.remove("on"); return; }   // 键帽上已经亮了，不重复弹
    b.innerHTML = "<b>" + String(info.text).replace(/[<>&]/g, "") + "</b>";
    b.classList.add("on");
    clearTimeout(bubTimer);
    bubTimer = setTimeout(() => b.classList.remove("on"), 1500);
  }

  function lightKeys(vks) {
    window.__kd.light++;
    const host = $("kbd");
    if (!host || !vks || !vks.length) return;
    host.classList.add("warm");
    clearTimeout(kbWarmT);
    kbWarmT = setTimeout(() => host.classList.remove("warm"), 2600);
    vks.forEach((vk) => {
      const els = kbKeys[vk];
      if (!els) return;
      els.forEach((e) => e.classList.add("on"));
      kbLit[vk] = 1;
      stepOn(vk);
    });
    clearTimeout(kbTimer);
    kbTimer = setTimeout(() => {
      Object.keys(kbLit).forEach((vk) => (kbKeys[vk] || []).forEach((e) => e.classList.remove("on")));
      kbLit = {};
    }, 150);
  }

  let lastKeyAt = 0, lastKeyN = 0;
  window.__kd = { polls: 0, newAt: 0, noVks: 0, light: 0, step: 0, bailEl: 0, bailKbd: 0, bailW: 0, lastVk: 0, lastErr: "" };
  /* ★ 长轮询（不是定时轮询）。
     带 since=<已知计数> 上去，服务端没有新按键就把连接挂着不返回；
     _keywatch 一 POST 上来服务端立刻回包。
     效果：按下一个键到宠物抬脚，从最坏 ~530ms 降到 ~25ms；
     而且你不动键盘的时候，这条链路一个请求都不发 —— 比原来 420ms 空转还省电。 */
  let keyLoopT = 0, keyWatchFail = 0;
  async function pollKeys() {
    window.__keyPolls = (window.__keyPolls || 0) + 1;
    window.__kd.polls++;
    try {
      // ★ 诊断搭便车：把脚的实时状态挂在 /keys 的查询串上。
      //   按键会高亮 === 这一行一定在执行，所以这条路是可靠的观测通道。
      let fq = "";
      try {
        // ★ 把实测帧率一起搭上去。这台机器上跑不到 165fps 的话，
        //   这里能看到真实数字，而不是靠猜。
        const dg = (window.Pet3D && Pet3D.debugFoot) ? Pet3D.debugFoot() : {};
        // ★ 真实视口 / 宠物几何 —— 别再从本地渲染去推断线上长什么样
        dg.vp = { w: innerWidth, h: innerHeight, dpr: +(devicePixelRatio || 1).toFixed(2) };
        try {
          const pw = document.getElementById("pet-wrap");
          if (pw) {
            const r = pw.getBoundingClientRect();
            dg.pet = { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right),
                       w: Math.round(r.width), h: Math.round(r.height) };
            const pcs = getComputedStyle(pw);
            dg.petVar = (pcs.getPropertyValue("--pet") || "").trim();
            dg.petLeft = pcs.left; dg.petTf = pcs.transform;
          }
          dg.rootVar = (getComputedStyle(document.documentElement).getPropertyValue("--pet") || "").trim();
          dg.propsVia = window.__propsVia; dg.propsErr = window.__propsErr; dg.propsHttp = window.__propsHttp; dg.propsKeys = window.__propsKeys; dg.propsPet = window.__propsPet;
          dg.lvl = document.documentElement.dataset.lvl;
          const dm = document.getElementById("dim");
          dg.dim = dm ? getComputedStyle(dm).opacity : "无";
          const kb = document.getElementById("kbd");
          if (kb) { const kr = kb.getBoundingClientRect(); dg.kbd = { t: Math.round(kr.top), b: Math.round(kr.bottom), l: Math.round(kr.left), w: Math.round(kr.width) }; }
          dg.three = !!window.THREE; dg.p3d = !!window.Pet3D;
          const cv = document.querySelector("#pet-wrap canvas");
          dg.cv = cv ? (cv.width + "x" + cv.height) : "无 canvas";
        } catch (e) { dg.geoErr = String(e.message || e).slice(0, 80); }
        if (window.Perf) dg.perf = { fps: Perf.fps, div: Perf.div, lvl: Perf.level, vs: +(Perf.vsync || 0).toFixed(2), gapN: Perf.gapN, estN: Perf.estN, rafN: Perf.rafN, fpsMax: Perf.fpsMax || 0, estAgo: Perf.estAt ? Math.round((Date.now() - Perf.estAt) / 1000) : -1, bat: Perf.onBattery, hid: document.hidden, vis: document.visibilityState, act: Perf.active, to: Perf.tickOpen || 0 };
        fq = "&f=" + encodeURIComponent(JSON.stringify(dg));
      } catch (e) { fq = "&f=E:" + encodeURIComponent(String(e && e.message || e).slice(0, 90)); }
      const r = await fetchT(API + "/keys?since=" + lastKeyN + "&t=" + Date.now() + fq, 30000);
      if (r && r.ok) {
        keyWatchFail = 0;
        const j = await r.json();
        const at = j && j.at ? j.at : 0;
        const n = j && typeof j.n === "number" ? j.n : lastKeyN;
        if (at > lastKeyAt) { lastKeyAt = at; window.__kd.newAt++; }
        lastKeyN = n;                       // 记下计数，下一次长轮询用新的 since
        if (j && j.vks && j.vks.length) {
          if (window.Perf && Perf.poke) Perf.poke();   // ★ 你在打字 → 也算在用
          window.__kd.lastVk = j.vks[j.vks.length - 1];
          lightKeys(j.vks);
          showBubble(comboLabel(j.vks));
          // 宠物给一点反应：不打断它正在做的事，只是"抬一下头"
          try { if (window.Pet && Pet.play) Pet.play("look"); } catch (e) {}
        }
      } else { keyWatchFail++; }
    } catch (e) { keyWatchFail++; }
    // 长轮询自己续命。断线时退避到 1.2s，别把 CPU 打满。
    clearTimeout(keyLoopT);
    keyLoopT = setTimeout(pollKeys, keyWatchFail ? 1200 : 0);
  }

  /* ---------------- 因果回流 ----------------
     你在「记一笔」小窗口里存了一条，桌面上的宠物要当场跳一下。
     壁纸收不到键盘，但它能收到这个信号 —— 这是"你做了事，它在回应"的闭环。 */
  let lastCheerAt = 0;
  async function pollCheer() {
    try {
      const r = await fetchT(API + "/cheer?t=" + Date.now(), 2000);
      if (!r || !r.ok) return;
      const j = await r.json();
      const at = j && j.at ? j.at : 0;
      if (at && at > lastCheerAt) {
        const first = lastCheerAt === 0;
        lastCheerAt = at;
        if (first) return;                 // 页面刚开时不算"刚记了一笔"
        try { if (window.Pet3D && Pet3D.cheer) Pet3D.cheer(); } catch (e) {}
        try { if (window.Pet && Pet.cheer) Pet.cheer(); } catch (e) {}
        typeOut("记下了。今天的事我替你收着。", "Green 记下了", "Green", "");
        showDlg();
        loadStreak();                      // 积累条立刻更新
      }
    } catch (e) {}
  }

  /* ---------------- 诊断上报 ----------------
     我看不到你的屏幕，所以让壁纸自己说清楚：用的哪个引擎、踩键被调了多少次。
     WebView2 里如果 WebGL 不可用，pet3d 不会启动，2D 兜底会接管 —— 那个没有踩键动画。 */
  let stepCalls = 0;
  function reportDiag() {
    try {
      const cv = document.getElementById("pet3d");
      const gl = cv && cv.getContext ? (cv.getContext("webgl2") || cv.getContext("webgl")) : null;
      const body = {
        engine: window.Pet3D ? "3d" : (window.Pet ? "2d-fallback" : "none"),
        hasPet3D: !!window.Pet3D,
        hasStep: !!(window.Pet3D && window.Pet3D.step),
        stepCalls: stepCalls,
        webgl: !!gl,
        three: window.THREE ? ("r" + THREE.REVISION) : "未加载",
        canvas: cv ? (cv.width + "x" + cv.height) : "无",
        petSize: getComputedStyle(document.documentElement).getPropertyValue("--pet").trim(),
        keys: window.__keyPolls || 0,
        errs: (window.__err || []).slice(0, 3).join(" | "),
        foot: (window.Pet3D && window.Pet3D.debugFoot) ? window.Pet3D.debugFoot() : null,
        kd: window.__kd,
        hidden: document.hidden,
        visState: document.visibilityState,
        perfActive: (window.Perf && window.Perf.active),
        rafTicks: (window.__lt || 0),
      };
      // 图片信标：不带 CORS 预检，WebView2 里最稳
      var im = new Image();
      im.src = API + "/diag?d=" + encodeURIComponent(JSON.stringify(body)) + "&t=" + Date.now();
    } catch (e) {}
  }
  window.addEventListener("error", (e) => { (window.__err = window.__err || []).push(e.message); });
  // ★ setInterval 会被 perf.js 在 document.hidden 时短路掉。
  //   壁纸挂在桌面图标后面，很可能被判成 hidden —— 那样下面两个循环全都不会执行。
  //   所以诊断改用 setTimeout 多报几次（不走闸门），并且把 hidden 一起报上来。
  [2500, 5000, 8000, 11000, 15000, 20000, 26000].forEach(function (t) { setTimeout(reportDiag, t); });
  setInterval(reportDiag, 15000);

  async function buildQueue() {
    const briefs = [], personal = [], todos = [];

    // 简讯：标题 + 正文。正文本身就带"这对你意味着什么"，是最好的台词
    try {
      const r = await fetchT(API + "/briefs?t=" + Date.now(), 3000);
      if (r && r.ok) {
        const b = await r.json();
        (b.items || []).forEach((it, bi) => {
          if (!it || !it.title) return;
          let body = String(it.b || "").replace(/\s+/g, " ").trim();
          if (body.length > 108) body = body.slice(0, 108) + "…";
          briefs.push({ tag: it.t || "今日简讯", text: it.title + "。" + body, who: "今日简讯", cta: "点这里打开面板看全文 ›", focus: ".brief-item@" + bi });
        });
      }
    } catch (err) {}

    // 待办 / 任务 / 格言
    try {
      const r = await fetchT(API + "/state.json?t=" + Date.now(), 3000);
      if (r && r.ok) {
        const st = await r.json();
        (st.todo || []).forEach((t) => {
          const x = typeof t === "string" ? t : (t.text || t.title || "");
          if (x) todos.push({ tag: "待办", text: x + "——顺手做掉就行，不做也没关系。", who: "待办", cta: "点这里打开面板 ›" });
        });
        (st.taskSteps || []).forEach((t) => {
          const x = typeof t === "string" ? t : (t.text || t.title || "");
          if (x) personal.push({ tag: "在做的事", text: x, who: "在做的事", cta: "" });
        });
        if (st.motto) personal.push({ tag: "一句", text: st.motto, who: "Green", cta: "" });
      }
    } catch (err) {}

    // 促记录：这是这个项目的核心目的，但原来一条相关台词都没有。
    // 判据是 /log 里最后一条的日期 —— 不看"有没有待办"，只看"有没有写下东西"。
    let gapDays = -1;
    try {
      const r = await fetchT(API + "/log?t=" + Date.now(), 3000);
      if (r && r.ok) {
        const lg = await r.json();
        const es = (lg && lg.entries) || [];
        if (es.length) {
          const last = new Date(es[es.length - 1].t || es[es.length - 1].time || 0);
          gapDays = Math.floor((Date.now() - last.getTime()) / 86400000);
        } else gapDays = 99;
      }
    } catch (err) {}
    if (gapDays === 0) {
      personal.push({ tag: "Green 记下了", text: "今天已经写过东西了，很好。", who: "Green", cta: "" });
    } else if (gapDays === 1) {
      personal.push({ tag: "顺手记一笔", text: "昨天到今天还没写什么。一句话就够，不写也没关系。", who: "Green", cta: "点这里打开面板 ›" });
    } else if (gapDays >= 2 && gapDays < 90) {
      personal.push({ tag: "顺手记一笔", text: "已经 " + gapDays + " 天没见你写东西了。想写就写，不想写就跳过。", who: "Green", cta: "点这里打开面板 ›" });
    }

    // ★ 因果闭环：把"多久没记录"喂给宠物本身，让它不只是嘴上说，
    //   而是整个人的状态都变了（动作变慢、呼吸变深、偶尔打哈欠）。
    //   参考 motion-web 的 lyre-crows：宠物不是播放器，是生态里的一环。
    try {
      if (window.Pet3D && Pet3D.setIdleDays && gapDays >= 0 && gapDays < 90) {
        Pet3D.setIdleDays(gapDays);
      }
    } catch (e) {}
    loadWeather();

    PROMPTS.forEach((p) => personal.push({
      tag: "顺手记一笔", text: p + "。想写就写，不想写就跳过。", who: "Green", cta: "点这里打开面板 ›",
    }));
    personal.push({ tag: "Green 在说", text: petLine(), who: "Green", cta: "点这里打开面板 ›" });
    const mem = memoryLine();
    if (mem) personal.unshift({ tag: "Green 记得", text: mem, who: "Green", cta: "点这里打开面板 ›" });

    // ★ 交错排列，不再随机洗牌。
    //   洗牌会让简讯被淹没 —— 20 条简讯混在待办/心得里，可能十几分钟才轮到一条。
    //   改成固定节奏：简讯 → 个人 → 简讯 → 待办 → 个人 → …
    //   简讯因此稳定占约 2/5 的篇幅，又不会连着刷屏。
    const out = [];
    let bi = 0, pi = 0, ti = 0;
    while (bi < briefs.length || pi < personal.length || ti < todos.length) {
      if (bi < briefs.length) out.push(briefs[bi++]);
      if (pi < personal.length) out.push(personal[pi++]);
      if (bi < briefs.length) out.push(briefs[bi++]);
      if (ti < todos.length) out.push(todos[ti++]);
      if (pi < personal.length) out.push(personal[pi++]);
    }
    dq = out;
    if (!dq.length) return;
    // 署名放最前：这是"作品"而不是"随机壁纸"的第一句
    dq.unshift({
      tag: "关于这张壁纸",
      text: "Green，由氢之卡比设计和实现。宠物、日环、这只会说话的框，都是自己写的。",
      who: "Green", cta: "点这里打开面板 ›",
    });
    setTimeout(() => { nextLine(); setInterval(nextLine, 20000); }, 7000);
  }

  /* ---------------- Lively 属性 ---------------- */
  function applyProps(p) {
    if (!p) return;
    const st = document.documentElement.style;
    if (p.petSize !== undefined) st.setProperty("--pet", p.petSize + "px");
    if (p.screenSize !== undefined) st.setProperty("--screen", p.screenSize + "px");
    if (p.ringOn !== undefined) { const r = $("day-ring"); if (r) r.style.display = p.ringOn ? "" : "none"; }
    if (p.metaOn !== undefined) { const m = $("meta"); if (m) m.style.display = p.metaOn ? "" : "none"; }
    if (p.beamOn !== undefined) {
      document.querySelectorAll(".beam").forEach((e) => { e.style.display = p.beamOn ? "" : "none"; });
    }
    if (p.stageRight !== undefined) { const s = $("stage"); if (s) s.style.right = p.stageRight + "vw"; }
    if (p.recOn !== undefined) { const e = $("dlg"); if (e) e.style.display = p.recOn ? "" : "none"; }
    if (p.lowPower !== undefined) {
      document.documentElement.dataset.lowpower = p.lowPower ? "1" : "0";
    }
  }
  window.livelyPropertyListener = function (name, val) { applyProps({ [name]: val }); };
  try {
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.addEventListener("message", (e) => {
        try { applyProps(typeof e.data === "string" ? JSON.parse(e.data) : e.data); } catch (err) {}
      });
      window.chrome.webview.postMessage("livelyPropertyRequest");
    }
  } catch (e) {}

  /* ★ 自愈回退：Lively 那套消息实测送不到（--pet 一直是空的，
     用户设的 petSize:380 从没生效过）。2 秒后如果还没拿到 --pet，
     就直接问本地服务端要属性文件的内容。
     这是本机应用，服务端和目标文件都在同一台机器上，没有额外风险。 */
  window.__propsVia = "none"; window.__propsErr = "";
  setTimeout(function () {
    const has = getComputedStyle(document.documentElement).getPropertyValue("--pet").trim();
    if (has) { window.__propsVia = "lively"; return; }
    window.__propsVia = "fetching";
    fetch(API + "/props", { cache: "no-store" })
      .then(function (r) { window.__propsHttp = r.status; return r.json(); })
      .then(function (j) {
        window.__propsKeys = j && j.props ? Object.keys(j.props).length : -1;
        window.__propsPet = j && j.props ? String(j.props.petSize) : "无";
        if (j && j.ok && j.props) { applyProps(j.props); window.__propsVia = "server"; }
        else { window.__propsVia = "badshape"; }
      })
      .catch(function (e) { window.__propsVia = "error"; window.__propsErr = String(e && e.message || e).slice(0, 90); });
  }, 2000);

  computeGeoOnBoot();
  drawRing(new Array(24).fill(0));
  paintMeta(null);
  boot();
  applyLateMode();
  setInterval(applyLateMode, 60000);

  /* ---------------- 像素漂移（护屏） ----------------
     落款和日期是固定位置的静态文字，几个月压在同一片像素上对 IPS 的残影不利。
     每 4 分钟沿八边形挪一个位置，幅度 4px —— 肉眼完全看不出，
     但同一片像素不会长期被同一段文字占着。
     只挪这两个，不挪宠物和键盘：那会看出来在动。 */
  (function pixelDrift() {
    let i = 0;
    const step = () => {
      i = (i + 1) % 8;
      const a = i * Math.PI / 4;
      const r = document.documentElement.style;
      r.setProperty("--sx", (Math.cos(a) * 4).toFixed(1) + "px");
      r.setProperty("--sy", (Math.sin(a) * 4).toFixed(1) + "px");
    };
    setInterval(step, 240000);
  })();
  startLight();
  wireIntro();
  wireDlg();
  paintStreak();      // 先画出来（14 个空格子也算"看得见的积累"），拉到数据再重画
  loadStreak();
  setInterval(pollCheer, 2500);
  buildKbd();
  computeGeoOnBoot();
  pollKeys();                     // 长轮询自续命，不再用 setInterval
  setTimeout(pollCheer, 1500);   // 先记下基线，避免把历史信号当成刚发生的
  buildQueue();
  pull();
  setInterval(pull, 60000);

  window.Wallpaper = { pull, drawRing, applyProps, light: light, kbd: { light: lightKeys, on: () => document.querySelectorAll(".kb-key.on").length, keys: () => Object.keys(kbKeys).length }, dbg: () => ({ lt: window.__lt, lerr: window.__lerr, lstart: window.__lstart, raf: lightRaf, x: light.x, y: light.y }) };
})();