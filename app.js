/* Green · 陪伴精灵 v1 */
let state = null;
let quoteIdx = -1;
let timerLeft = 30 * 60;
let timerRunning = false;
let timerInterval = null;

const $ = (id) => document.getElementById(id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (n) => String(n).padStart(2, "0");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function cdMs() {
  if (!state || !state.countdown) return null;
  return new Date(state.countdown.target).getTime() - Date.now();
}

function shortCd() {
  const ms = cdMs();
  if (ms === null) return "?";
  if (ms <= 0) return "今天";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? d + " 天 " + h + " 小时" : h + " 小时 " + pad(Math.floor((ms % 3600000) / 60000)) + " 分";
}

function nextSleepTarget() {
  if (!state || !state.sleepLine) return null;
  const now = new Date();
  const parts = state.sleepLine.split(":").map(Number);
  const target = new Date(now);
  target.setHours(parts[0], parts[1] || 0, 0, 0);
  // 睡眠日从中午 12 点起算：12 点之后的“上床线”属于明天凌晨
  if (now.getHours() >= 12) target.setDate(target.getDate() + 1);
  return target;
}

function sleepStatus() {
  const target = nextSleepTarget();
  if (!target) return "?";
  const diff = target - new Date();
  if (diff < 0) return "已过线";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return "还有 " + h + " 小时 " + pad(m) + " 分";
}

function clockTick() {
  const now = new Date();
  $("clock").textContent = pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
  const mc = $("mini-clock");
  if (mc) mc.textContent = pad(now.getHours()) + ":" + pad(now.getMinutes());
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  $("date-line").textContent = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " 星期" + week;
  const el = $("sleep-line");
  const target = nextSleepTarget();
  if (target) {
    const diff = target - now;
    if (diff < 0) {
      const overMin = Math.floor(-diff / 60000);
      el.textContent = "⚠️ 已过上床线 " + Math.floor(overMin / 60) + " 小时 " + (overMin % 60) + " 分";
      el.classList.add("over");
    } else {
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      el.textContent = "🌙 距上床线 " + state.sleepLine + " 还有 " + h + " 小时 " + pad(m) + " 分";
      el.classList.remove("over");
    }
  }
}

function say(text) {
  const el = $("quote");
  el.style.opacity = 0;
  setTimeout(() => {
    el.textContent = text.replace("{cd}", shortCd()).replace("{sleep}", sleepStatus());
    el.style.opacity = 1;
  }, 250);
}

function currentPool() {
  const h = new Date().getHours();
  const night = h >= 22 || h < 7;
  const morning = h >= 7 && h < 11;
  document.body.classList.toggle("night", night);
  if (!state) return ["我在。"];
  let pool = state.quotes.idle.slice();
  if (night) pool = pool.concat(state.quotes.night);
  if (morning) pool = pool.concat(state.quotes.morning);
  if (state.persona.energy <= 3) pool = pool.concat(state.quotes.lowEnergy);
  return pool;
}

function nextQuote() {
  const pool = currentPool();
  if (!pool.length) return;
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === quoteIdx) i = (i + 1) % pool.length;
  quoteIdx = i;
  say(pool[i]);
}

