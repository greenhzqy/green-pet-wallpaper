/* ============================================================
   Green · 关于面板  about.js   （v1.0）
   顶栏署名 / 页脚版本号点开的一份"作品说明"。
   这里只管三件事：开、关、把焦点还回去。
   启动动画全在 CSS —— .about-boot 的 keyframes 靠 display
   从 none 变回来重播，JS 不碰时间轴（改了会闪）。
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const modal = $("about-modal");
  const opener = $("maker-mark");
  if (!modal || !opener) return;

  const closeBtn = $("about-close");
  const doneBtn = $("about-done");
  const box = modal.querySelector(".modal-box");

  let lastFocus = null;
  const isOpen = () => !modal.classList.contains("hidden");

  function open() {
    if (isOpen()) return;
    lastFocus = document.activeElement;
    modal.classList.remove("hidden");
    // 焦点进面板：先落在关闭键上，读屏会念 aria-label
    if (closeBtn) closeBtn.focus();
    else if (box) { box.setAttribute("tabindex", "-1"); box.focus(); }
  }

  function close() {
    if (!isOpen()) return;
    modal.classList.add("hidden");
    const back = lastFocus && document.contains(lastFocus) ? lastFocus : opener;
    try { back.focus(); } catch (e) { /* 元素已不在，忽略 */ }
    lastFocus = null;
  }

  /* ---------- 开：署名 / 页脚版本号 / 关闭键 / 遮罩 ---------- */
  opener.addEventListener("click", (e) => { e.preventDefault(); open(); });
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (doneBtn) doneBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  /* ---------- Esc：只关最上面这一层 ----------
     捕获阶段拦下 —— 否则 sprite.js 的全局 Esc 会顺手把右栏抽屉也关了。 */
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }, true);

  /* ---------- Tab 在面板里循环，不跑到背后的界面 ---------- */
  addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !isOpen() || !box) return;
    const all = box.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    const list = Array.prototype.filter.call(all, (el) => !el.disabled && el.offsetParent !== null);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1], act = document.activeElement;
    if (e.shiftKey) {
      if (act === first || !modal.contains(act)) { e.preventDefault(); last.focus(); }
    } else if (act === last || !modal.contains(act)) {
      e.preventDefault(); first.focus();
    }
  });

  window.About = { open, close };
})();
