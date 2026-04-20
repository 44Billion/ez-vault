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