let lastXp = null;
function render() {
  if (!state) return;
  const p = state.persona;
  $("pet-level").textContent = p.level;
  $("pet-class").textContent = state.pclass || "技术成长型战士";
  $("pet-stats").innerHTML = (state.stats || [])
    .map((s) => {
      const color = s.v >= 70 ? "#7ee787" : s.v >= 40 ? "#e3b341" : "#f85149";
      return '<div class="stat-row"><span class="stat-k">' + escapeHtml(s.k) + '</span>' +
        '<div class="stat-bar"><div class="stat-fill" style="width:' + Math.min(100, s.v) + '%;background:' + color + '"></div></div>' +
        '<span class="stat-v">' + s.v + '</span></div>';
    })
    .join("");
  $("pet-xpbar").style.width = Math.min(100, (p.xp / p.xpMax) * 100) + "%";
  $("pet-xptext").textContent = p.xp + "/" + p.xpMax + " XP";
  if (lastXp !== null && p.xp > lastXp) {
    const diff = p.xp - lastXp;
    faceHappy = true;
    if (happyTimer) clearTimeout(happyTimer);
    happyTimer = setTimeout(() => { faceHappy = false; applyFace(); }, 2500);
    applyFace();
    say("🎉 XP +" + diff + "！继续。");
  }
  lastXp = p.xp;
  const steps = state.taskSteps || [];
  if (steps.length) {
    $("task-detail").innerHTML = steps
      .map((s) =>
        '<div class="td-step"><div class="td-title">' + escapeHtml(s.t) + '</div>' +
        (s.code ? '<div class="td-code">' + escapeHtml(s.code) + '</div>' : '') +
        (s.text ? '<div class="td-text">' + escapeHtml(s.text) + '</div>' : '') +
        '</div>')
      .join("");
  }
  updateHeroChips();
  const t = state.task;
  $("task-title").textContent = t.title;
  document.querySelector(".task-meta").textContent = t.time + " · " + t.rule + " · 奖励 " + t.reward;
  $("todos").innerHTML = (state.todo || []).map((x) => "<div>· " + escapeHtml(x) + "</div>").join("");
  $("footer-motto").textContent = "「" + state.motto + "」";
  $("updated").textContent = "状态更新于 " + String(state.updatedAt || "").replace("T", " ").slice(0, 16);
  applyFace();
  $("alarm-line").textContent = "起床锚点闹钟 " + (state.alarmTime || "11:30") + " · " + (state.weatherCity || "重庆");
  renderWeeklyBanner();
}

function updateHeroChips() {
  if (!state) return;
  const p = state.persona;
  const cdTxt = state.countdown ? shortCd() : "—";
  $("hero-chips").innerHTML =
    '<span class="chip">⚡ ' + p.energy + "/" + p.energyMax + '</span>' +
    '<span class="chip">💪 ' + p.fitnessWeeks + "/" + p.fitnessGoal + '</span>' +
    '<span class="chip">🏫 ' + escapeHtml(cdTxt) + '</span>';
}
function countdownTick() {
  updateHeroChips();
}

function timerTick() {
  $("timer").textContent = pad(Math.floor(timerLeft / 60)) + ":" + pad(timerLeft % 60);
  if (timerLeft <= 0) {
    stopTimer();
    say("30 分钟到了！去发我验收，+50 XP 到手。");
  }
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  $("t-start").textContent = "计时中";
  timerInterval = setInterval(() => { if (timerLeft > 0) timerLeft--; timerTick(); }, 1000);
}

function stopTimer() {
  timerRunning = false;
  if (timerInterval) clearInterval(timerInterval);
  $("t-start").textContent = "开始";
}

async function postLog(type, text) {
  try {
    const r = await fetch(PET_BASE + "/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, text, at: new Date().toISOString() }),
    });
    const j = await r.json();
    say(j.ok ? pick(["记下了！", "收到，我已存档。", "好，回头我帮你结进 XP。"]) : "没存上，待会儿再试。");
  } catch (e) {
    say("存不了档：本地服务没开。双击「启动陪伴精灵.bat」再试。");
  }
}

async function loadState() {
  try {
    const r = await fetch(PET_BASE + "/state.json?t=" + Date.now());
    if (r.ok) state = await r.json();
  } catch (e) { /* 服务器未启动时保留旧状态 */ }
  render();
}

