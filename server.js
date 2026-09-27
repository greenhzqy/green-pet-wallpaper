// Green · 陪伴精灵 本地服务 v1（无依赖，只监听 127.0.0.1）
const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFile } = require("child_process");
let lastPanelAt = 0;
let lastNoteAt = 0;
let cheerAt = 0;
let lastKeys = [];
let keyAt = 0;
let keyCount = 0;
let diag = null;
let hb = null;
let lastFoot = "";
let footAt = 0;

/* ★ 长轮询等待队列。
   原来壁纸每 420ms 问一次 /keys，加上 _keywatch 的 24ms 采样 + 90ms 批量，
   最坏情况按下一个键要 ~530ms 宠物才动 —— 用户说的"响应不够快"就是这个。
   现在客户端带 ?since=<已知计数> 上来，没有新按键就把这个响应挂着，
   POST 一到立刻 flush。延迟降到 ~25ms，而且空闲时一次请求都没有。 */
let keyWaiters = [];
function flushKeyWaiters() {
  if (!keyWaiters.length) return;
  const list = keyWaiters;
  keyWaiters = [];
  for (const w of list) { clearTimeout(w.timer); try { w.send(); } catch (e) {} }
}
const ROOT = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 8765;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const SETTINGS_YAML = path.join(process.env.USERPROFILE || "C:\Users\Public", ".dsh", "settings.yaml");

function findApiKey() {
  const override = path.join(ROOT, "api-key.txt");
  try {
    const v = fs.readFileSync(override, "utf8").trim();
    if (v) return v;
  } catch (e) {}
  try {
    const txt = fs.readFileSync(SETTINGS_YAML, "utf8");
    const m = txt.match(/sk-[A-Za-z0-9_-]+/);
    if (m) return m[0];
  } catch (e) {}
  return null;
}

function getBalance(key) {
  return new Promise((resolve) => {
    const req = https.request(
      "https://api.deepseek.com/user/balance",
      {
        method: "GET",
        headers: { Authorization: "Bearer " + key, "User-Agent": "green-pet/1.0" },
        timeout: 8000,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          let data = null;
          try { data = JSON.parse(body); } catch (e) {}
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: data, raw: data ? null : body });
        });
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", (e) => resolve({ ok: false, status: 0, error: String(e) }));
    req.end();
  });
}
// 情报简讯：可选功能，不是必需的。默认读本目录下的 briefs.json（没有就让 /briefs 返回空）。
// 想接自己的情报源，把 GREEN_BRIEFS 环境变量指向那个 JSON 就行。
const BRIEFS_PATH = process.env.GREEN_BRIEFS || path.join(ROOT, "briefs.json");
const LEDGER_PATH = path.join(ROOT, "ledger.jsonl");

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

function readJsonl(p, limit) {
  try {
    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { return []; }
}

let weatherCache = { text: null, at: 0 };
function getWeather(city) {
  return new Promise((resolve) => {
    if (weatherCache.text && Date.now() - weatherCache.at < 10 * 60 * 1000) {
      resolve({ ok: true, text: weatherCache.text, cached: true });
      return;
    }
    const url = "https://wttr.in/" + encodeURIComponent(city) + "?format=%l:+%c+%t";
    const req = https.request(url, { method: "GET", headers: { "User-Agent": "curl/8" }, timeout: 8000 }, (res) => {
      let body = "";
      res.on("data", (ch) => (body += ch));
      res.on("end", () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300 && body.trim().length > 0 && body.trim().length < 300;
        if (ok) { weatherCache = { text: body.trim(), at: Date.now() }; resolve({ ok: true, text: body.trim(), cached: false }); }
        else resolve({ ok: false, text: "" });
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve({ ok: false, text: "" }));
    req.end();
  });
}
// ---------------- 感知层：Win32 空闲时间 + 前台窗口 ----------------
// 让精灵自己知道"他在不在、在干嘛"，而不是等他打卡。
const SENSE_PS = [
  '$ErrorActionPreference="SilentlyContinue"',
  // 关键：PowerShell 默认 stdout 不是 UTF-8，中文标题会乱码
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '$OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'using System.Text;',
  'public class GW {',
  '  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);',
  '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint id);',
  '  [DllImport("kernel32.dll")] public static extern uint GetTickCount();',
  '  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }',
  '}',
  '"@',
  '$li = New-Object GW+LASTINPUTINFO',
  '$li.cbSize = 8',
  '[void][GW]::GetLastInputInfo([ref]$li)',
  '$idleMs = [uint32](([int64][GW]::GetTickCount() - [int64]$li.dwTime) -band 0xFFFFFFFF)',
  '$h = [GW]::GetForegroundWindow()',
  '$sb = New-Object System.Text.StringBuilder 512',
  '[void][GW]::GetWindowText($h, $sb, 512)',
  '$wpid = [uint32]0',
  '[void][GW]::GetWindowThreadProcessId($h, [ref]$wpid)',
  '$pn = (Get-Process -Id $wpid -ErrorAction SilentlyContinue).ProcessName',
  '$o = [ordered]@{ ok=$true; idleSec=[math]::Round($idleMs/1000,1); proc=[string]$pn; title=$sb.ToString() }',
  '$o | ConvertTo-Json -Compress',
].join("\n");

function getSense() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SENSE_PS],
      { timeout: 6000, windowsHide: true, maxBuffer: 512 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: String((err && err.message) || err) });
        try {
          resolve(JSON.parse(String(stdout).trim()));
        } catch (e) {
          resolve({ ok: false, error: "parse-failed", raw: String(stdout).slice(0, 200) });
        }
      }
    );
  });
}

