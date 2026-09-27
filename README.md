# Green · 陪伴精灵

> 一只住在桌面壁纸里的绿色氢原子。
> 它站在一把机械键盘上，你打字，它抬脚去踩对应的键。
> 零依赖（Node + 一个浏览器），纯本地运行，数据不出电脑。

不打卡、不提醒你「该记录了」。它自己知道你在不在、在干嘛。

> 截图里宠物身后的 livehouse 背景是**你自己放的图片**：仓库只带目录结构和清单，
> 不附带任何有版权的照片与歌词（见文末「关于图片与歌词」）。

---

## 它现在长什么样

- **Lively Wallpaper 承载**，铺在桌面图标之下 —— 不是悬浮窗，是壁纸本身
- **3D 宠物**（three.js，程序化建模，无外部模型文件）：清漆材质 + 程序化环境贴图 + ACES 色调映射
- **真·机械键盘**：87 配列，键帽侧壁 22px，按下时整顶沉到机壳面、轴体柱收平
- **跟着你打字**：你按 F，它伸左脚踩 F。左右半区分别对应左右脚，按第几排决定伸展幅度
- **livehouse 舞台**：按 `assets/<id>/` 放谁的图就是谁的舞台，照片 + 歌词由你自己提供
  （`assets/artists.json` 是清单，改这里换人）
- **galgame 对话框**：26ms 逐字打字机、名牌立牌、▼ 指示、四角装饰
- **三层署名**：开机签名 → 角落落款 → 面板作者页

## 交互

| 点哪里 | 结果 |
|---|---|
| **宠物** | 打开主面板（看全部 / 翻记录 / 改设置） |
| 对话框正文 | 记一笔（有键盘焦点的小窗，打完回车自己关） |
| 悬停宠物 | 它抬头看你，并说一句当前状态 |

---

## 快速开始

需要 [Lively Wallpaper](https://rocksdanister.github.io/lively/)（免费开源）。

1. 双击 `green-autostart.bat` —— 拉起本地服务 + Lively + 键盘监听
2. Lively 里选「添加壁纸 → 浏览」，指向本目录的 `wallpaper.html`
3. 打开面板：点宠物，或直接访问 <http://127.0.0.1:8765>

想把壁纸库副本也一起更新，改完文件后拷 `wallpaper.html / wallpaper.js / pet3d.js / perf.js / dayring.js`
到 Lively 的 `Library/wallpapers/<你的壁纸目录>/`，然后重启 Lively。

---

## 架构

**壁纸（Lively 里跑的那一套）**

| 文件 | 作用 |
|---|---|
| `wallpaper.html` | 场景与全部 CSS（灯光、键盘、对话框、屏幕、署名） |
| `wallpaper.js` | 键盘跟随、长轮询、对话框、曲目牌、属性绘制 |
| `pet3d.js` | 3D 宠物：建模、材质、弹簧动画、踩键 IK |
| `dayring.js` | 今日之环（24 小时日轨） |
| `perf.js` | 性能闸门：猴补 `setInterval`/`requestAnimationFrame`，页面隐藏即跳过 |
| `theme.js` | 主题与配色 |

**面板（点宠物打开）**

`index.html` / `style.css` / `app.js` / `motion.js`（物理弹簧）/ `states.js` / `deck.js` /
`fx.js` / `ui-extras.js` / `cmdk.js` / `atmosphere.js` / `sprite.js` / `about.js`

**服务端**

- `server.js` —— Node 零依赖，默认 `127.0.0.1:8765`（`PORT` 可覆盖）
- `_keywatch.ps1` —— 键盘监听，每 24ms 轮询 `GetAsyncKeyState`，90ms 批量上报
- `note.html` —— 「记一笔」小窗
- `_watchdog.ps1` + `_watchdog.vbs` —— 每 10 分钟自检，缺哪个补哪个

**其他**

- `vendor/three.min.js` —— three.js r160（UMD，为了能在 `file://` 下跑，本地离线）
- `assets/` —— 舞台素材的目录结构与清单（图片、歌词需自备）
- `state.example.json` —— 状态数据模板；复制成 `state.json` 后服务端会读写它
- 「今日简讯」是**可选**功能：默认读本目录的 `briefs.json`，也可以把 `GREEN_BRIEFS`
  环境变量指向你自己的情报 JSON。没有这个文件时该面板显示空。

---

## 性能设计

这个项目对「流畅」是较真的，几条实测结论：

- **长轮询，不是定时轮询。** 按键事件由服务端推送。原来客户端每 420ms 问一次，
  加上键盘监听的 24ms 采样 + 90ms 批量，最坏情况按下一个键要 ~530ms 宠物才动。
  现在**实测 11ms**，而且空闲时一个请求都不发。
- **空闲即停。** 跟随鼠标的灯光循环加了死区，收敛后直接退出 rAF，`pointermove` 再唤醒。
- **热路径零 layout。** 键盘几何在构建时算一次存好，按键时纯查表 ——
  不再每次按键调 `getBoundingClientRect()` 强制同步布局。
- **只动画 transform。** 所有过场用物理弹簧或 `transform`，不做触发布局重算的属性动画。

## 隐私设计（故意的，请不要"优化"掉）

- 服务只监听 `127.0.0.1`，不暴露到局域网
- **键盘监听只收虚拟键码，永不解析成字符**；Shift / CapsLock 状态不参与，还原不出你打了什么
- 按键**只在内存里保留「最后一个键 + 计数」**，服务器一重启就没了，绝不落盘
- **刻意不用低级键鼠 Hook** —— 那是杀软的高危行为。轮询 `GetAsyncKeyState` 足够用
- API key 不落代码：只存在 `api-key.txt`（已 gitignore）或 DSH settings
- 已 gitignore：`log.jsonl`、`ledger.jsonl`、`api-key.txt`、`webview2-data/`、`sense-state.json`、`sense-history.json`、`state.json`

## 关于图片与歌词

仓库**不附带**任何音乐人照片与歌词文件 —— 它们有版权，也不该由这个项目分发。
`assets/artists.json` 只是清单，`assets/<id>/` 下每个目录的 `README.txt` 写了该放几张、
放哪几张。要用舞台背景，把你自己合法持有的图片按 `assets/<id>/1.jpg`、`2.jpg` …
放进去，歌词放 `lyrics.txt` 即可，代码会自动读取。

## 数据都放在哪

- `state.json` —— 唯一的持久化状态（XP、精力、待办、每周自省）。第一次运行从
  `state.example.json` 复制一份即可，服务端只读写这一个文件
- `sense-state.json` / `sense-history.json` —— 「今天陪了你多久」的当日与历史统计
- `ledger.jsonl` / `log.jsonl` —— 账本与操作流水

这些都是**纯本地文件**，没有云端同步，删掉就等于重置。

## 路线图

- [ ] 宠物记忆（它记得你昨天说过什么）
- [ ] 面板「关于」页继续打磨
- [ ] 首次运行引导
- [ ] 课程表导入、多闹钟
- [ ] 睡眠趋势图、账本周月报表

## 项目规矩

1. **不要 emoji。** 所有图标自绘 SVG。
2. **验证优先于声称。** 每个「修好了」背后要么有探针输出，要么有截图，要么有日志。
3. **同名选择器残留比没有更危险。** 它只覆盖一部分属性，比完全没写更难查。
4. **不要用整文件读写去改大文件。** 已经因此截断过 5 次。

完整版本历史见 [CHANGELOG.md](CHANGELOG.md)。