async function loadBalance() {
  const line = $("balance-line");
  const sub = $("balance-sub");
  const key = localStorage.getItem("ds-key") || "";
  try {
    const r = await fetch(PET_BASE + "/balance?t=" + Date.now(), { headers: { "X-API-Key": key } });
    const j = await r.json();
    if (j.ok && j.data && j.data.balance_infos && j.data.balance_infos.length) {
      const b = j.data.balance_infos[0];
      const total = parseFloat(b.total_balance) || 0;
      line.textContent = "总额 " + b.total_balance + " " + b.currency;
      sub.textContent = "充值 " + b.topped_up_balance + " · 赠金 " + b.granted_balance;
      line.className = total < 5 ? "low" : total < 10 ? "warn" : "";
      if (key) { fetch(PET_BASE + "/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => {}); }
    } else if (j.error === "no-key") {
      line.textContent = "需要 DeepSeek API key";
      sub.textContent = "platform.deepseek.com → API Keys 复制，粘下面保存一次";
      line.className = "";
      $("key-row").style.display = "flex";
    } else {
      line.textContent = "查询失败";
      sub.textContent = (j.data && j.data.error && j.data.error.message) || ("HTTP " + (j.status || "?"));
      line.className = "low";
    }
  } catch (e) {
    line.textContent = "查询失败";
    sub.textContent = "本地服务未开？双击桌面图标重开";
    line.className = "low";
  }
}

/* ---- v2：情报简讯（全量展示，不轮播） ---- */
function loadBriefs() {
  fetch(PET_BASE + "/briefs?t=" + Date.now())
    .then((r) => r.json())
    .then((j) => {
      if (j && j.items && j.items.length) {
        $("brief-cnt").textContent = j.items.length + " 条 · " + (j.date || "");
        const html = j.items
          .map((it) => {
            const tag = '<span class="badge">' + escapeHtml(it.t || "情报") + '</span>';
            const title = it.u
              ? '<a class="brief-title" href="' + escapeHtml(it.u) + '" target="_blank" rel="noopener">' + escapeHtml(it.title || it.b) + '</a>'
              : '<span class="brief-title">' + escapeHtml(it.title || it.b) + '</span>';
            return '<div class="brief-item">' + tag + title + '<div class="brief-text">' + escapeHtml(it.b) + "</div></div>";
          })
          .join("");
  // 无障碍：内容渲染完必须把 aria-busy 关掉，否则屏幕阅读器一直以为还在加载
  { const bl = $("brief-list"); if (bl) bl.setAttribute("aria-busy", "false"); }
        $("brief-list").innerHTML = html;
      }
    })
    .catch(() => {});
}

/* ---- v2：天气 ---- */
function loadWeather() {
  fetch(PET_BASE + "/weather?t=" + Date.now())
    .then((r) => r.json())
    .then((j) => { $("weather-text").textContent = j.ok ? j.text : "天气暂不可用"; })
    .catch(() => { $("weather-text").textContent = "天气暂不可用"; });
}

/* ---- v2：副业账本 ---- */
function loadLedger() {
  fetch(PET_BASE + "/ledger?t=" + Date.now())
    .then((r) => r.json())
    .then((j) => {
      if (j && j.ok) {
        // 渠道配色：按出现顺序取色，不硬编码渠道名 —— 渠道由本地账本决定
        const palette = ["#7ee787", "#58a6ff", "#d2a8ff", "#f0883e", "#39c5cf"];
        const names = Object.keys(j.channels);
        $("ledger-cards").innerHTML = names.length
          ? names
              .map((k, i) => {
                const v = j.channels[k];
                const color = palette[i % palette.length];
                return '<div class="ledger-card" style="border-left-color:' + color + '">' +
                  '<div class="lc-name" style="color:' + color + '">' + escapeHtml(k) + '</div>' +
                  '<div class="lc-sum">' + Number(v.sum).toFixed(1) + ' 元</div>' +
                  '<div class="lc-n">' + v.n + ' 笔</div>' +
                  '</div>';
              })
              .join("")
          : '<div class="lc-empty">还没有账，记第一笔吧</div>';
        $("ledger-total").textContent = "总入账 " + Number(j.total || 0).toFixed(1) + " 元";
      }
    })
    .catch(() => {});
}
function postLedger() {
  const ch = $("ledger-channel").value.trim() || "其他";
  const amt = parseFloat($("ledger-amount").value);
  if (!isFinite(amt) || amt === 0) { say("金额要填数字，扣款填负数。"); return; }
  const note = $("ledger-note").value.trim();
  fetch(PET_BASE + "/ledger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: ch, amount: amt, note }),
  })
    .then((r) => r.json())
    .then((j) => {
      if (j.ok) { $("ledger-amount").value = ""; $("ledger-note").value = ""; loadLedger(); say(ch + " 记了 " + amt + " 元。"); }
      else say("没记上：" + (j.error || "?"));
    })
    .catch(() => say("没记上：本地服务没开？"));
}

/* ---- v2：睡眠打卡 ---- */
function fmtLocalTime(iso) {
  try {
    const d = new Date(iso);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  } catch (e) { return "--:--"; }
}
function loadSleepLog() {
  fetch(PET_BASE + "/log?t=" + Date.now())
    .then((r) => r.json())
    .then((j) => {
      if (j && j.ok && j.entries) {
        const sleeps = j.entries.filter((e) => e.type === "sleep").slice(-3);
        $("sleep-list").textContent = sleeps.length
          ? sleeps.map((e) => {
              const tm = fmtLocalTime(e.at || e.t);
              const m = String(e.text || "").match(/(\d+(?:\.\d+)?)\s*小时/);
              return tm + (m ? " · 睡了" + m[1] + "小时" : "");
            }).join(" ｜ ")
          : "还没有早起打卡记录";
      }
    })
    .catch(() => {});
}

/* ---- v2：闹钟 + 语音 ---- */
let voiceOn = localStorage.getItem("voice-on") === "1";
try { window.speechSynthesis.onvoiceschanged = () => { sweetVoice = null; }; } catch (e) {}
let lastAlarmDay = localStorage.getItem("last-alarm-day") || "";
let lastHourChime = "";
let sweetVoice = null;
function pickSweetVoice() {
  if (sweetVoice) return sweetVoice;
  try {
    const voices = window.speechSynthesis.getVoices();
    const zh = voices.filter((v) => v.lang && v.lang.toLowerCase().indexOf("zh") === 0);
    const prefer = ["Xiaoxiao", "晓晓", "Huihui", "慧慧", "Yaoyao", "瑶瑶"];
    for (const p of prefer) {
      const v = zh.find((x) => x.name.toLowerCase().indexOf(p.toLowerCase()) >= 0);
      if (v) { sweetVoice = v; return v; }
    }
    sweetVoice = zh[0] || null;
  } catch (e) {}
  return sweetVoice;
}
function speak(text) {
  try {
    if (voiceOn && isLeader && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickSweetVoice();
      if (v) u.voice = v;
      u.lang = "zh-CN";
      u.pitch = 1.15;
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    }
  } catch (e) {}
}
function renderVoiceBtn() {
  $("voice-toggle").textContent = voiceOn ? "🔊 语音开" : "🔇 语音关";
}
function checkAlarm() {
  moodTick();
  const now = new Date();
  const day = now.toDateString();
  const hk = day + "-" + now.getHours();
  if (hk !== lastHourChime) {
    lastHourChime = hk;
    speak("现在 " + now.getHours() + " 点。");
  }
  if (state && state.alarmTime) {
    const parts = state.alarmTime.split(":").map(Number);
    if (now.getHours() === parts[0] && now.getMinutes() === parts[1] && lastAlarmDay !== day) {
      lastAlarmDay = day;
      localStorage.setItem("last-alarm-day", day);
      speak("闹钟：起床，下床，出门晒十分钟太阳。");
      say("⏰ 起床锚点到了——下床，出门晒 10 分钟太阳。");
    }
  }
}

/* ---- v2.5：陪伴感 ---- */
let faceHappy = false;
let happyTimer = null;
function applyFace() {
  let cls = "sprite";
  if (faceHappy) cls += " happy";
  else if (state && state.persona && state.persona.energy <= 3) cls += " sleepy";
  $("sprite").className = cls;
}
const pageStart = Date.now();
function companionTick() {
  const ms = Date.now() - pageStart;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  $("companion-time").textContent = "已陪你 " + (h > 0 ? h + " 小时 " : "") + m + " 分";
}
function moodTick() {
  if (!state) return;
  const now = new Date();
  const h = now.getHours();
  let mood = "在线";
  if (faceHappy) mood = "开心";
  else if (state.persona.energy <= 3) mood = "低电量";
  else if (h >= 22 || h < 7) mood = "陪你熬夜";
  else if (h >= 7 && h < 11) mood = "早班";
  $("mood-label").textContent = mood;
  const day = now.toDateString();
  if (h === 22 && now.getMinutes() === 0 && localStorage.getItem("night-hello") !== day) {
    localStorage.setItem("night-hello", day);
    say("🌙 22 点了。今晚目标：2 点前闭眼。");
    speak("十点了。今晚两点前睡觉。");
  }
}
function scheduleProactive() {
  const delay = (25 + Math.random() * 20) * 60 * 1000;
  setTimeout(() => {
    if (state && state.quotes.proactive && state.quotes.proactive.length) say(pick(state.quotes.proactive));
    scheduleProactive();
  }, delay);
}

/* ---- v3.5：悬浮窗模式 + 语音领导权 ---- */
const isMini = new URLSearchParams(window.location.search).get("mode") === "mini";
const PET_BASE = window.location.pathname.indexOf("/pet") === 0 ? "/pet" : "";
let isLeader = false;
let leaderChannel = null;
if (isMini) document.body.classList.add("mini");
function electLeader() {
  if (!("BroadcastChannel" in window)) { isLeader = true; return; }
  if (!leaderChannel) {
    leaderChannel = new BroadcastChannel("green-pet");
    leaderChannel.onmessage = (e) => {
      if (e.data && e.data.type === "ping") leaderChannel.postMessage({ type: "pong" });
      if (e.data && e.data.type === "pong") window.__sawPong = true;
    };
  }
  window.__sawPong = false;
  leaderChannel.postMessage({ type: "ping" });
  setTimeout(() => { isLeader = !window.__sawPong; }, 400);
}
electLeader();
setInterval(electLeader, 45000);

/* ---- v3.10：与 Green 对话（DSH 大脑） ---- */
const DSH_API = PET_BASE === "/pet" ? "/api" : "/dshat";
let chatBusy = false;
let chatSessionId = localStorage.getItem("pet-chat-session") || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dshRpc(method, payload) {
  const r = await fetch(DSH_API + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())), method, payload }),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (!j.result || !j.result.ok) throw new Error((j.result && j.result.error && (j.result.error.message || j.result.error.code)) || "rpc fail");
  return j.result.value;
}

