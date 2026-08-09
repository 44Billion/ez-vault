// src/helpers/dom.js
function injectComponentStyles(id, css) {
  const elementId = `styles-${id}`;
  if (document.getElementById(elementId)) return;
  const style = document.createElement("style");
  style.id = elementId;
  style.textContent = css;
  document.head.appendChild(style);
}
function waitForFocus(registerCancel) {
  if (document.hasFocus()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    const onChange = () => {
      if (document.hasFocus()) finish();
    };
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onChange);
    registerCancel?.(finish);
  });
}

export {
  injectComponentStyles,
  waitForFocus
};