function classify(proc, title) {
  const p = String(proc || "").toLowerCase();
  const t = String(title || "");
  if (/code|devenv|keil|stm32cubeide|idea|pycharm|clion|goland|webstorm|sublime|notepad\+\+|cursor|windsurf|vim|emacs|platformio|arduino/.test(p)) return "coding";
  if (/windowsterminal|cmd|powershell|pwsh|conhost|git-bash|bash|wt\.exe/.test(p)) return "terminal";
  if (/msedge|chrome|firefox|brave|opera|quark|360se|sogouexplorer/.test(p)) return "browsing";
  if (/wechat|weixin|qq|telegram|discord|dingtalk|feishu|lark|slack/.test(p)) return "chat";
  if (/steam|genshin|yuanshen|league|valorant|cs2|dota|epic|game/.test(p) || /原神|王者|英雄联盟|游戏/.test(t)) return "game";
  if (/potplayer|vlc|bilibili|iqiyi|youku|mpv|tencentvideo/.test(p)) return "video";
  if (/obsidian|typora|notion|onenote|winword|excel|powerpnt|wps/.test(p)) return "writing";
  return "other";
}

const SENSE_STATE = path.join(ROOT, "sense-state.json");
const HISTORY_PATH = path.join(ROOT, "sense-history.json");
const IDLE_ACTIVE = 120;   // ≤120s 没动键鼠 = 他在电脑前
const IDLE_LEAVE = 300;    // ≥300s = 他走开了
const XP_PER_BLOCK = 5;    // 每累计 1000s 活跃 → +5 XP
const BLOCK_SEC = 1000;

function readSenseState() {
  try { return JSON.parse(fs.readFileSync(SENSE_STATE, "utf8")); } catch (e) { return null; }
}