async function ensureChatSession() {
  if (chatSessionId) return chatSessionId;
  try {
    const l = await dshRpc("session.list", {});
    const item = (l.items || []).find((x) => String(x.cwd || "").split(String.fromCharCode(92)).join("/") === "D:/harness");
    if (item) { chatSessionId = item.sessionId; localStorage.setItem("pet-chat-session", chatSessionId); return chatSessionId; }
  } catch (e) {}
  const sid = "pet-" + Date.now().toString(36);
  const created = await dshRpc("session.create", { sessionId: sid, cwd: "D:/harness" });
  chatSessionId = created.sessionId;
  localStorage.setItem("pet-chat-session", chatSessionId);
  return chatSessionId;
}

function extractAssistantText(h) {
  const events = (h && h.events) || [];
  // 找到最后一个 user/message，只取它之后的文本
  let lastUserIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i] && events[i].event;
    if (ev && ev.type === "user/message") { lastUserIdx = i; break; }
  }
  const parts = [];
  let failed = false;
  for (let i = lastUserIdx + 1; i < events.length; i++) {
    const ev = events[i] && events[i].event;
    if (!ev) continue;
    if (ev.type === "assistant/message") {
      try {
        const d = ev.data;
        if (typeof d === "string") parts.push(d);
        else if (Array.isArray(d)) parts.push(d.map((b) => (b && b.text) || "").join("\n"));
        else if (d && Array.isArray(d.content)) parts.push(d.content.map((b) => (b && b.text) || "").join("\n"));
        else if (d && typeof d.text === "string") parts.push(d.text);
      } catch (e) {}
    } else if (ev.type === "assistant/chunk") {
      try {
        const c = ev.data && ev.data.chunk;
        if (c && c.type === "block-end" && c.block && c.block.type === "text" && typeof c.block.text === "string") {
          parts.push(c.block.text);
        }
        if (c && c.type === "finish" && c.reason && c.reason.kind === "error") failed = true;
      } catch (e) {}
    }
  }
  const text = parts.join("\n").trim();
  if (text) return text;
  return failed ? "__FAILED__" : "";
}

