// Idempotently inject a <style> tag for a component's CSS.
// Safe to call from every connectedCallback: subsequent calls with the same
// id are no-ops.
export function injectComponentStyles (id, css) {
  const elementId = `styles-${id}`
  if (document.getElementById(elementId)) return
  const style = document.createElement('style')
  style.id = elementId
  style.textContent = css
  document.head.appendChild(style)
}

// Resolves once the document is focused. No-op when it already is.
// Both focus and visibilitychange feed the same check because focus alone
// is enough on a tab the user just clicked and a visibility flip without
// focus (e.g. Alt+Tab into the window without giving the document focus)
// isn't. Used to gate APIs that throw "document is not focused" — WebAuthn
// create/get and navigator.clipboard.writeText — when control returns from
// a dialog or another tab.
//
// `registerCancel`, if given, is invoked synchronously with a cancel
// function that resolves the wait early (the caller checks its own
// "aborted" state after the await returns).
export function waitForFocus (registerCancel) {
  if (document.hasFocus()) return Promise.resolve()
  return new Promise(resolve => {
    const finish = () => {
      window.removeEventListener('focus', onChange)
      document.removeEventListener('visibilitychange', onChange)
      resolve()
    }
    const onChange = () => { if (document.hasFocus()) finish() }
    window.addEventListener('focus', onChange)
    document.addEventListener('visibilitychange', onChange)
    registerCancel?.(finish)
  })
}