// 累计活跃时长 + 自动发 XP（替代"打卡"）
function accumulate(s) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  let st = readSenseState() || {};
  if (st.day !== today) st = { day: today, activeSec: 0, lastTick: 0, xpGiven: 0, streakSec: 0, lastProc: "", hours: new Array(24).fill(0), acts: {} };
  if (!st.hours) st.hours = new Array(24).fill(0);
  if (!st.acts) st.acts = {};
  if (!st.lastTick) st.lastTick = now;

  const out = {
    ok: !!s.ok,
    error: s.ok ? null : s.error || null,
    idleSec: s.ok ? s.idleSec : null,
    proc: s.ok ? s.proc : null,
    title: s.ok ? s.title : null,
    activity: s.ok ? classify(s.proc, s.title) : "unknown",
    activeSecToday: st.activeSec,
    hours: st.hours,
    acts: st.acts,
    streakMin: Math.round(st.streakSec / 60),
    xpToday: st.xpGiven,
    usingPc: false,
    justReturned: false,
    justLeft: false,
  };

  if (s.ok && typeof s.idleSec === "number") {
    // ★ 必须双边钳位：若系统时钟回拨，lastTick 会大于 now，负 delta 会把累计时长"倒扣"
  const rawDelta = (now - st.lastTick) / 1000;
  const delta = rawDelta < 0 ? 0 : (rawDelta > 600 ? 600 : rawDelta); // 防跳变；600s 上限兼容悬浮球 180s 轮询
    const wasUsing = st.usingPc;
    out.usingPc = s.idleSec <= IDLE_ACTIVE;

    if (out.usingPc) {
      st.activeSec += delta;
      st.streakSec += delta;
      st.usingPc = true;
      // 按小时留痕：这是「今日之环」以及自动草稿的数据源
      const hh = new Date().getHours();
      st.hours[hh] = (st.hours[hh] || 0) + delta;
      const act = out.activity || "other";
      st.acts[act] = (st.acts[act] || 0) + delta;
      // 自动 XP：不看打卡，只看"他真在电脑前待着"
      const shouldHave = Math.floor(st.activeSec / BLOCK_SEC) * XP_PER_BLOCK;
      if (shouldHave > st.xpGiven) {
        const gain = shouldHave - st.xpGiven;
        st.xpGiven = shouldHave;
        out.xpGained = gain;
        try {
          const sp = path.join(ROOT, "state.json");
          const stt = JSON.parse(fs.readFileSync(sp, "utf8"));
          if (stt.persona) stt.persona.xp = (Number(stt.persona.xp) || 0) + gain;
          stt.updatedAt = new Date().toISOString();
          fs.writeFileSync(sp, JSON.stringify(stt, null, 2));
        } catch (e) {}
      }
    } else {
      st.usingPc = false;
      if (s.idleSec >= IDLE_LEAVE) st.streakSec = 0;
    }
    if (!wasUsing && out.usingPc && st.lastTick) out.justReturned = true;
    st.lastProc = s.proc || st.lastProc;
  }

  st.lastTick = now;
  try { fs.writeFileSync(SENSE_STATE, JSON.stringify(st, null, 2)); } catch (e) {}

  // 每日陪伴秒数落历史（供热力图）
  try {
    const hist = readJsonSafe(HISTORY_PATH) || {};
    hist[st.day] = Math.round(st.activeSec);
    const keys = Object.keys(hist).sort();
    while (keys.length > 400) { delete hist[keys.shift()]; }
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(hist));
  } catch (e) {}

  return out;
}