async function waitForReply(sid, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(2000);
    try {
      const l = await dshRpc("session.list", {});
      const item = (l.items || []).find((x) => x.sessionId === sid);
      if (item && !item.running) break;
    } catch (e) {}
  }
  const h = await dshRpc("session.history", { sessionId: sid, maxMessages: 6 });
  return extractAssistantText(h);
}

function addChatLine(who, text) {
  const log = $("chat-log");
  const div = document.createElement("div");
  div.className = "chat-line " + who;
  div.innerHTML = text === null
    ? '<span class="chat-thinking">Green 正在想…（首次会久一点）</span>'
    : escapeHtml(text);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

async function sendChat() {
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text || chatBusy) return;
  chatBusy = true;
  input.value = "";
  addChatLine("me", text);
  const think = addChatLine("green", null);
  try {
    const sid = await ensureChatSession();
    let payloadText = text;
    if (!localStorage.getItem("pet-chat-seeded")) {
      payloadText = "（初始化指令，只执行一次：以桌面宠物 Green 的身份回复。风格：1-3 句、口语化、像桌面宠物。想接自己的数字人格，改这一行的种子提示。）" + "\n" + text;
      localStorage.setItem("pet-chat-seeded", "1");
    }
    await dshRpc("session.prompt", { sessionId: sid, mode: "queue", content: [{ type: "text", text: payloadText }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    const reply = await waitForReply(sid, 240000);
    if (reply === "__FAILED__") {
      think.textContent = "Green 的大脑刚抽风了（DeepSeek API 抖动），再发一次就行。";
    } else {
      think.innerHTML = escapeHtml(reply || "（没等到回复，稍后再试）");
      think.classList.remove("chat-thinking-line");
      if (reply) { say(reply); speak(reply); }
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    think.textContent = "出错了：" + msg + (msg.indexOf("404") >= 0 ? " —— 重启精灵服务器：双击红色「关闭陪伴精灵」，再双击绿色图标" : "");
  }
  chatBusy = false;
}

/* ---- v3.22：每周例行 ---- */
let wkIdx = 0;
let wkAnswers = {};
function renderWeeklyBanner() {
  if (!state || !state.weekly) return;
  const w = state.weekly;
  $("weekly-status").textContent = w.answered
    ? "✅ 本周已答 · 能量 " + (state.persona ? state.persona.energy : "?") + "/10 · " + w.label
    : "⏳ 未回答 · 周日 20:00 前做完 · " + w.questions.length + " 题";
}
function openWeekly() {
  if (!state || !state.weekly) return;
  if (state.weekly.answered) { say("这周已经答完啦，下周例行会自动重置。"); return; }
  wkIdx = 0;
  wkAnswers = {};
  $("weekly-modal").classList.remove("hidden");
  renderWeeklyQ();
}
function renderWeeklyQ() {
  const w = state.weekly;
  $("weekly-progress").textContent = "第 " + (wkIdx + 1) + " / " + w.questions.length + " 题";
  $("weekly-q").textContent = w.questions[wkIdx].q;
  $("weekly-input").value = "";
  $("weekly-input").focus();
}
function nextWeekly() {
  const w = state.weekly;
  const q = w.questions[wkIdx];
  wkAnswers[q.id] = $("weekly-input").value.trim();
  if (wkIdx < w.questions.length - 1) { wkIdx++; renderWeeklyQ(); return; }
  fetch(PET_BASE + "/weekly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: wkAnswers }),
  })
    .then((r) => r.json())
    .then((j) => {
      $("weekly-modal").classList.add("hidden");
      if (j.ok) { say("✅ 本周例行完成！能量已更新，下周精灵内容按你的答案来。"); loadState(); }
      else { say("没存上，再试一次。"); }
    })
    .catch(() => { $("weekly-modal").classList.add("hidden"); say("没存上：本地服务没开？"); });
}
function weeklyCheck() {
  if (!state || !state.weekly || state.weekly.answered) return;
  const now = new Date();
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const parts = (state.weekly.scheduledTime || "20:00").split(":").map(Number);
  const sched = (parts[0] || 20) * 60 + (parts[1] || 0);
  const dow = state.weekly.scheduledDay === "周日" ? 0 : 6;
  if (day === dow && mins >= sched) {
    const key = "weekly-pinged-" + state.weekly.week;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "1");
      say("🔄 本周例行到点了——回答 7 个问题，决定下周精灵内容。");
      const el = $("weekly-entry");
      el.classList.add("weekly-glow");
      setTimeout(() => el.classList.remove("weekly-glow"), 4000);
    }
  }
}

/* 启动 */
loadState();
loadBalance();
setInterval(loadState, 12000);   // 原 5s 偏密：每 5 秒拉 7KB 并全量重绘
setInterval(nextQuote, 11000);
nextQuote();
countdownTick();
setInterval(countdownTick, 1000);
setInterval(loadBalance, 600000);
clockTick();
setInterval(clockTick, 1000);
timerTick();
loadBriefs();
loadWeather();
loadLedger();
loadSleepLog();
setInterval(loadWeather, 600000);
setInterval(loadLedger, 60000);
setInterval(checkAlarm, 20000);
checkAlarm();
renderVoiceBtn();
renderWeeklyBanner();
setInterval(weeklyCheck, 30000);
weeklyCheck();
scheduleProactive();
companionTick();
setInterval(companionTick, 60000);
setInterval(() => {
  if (state && state.slogans && state.slogans.length) $("pet-slogan").textContent = "「" + pick(state.slogans) + "」";
}, 30000);
setInterval(() => {
  if (Math.random() < 0.6) {
    const s = $("sprite");
    s.classList.add("wiggle");
    setTimeout(() => s.classList.remove("wiggle"), 1300);
  }
}, 25000);

let clickCount = 0;
let lastClickT = 0;
$("sprite").addEventListener("click", () => {
  const t = Date.now();
  clickCount = t - lastClickT < 1500 ? clickCount + 1 : 1;
  lastClickT = t;
  faceHappy = true;
  if (happyTimer) clearTimeout(happyTimer);
  happyTimer = setTimeout(() => { faceHappy = false; applyFace(); }, 2000);
  applyFace();
  const s = $("sprite");
  s.classList.add("bounce");
  setTimeout(() => s.classList.remove("bounce"), 500);
  if (clickCount >= 3) {
    clickCount = 0;
    say(pick(["行了行了，别戳了。", "再戳我也不会替你写代码。", "疼！去敲你的外设寄存器。"]));
    return;
  }
  say(state && state.quotes.click && state.quotes.click.length ? pick(state.quotes.click) : "我在。");
});
$("t-start").addEventListener("click", startTimer);
$("t-reset").addEventListener("click", () => {
  stopTimer();
  timerLeft = 30 * 60;
  timerTick();
  say("重置 30:00。现在，写起来。");
});
$("fit").addEventListener("click", async () => {
  try {
    const r = await fetch(PET_BASE + "/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fitness", text: "打卡", at: new Date().toISOString() }),
    });
    const j = await r.json();
    if (j.ok && j.fitness) {
      const f = j.fitness;
      say(f.bonus
        ? "🔥 三连击！+" + f.xpGain + " XP，身体素质 +1！"
        : "💪 +" + f.xpGain + " XP！累计 " + f.count + " 次（再 " + (3 - (f.count % 3)) + " 次三连击）");
      loadState();
    } else {
      say("记下了！");
    }
  } catch (e) { say("存不了档：本地服务没开？"); }
});
$("bal-refresh").addEventListener("click", loadBalance);
$("ledger-entry").addEventListener("click", () => {
  $("ledger-modal").classList.remove("hidden");
  loadLedger();
});
$("ledger-close").addEventListener("click", () => $("ledger-modal").classList.add("hidden"));
$("ledger-modal").addEventListener("click", (e) => {
  if (e.target === $("ledger-modal")) $("ledger-modal").classList.add("hidden");
});
$("task-entry").addEventListener("click", () => $("task-modal").classList.remove("hidden"));
$("task-close").addEventListener("click", () => $("task-modal").classList.add("hidden"));
$("task-modal").addEventListener("click", (e) => {
  if (e.target === $("task-modal")) $("task-modal").classList.add("hidden");
});
$("voice-toggle").addEventListener("click", () => {
  voiceOn = !voiceOn;
  localStorage.setItem("voice-on", voiceOn ? "1" : "0");
  renderVoiceBtn();
  if (voiceOn) speak("语音已开启。");
});
$("ledger-save").addEventListener("click", postLedger);
$("weekly-entry").addEventListener("click", openWeekly);
$("weekly-close").addEventListener("click", () => $("weekly-modal").classList.add("hidden"));
$("weekly-modal").addEventListener("click", (e) => { if (e.target === $("weekly-modal")) $("weekly-modal").classList.add("hidden"); });
$("weekly-next").addEventListener("click", nextWeekly);
$("weekly-prev").addEventListener("click", () => { if (wkIdx > 0) { wkIdx--; renderWeeklyQ(); } });
$("weekly-input").addEventListener("keydown", (e) => { if (e.key === "Enter") nextWeekly(); });
$("chat-send").addEventListener("click", sendChat);
$("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
$("sleep").addEventListener("click", () => {
  const hours = $("sleep-hours").value.trim();
  const text = hours ? "睡了" + hours + "小时" : "早起打卡（未填时长）";
  postLog("sleep", text);
  $("sleep-hours").value = "";
  setTimeout(loadSleepLog, 800);
});
$("key-save").addEventListener("click", () => {
  const v = $("key-input").value.trim();
  if (!v) return;
  localStorage.setItem("ds-key", v);
  fetch(PET_BASE + "/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: v }) }).catch(() => {});
  $("key-row").style.display = "none";
  loadBalance();
});
$("mood").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && $("mood").value.trim()) {
    postLog("mood", $("mood").value.trim());
    $("mood").value = "";
  }
});