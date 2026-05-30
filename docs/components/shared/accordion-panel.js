import { injectComponentStyles } from '../../helpers/dom.js'

const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6" /></svg>'
const ICON_ACTIVITY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8l0 4l2 2" /><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" /></svg>'
const ICON_DEVELOPMENT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l-4 4l4 4" /><path d="M17 8l4 4l-4 4" /><path d="M14 4l-4 16" /></svg>'

const ICONS = {
  activity: ICON_ACTIVITY,
  development: ICON_DEVELOPMENT
}

// Selectors are scoped to direct children (`>`) so styles for the wrapping
// <details>/<summary> don't leak onto unrelated <details>/<summary> elements
// rendered inside the panel body (e.g. activity-log's data-cell expander).
const STYLES = /* css */`
  accordion-panel {
    display: block;
  }
  accordion-panel > details {
    background-color: oklch(0.22 0 89.88);
    border-radius: 8px;
    overflow: hidden;
  }
  accordion-panel > details > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 14px;
    color: oklch(0.92 0 89.88);
    font-size: 14rem;
    font-weight: 600;
    user-select: none;
  }
  accordion-panel > details > summary::-webkit-details-marker {
    display: none;
  }
  accordion-panel > details > summary:active {
    background-color: oklch(0.28 0 89.88);
  }
  accordion-panel .accordion-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  accordion-panel .accordion-icon {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.82 0.11 274.76);
    background-color: oklch(0.28 0.08 274.76);
    flex: 0 0 auto;
  }
  accordion-panel .accordion-icon svg {
    width: 15px;
    height: 15px;
    display: block;
  }
  accordion-panel .accordion-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  accordion-panel > details > summary > .accordion-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 180ms ease-out;
  }
  accordion-panel > details > summary > .accordion-chevron svg {
    width: 18px;
    height: 18px;
    display: block;
  }
  accordion-panel > details[open] > summary > .accordion-chevron {
    transform: rotate(180deg);
  }
  accordion-panel > details > .accordion-body {
    padding: 0 14px 14px;
  }
`

export class AccordionPanel extends HTMLElement {
  connectedCallback () {
    injectComponentStyles('accordion-panel', STYLES)
    if (this.dataset.upgraded === 'true') return
    this.dataset.upgraded = 'true'

    const header = this.getAttribute('header') ?? ''
    const icon = ICONS[this.getAttribute('icon')] || ''
    const open = this.hasAttribute('open')
    const original = Array.from(this.childNodes)

    const details = document.createElement('details')
    if (open) details.open = true

    const summary = document.createElement('summary')
    const title = document.createElement('span')
    title.className = 'accordion-title'
    if (icon) {
      const iconWrap = document.createElement('span')
      iconWrap.className = 'accordion-icon'
      iconWrap.setAttribute('aria-hidden', 'true')
      iconWrap.innerHTML = icon
      title.append(iconWrap)
    }
    const label = document.createElement('span')
    label.className = 'accordion-label'
    label.textContent = header
    title.append(label)
    const chevron = document.createElement('span')
    chevron.className = 'accordion-chevron'
    chevron.setAttribute('aria-hidden', 'true')
    chevron.innerHTML = ICON_CHEVRON
    summary.append(title, chevron)

    const body = document.createElement('div')
    body.className = 'accordion-body'
    for (const node of original) body.appendChild(node)

    details.append(summary, body)
    this.appendChild(details)
  }
}

customElements.define('accordion-panel', AccordionPanel)