function sendJson(res, obj) {
  // 必须显式声明 charset：PowerShell 的 Invoke-RestMethod / Invoke-WebRequest
  // 对没有 charset 的 application/json 会按 Latin-1 解码 → 中文标题乱码
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    // Lively 把壁纸页面放在它自己的 localhost 端口上，取 8765 的接口属于跨源
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");

  // 每日陪伴历史（热力图数据源）
  if (u.pathname === "/history") {
    const hist = readJsonSafe(HISTORY_PATH) || {};
    sendJson(res, { ok: true, days: hist, today: new Date().toISOString().slice(0, 10) });
    return;
  }

  // ---------------- 感知：他不用打卡，我自己看 ----------------
  // 返回：键鼠空闲秒数 / 前台窗口标题与进程 / 活跃时长累计 / 自动 XP
  if (u.pathname === "/sense") {
    getSense().then((s) => {
      const out = accumulate(s);
      sendJson(res, out);
    });
    return;
  }

  // DeepSeek 账户余额（服务端查，key 只在本机流转）
  if (u.pathname === "/balance") {
    const key = String(req.headers["x-api-key"] || "").trim() || findApiKey();
    if (!key) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "no-key", message: "需要一个 DeepSeek API key" }));
      return;
    }
    getBalance(key).then((r) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r));
    });
    return;
  }
  // DSH 代理：/dshat/<method> → http://127.0.0.1:3080/api/<method>（宠物对话走这里）
  if (u.pathname.startsWith("/dshat/")) {
    const targetPath = "/api/" + u.pathname.slice("/dshat/".length) + u.search;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const out = http.request(
        { host: "127.0.0.1", port: 3080, path: targetPath, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": body.length } },
        (up) => {
          res.writeHead(up.statusCode || 502, { "Content-Type": (up.headers["content-type"] || "application/json") });
          up.pipe(res);
        }
      );
      out.on("error", () => { res.writeHead(502); res.end(JSON.stringify({ ok: false, error: "dsh-unreachable" })); });
      out.write(body);
      out.end();
    });
    return;
  }
  // 每周例行：保存答案 → 更新能量 + 标记完成
  if (u.pathname === "/weekly" && req.method === "POST") {
    let body = "";
    req.on("data", (ch) => { body += ch; if (body.length > 64 * 1024) req.destroy(); });
    req.on("end", () => {
      try {
        const j = JSON.parse(body);
        const answers = (j && j.answers) || {};
        const sp = path.join(ROOT, "state.json");
        const st = JSON.parse(fs.readFileSync(sp, "utf8"));
        if (st.weekly) {
          st.weekly.answers = answers;
          st.weekly.answered = true;
          st.weekly.answeredAt = new Date().toISOString();
        }
        const en = parseInt(answers.energy, 10);
        if (!isNaN(en) && st.persona) st.persona.energy = Math.min(10, Math.max(1, en));
        st.updatedAt = new Date().toISOString();
        fs.writeFileSync(sp, JSON.stringify(st, null, 2));
        const rec = { type: "weekly", week: st.weekly ? st.weekly.week : "?", answers, t: new Date().toISOString() };
        fs.appendFileSync(path.join(ROOT, "log.jsonl"), JSON.stringify(rec) + "\n");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }
  // 保存 API key 到本地文件（供定时情报任务使用；已 gitignore，不出仓库）
  if (u.pathname === "/key" && req.method === "POST") {
    let body = "";
    req.on("data", (ch) => { body += ch; if (body.length > 4096) req.destroy(); });
    req.on("end", () => {
      try {
        const j = JSON.parse(body);
        const k = String(j.key || "").trim();
        if (/^sk-[A-Za-z0-9_-]{8,}$/.test(k)) {
          fs.writeFileSync(path.join(ROOT, "api-key.txt"), k);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false }));
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }
  // 情报简讯（可选：默认读本目录 briefs.json，或 GREEN_BRIEFS 指向的 JSON）
  if (u.pathname === "/briefs") {
    const b = readJsonSafe(BRIEFS_PATH) || { date: "", count: 0, items: [] };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(b));
    return;
  }

  // 天气（wttr.in，10 分钟缓存）
  if (u.pathname === "/weather") {
    let city = "Chongqing";
    const st = readJsonSafe(path.join(ROOT, "state.json"));
    if (st && st.weatherCity) city = String(st.weatherCity);
    getWeather(city).then((r) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r));
    });
    return;
  }

  // 副业账本
  if (u.pathname === "/ledger" && req.method === "POST") {
    let body = "";
    req.on("data", (ch) => { body += ch; if (body.length > 64 * 1024) req.destroy(); });
    req.on("end", () => {
      try {
        const entry = JSON.parse(body);
        if (!entry.channel || typeof entry.amount !== "number" || !isFinite(entry.amount)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "channel + amount(number) required" }));
          return;
        }
        entry.t = new Date().toISOString();
        fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + "\n");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }
  if (u.pathname === "/ledger") {
    const entries = readJsonl(LEDGER_PATH, 1000);
    const channels = {};
    let total = 0;
    for (const e of entries) {
      const k = String(e.channel || "其他");
      if (!channels[k]) channels[k] = { sum: 0, n: 0 };
      channels[k].sum += Number(e.amount || 0);
      channels[k].n += 1;
      total += Number(e.amount || 0);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, channels, total, count: entries.length, entries: entries.slice(-10) }));
    return;
  }

  // 精灵打卡日志（最近 30 条）
  if (u.pathname === "/log" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, entries: readJsonl(path.join(ROOT, "log.jsonl"), 30) }));
    return;
  }
  // 打卡/心情 → 追加写 log.jsonl（我下次会话会读它结算 XP）
  if (u.pathname === "/log" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 64 * 1024) req.destroy(); });
    req.on("end", () => {
      try {
        const entry = JSON.parse(body);
        entry.t = new Date().toISOString();
        fs.appendFileSync(path.join(ROOT, "log.jsonl"), JSON.stringify(entry) + "\n");
        // 健身打卡：自动结算 XP（每次 +10；每 3 次三连击 +20 且身体素质 +1，上限 60）
        let fitness = null;
        if (entry.type === "fitness") {
          const all = readJsonl(path.join(ROOT, "log.jsonl"), 100000);
          const fitCount = all.filter((e) => e.type === "fitness").length;
          const bonus = fitCount % 3 === 0;
          const xpGain = 10 + (bonus ? 20 : 0);
          try {
            const sp = path.join(ROOT, "state.json");
            const st = JSON.parse(fs.readFileSync(sp, "utf8"));
            if (st.persona) st.persona.xp = (Number(st.persona.xp) || 0) + xpGain;
            if (bonus && Array.isArray(st.stats)) {
              const fit = st.stats.find((s) => s && s.k === "身体素质");
              if (fit) fit.v = Math.min(60, (Number(fit.v) || 40) + 1);
            }
            st.updatedAt = new Date().toISOString();
            fs.writeFileSync(sp, JSON.stringify(st, null, 2));
          } catch (e) {}
          fitness = { count: fitCount, bonus, xpGain };
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, fitness }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  // 导出 / 备份：数据只在一个 7KB 的 state.json 里，没有任何出口 —— 文件坏了就全没了。
  // 不引入依赖：直接在桌面建一个带日期的文件夹，把 json 全拷进去 + 生成一份可读的 Markdown。
  if (u.pathname === "/export") {
    const os = require("os");
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const dir = path.join(os.homedir(), "Desktop", "Green备份-" + stamp);
    const out = { ok: true, dir: dir, files: [] };
    try {
      fs.mkdirSync(dir, { recursive: true });
      // 1) 原始 json 全量拷贝（不解析、不改写，原样保底）
      fs.readdirSync(ROOT).filter((f) => /\.json$/.test(f)).forEach((f) => {
        try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); out.files.push(f); } catch (e) {}
      });
      // 2) 生成一份人能读的 Markdown
      let st = {};
      try { st = JSON.parse(fs.readFileSync(path.join(ROOT, "state.json"), "utf8")); } catch (e) {}
      const L = [];
      const line = (x) => L.push(x);
      line("# Green 陪伴精灵 · 数据备份");
      line("");
      line("导出时间：" + new Date().toLocaleString("zh-CN"));
      line("");
      if (st.motto) { line("> " + st.motto); line(""); }
      if (st.sleepLine) { line("**睡眠提示**：" + st.sleepLine); line(""); }
      if (st.alarmTime || st.weatherCity) { line("闹钟 " + (st.alarmTime || "-") + " · 城市 " + (st.weatherCity || "-")); line(""); }
      if (Array.isArray(st.todo) && st.todo.length) {
        line("## 待办");
        st.todo.forEach((t) => line("- " + (typeof t === "string" ? t : (t.text || t.title || ""))));
        line("");
      }
      if (st.task) {
        line("## 当前任务");
        line("**" + (st.task.title || st.task.name || "—") + "**");
        if (Array.isArray(st.taskSteps)) st.taskSteps.forEach((t, i) => line((i + 1) + ". " + (typeof t === "string" ? t : (t.text || t.title || ""))));
        line("");
      }
      if (Array.isArray(st.stats) && st.stats.length) {
        line("## 状态");
        st.stats.forEach((x) => {
          // 原来是原样 JSON.stringify，出来是 {"k":"行动力","v":85}，人读不了
          if (x && typeof x === "object" && x.k) line("- " + x.k + "：" + x.v);
          else line("- " + (typeof x === "string" ? x : JSON.stringify(x)));
        });
        line("");
      }
      if (st.countdown) {
        line("## 倒计时");
        const cd = st.countdown;
        let when = cd.target || "";
        try { when = new Date(cd.target).toLocaleString("zh-CN"); } catch (e) {}
        line("- " + (cd.label || "") + "：" + when);
        line("");
      }
      line("---");
      line("");
      line("原始数据见同目录下的 json 文件。");
      const mdName = "Green备份-" + stamp + ".md";
      fs.writeFileSync(path.join(dir, mdName), L.join("\n"), "utf8");
      out.files.push(mdName);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  // 记一笔：壁纸收不到键盘（Lively 的限制），所以点击后开一个专门的小输入窗口。
  // 它比"打开面板"轻得多 —— 一个 620x168 的窗口，打完回车自己关掉。
  if (u.pathname === "/note") {
    const { spawn } = require("child_process");
    const reply = (o) => {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(o));
    };
    const now = Date.now();
    if (now - lastNoteAt < 1200) { reply({ ok: true, skipped: "cooldown" }); return; }
    lastNoteAt = now;
    const edges = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    const edge = edges.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
    if (!edge) { reply({ ok: false, error: "no-edge" }); return; }
    // 放在屏幕中偏下，靠近壁纸对话框的位置，视线不用跳
    const W = 620, H = 168;
    const ox = 420, oy = 40;   // 大致居中；Edge 会自己约束到屏幕内
    try {
      const child = spawn(edge, [
        "--app=http://127.0.0.1:8765/note.html",
        "--window-size=" + W + "," + H,
        "--window-position=" + ox + "," + oy,
        "--no-first-run", "--no-default-browser-check",
      ], { detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
      // 1.6 秒后如果还没关（用户没打字），不强求，让它留着
      reply({ ok: true, via: "edge-note" });
    } catch (e) { reply({ ok: false, error: String(e) }); }
    return;
  }

  // 壁纸轮询这个，拿到"刚刚记了一笔"的信号就跳一下
  if (u.pathname === "/cheer") {
    if (req.method === "POST") cheerAt = Date.now();
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true, at: cheerAt }));
    return;
  }

  // 诊断：壁纸把"我用的哪个引擎、踩键被调了多少次"报上来，方便远程排查
  if (u.pathname === "/diag") {
    const reply = (o) => { res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(o)); };
    if (req.method === "POST") {
      let b = ""; req.on("data", (c) => { b += c; if (b.length > 8192) req.destroy(); });
      req.on("end", () => { try { diag = JSON.parse(b); diag.at = Date.now(); } catch (e) {} reply({ ok: true }); });
      return;
    }
    // 图片信标走 GET：把诊断塞在 ?d= 里。fetch 在 WebView2 里可能被跨源挡，
    // new Image().src 不会 —— 这是最可靠的"只上报、不要回包"通道。
    const raw = u.searchParams.get("d");
    if (raw) { try { diag = JSON.parse(decodeURIComponent(raw)); diag.at = Date.now(); } catch (e) {} }
    reply({ ok: true, diag: diag });
    return;
  }

  // keywatch 心跳：把"看见了按下"和"POST 成功"分开，用来定位链路断在哪一环
  if (u.pathname === "/hb") {
    const reply = (o) => { res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(o)); };
    if (req.method === "POST") {
      let b = ""; req.on("data", (c) => { b += c; if (b.length > 2048) req.destroy(); });
      req.on("end", () => { try { hb = JSON.parse(b); hb.at = Date.now(); } catch (e) {} reply({ ok: true }); });
      return;
    }
    reply({ ok: true, hb: hb });
    return;
  }

  // 键盘监看：让桌宠跟着你按键。
  // ★ 隐私设计（故意的，不要"优化"掉）：
  //   · 只收虚拟键码，永远不解析成字符；Shift/CapsLock 状态不参与，还原不出你打了什么
  //   · 只在内存里保留"最后一个键 + 计数"，绝不落盘 —— 服务器一重启就没了
   //   · 不留历史，不缓冲过去的按键
  // Lively 的壁纸属性。
  // ★ 为什么不靠 window.chrome.webview 那套消息：实测它根本没送达 ——
  //   壁纸里 --pet 始终是空的，用户设的 petSize:380 一直没生效（实际跑 300）。
  //   与其赌那个脆弱的协议，不如直接读它的属性文件。
  if (u.pathname === "/props") {
    const out = {};
    try {
      const base = path.join(process.env.LOCALAPPDATA || "", "Lively Wallpaper", "Library", "wallpapers");
      for (const dir of fs.readdirSync(base)) {
        const f = path.join(base, dir, "LivelyProperties.json");
        try {
          const j = JSON.parse(fs.readFileSync(f, "utf8"));
          for (const k of Object.keys(j)) {
            if (j[k] && typeof j[k] === "object" && "value" in j[k]) out[k] = j[k].value;
          }
        } catch (e) {}
      }
    } catch (e) {}
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, props: out }));
    return;
  }

  if (u.pathname === "/keys") {
    const reply = (o) => {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(o));
    };
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on("end", () => {
        try {
          const o = JSON.parse(body);
          const vks = Array.isArray(o.vks)
            ? o.vks.filter((v) => Number.isFinite(v) && v > 0 && v < 256).slice(0, 32)
            : [];
          if (vks.length) {
            lastKeys = vks;
            keyAt = Date.now();
            keyCount += vks.length;
            flushKeyWaiters();          // 有按键了，立刻唤醒所有挂着的长轮询
          }
        } catch (e) {}
        reply({ ok: true });
      });
      return;
    }
    // 壁纸每次轮询都会带 ?f=<脚的实时状态> 上来。
    // 按键高亮证明这条路一定是通的 —— 所以用它当诊断通道最可靠。
    const f = u.searchParams.get("f");
    if (f) { lastFoot = f; footAt = Date.now(); }
    const since = u.searchParams.get("since");
    if (since !== null && Number(since) === keyCount) {
      const w = {};
      w.timer = setTimeout(() => {
        keyWaiters = keyWaiters.filter((x) => x !== w);
        reply({ ok: true, vks: [], at: 0, n: keyCount, wait: 1 });
      }, 25000);
      w.send = () => reply({ ok: true, vks: lastKeys, at: keyAt, n: keyCount, foot: lastFoot, footAt: footAt });
      keyWaiters.push(w);
      req.on("close", () => { clearTimeout(w.timer); keyWaiters = keyWaiters.filter((x) => x !== w); });
      return;
    }
    reply({ ok: true, vks: lastKeys, at: keyAt, n: keyCount, foot: lastFoot, footAt: footAt });
    return;
  }

  // 壁纸里跑不了 .bat —— 双击宠物时打这个接口，由服务端拉起面板。
  // ★ 千万不要走 cmd.exe / start-panel.bat：那会弹出一串控制台窗口。
  //   msedge.exe 是 GUI 程序，直接 spawn 且加 windowsHide，一个窗口都不会闪。
  if (u.pathname === "/panel") {
    const { spawn } = require("child_process");
    const reply = (obj) => {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(obj));
    };
    // 冷却：双击会连发好几次事件，没这道闸就会一次点出好几个面板
    const now = Date.now();
    if (now - lastPanelAt < 4000) { reply({ ok: true, skipped: "cooldown" }); return; }
    lastPanelAt = now;

    const edges = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    const edge = edges.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
    if (!edge) {
      try {
        spawn("cmd.exe", ["/c", "start", "", "http://127.0.0.1:8765"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
        reply({ ok: true, via: "browser-default" });
      } catch (e) { reply({ ok: false, error: String(e) }); }
      return;
    }
    try {
      // 深链：壁纸说"点这里看全文"，就得真的能定位到那一条
      const focus = u.searchParams.get("focus") || "";
      const target = "http://127.0.0.1:8765/" + (focus ? "?focus=" + encodeURIComponent(focus) : "");
      // 同一个 --app URL 重复拉起时 Edge 会复用已有窗口，所以不会开出第二个面板
      spawn(edge, [
        "--app=" + target,
        "--window-size=1180,760",
        "--window-position=680,120",
        "--no-first-run",
        "--no-default-browser-check",
      ], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      reply({ ok: true, via: "edge-app" });
    } catch (e) { reply({ ok: false, error: String(e) }); }
    return;
  }

  let p = decodeURIComponent(u.pathname);
  if (p === "/") p = "/index.html";
  const file = path.resolve(ROOT, "." + p);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end("403");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("404"); return; }
    const ext = path.extname(file).toLowerCase();
    // HTML 永不缓存（避免打开还是老版本）；其它资源也必须回源校验
    const cache = ext === ".html"
      ? "no-store, no-cache, must-revalidate"
      : "no-cache, must-revalidate";
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cache,
      "Pragma": "no-cache",
      "Expires": "0",
      // 壁纸被 Lively 托管时页面不在 8765 上，取 assets/ 属于跨源 —— 必须放行
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("[Green] pet server running at http://127.0.0.1:" + PORT);
});