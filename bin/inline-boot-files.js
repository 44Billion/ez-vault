import { readFile } from 'node:fs/promises'
import path from 'node:path'

// src/index.html keeps only marker comments for these boot blocks; bin/build.js
// replaces them with the authored files below so the deployed index.html stays
// fully self-contained — no extra boot-path requests that could fail during
// the exact incoherent-deploy scenario the failsafe exists for.

export const BOOT_CSS_MARKER = '<!-- inject:boot-failsafe-css -->'
export const BOOT_JS_MARKER = '<!-- inject:boot-failsafe-js -->'
export const SW_BOOTSTRAP_JS_MARKER = '<!-- inject:sw-bootstrap-js -->'

export function inlineBootFiles (indexHtml, { bootFailsafeCss, bootFailsafeJs, swBootstrapJs }) {
  let html = injectMarker(indexHtml, BOOT_CSS_MARKER, bootFailsafeCss, 'style')
  html = injectMarker(html, BOOT_JS_MARKER, bootFailsafeJs, 'script')
  html = injectMarker(html, SW_BOOTSTRAP_JS_MARKER, swBootstrapJs, 'script')
  return html
}

export async function loadBootFiles (srcDir) {
  return {
    bootFailsafeCss: await readFile(path.join(srcDir, 'boot-failsafe.css'), 'utf8'),
    bootFailsafeJs: await readFile(path.join(srcDir, 'boot-failsafe.js'), 'utf8'),
    swBootstrapJs: await readFile(path.join(srcDir, 'sw-bootstrap.js'), 'utf8')
  }
}

function injectMarker (html, marker, content, tag) {
  const lines = html.split('\n')
  const markerLineIndex = lines.findIndex(line => line.includes(marker))
  if (markerLineIndex === -1) {
    throw new Error(`Missing ${marker} marker in index.html`)
  }
  const indent = lines[markerLineIndex].match(/^\s*/)[0]
  const innerIndent = `${indent}  `
  const body = content.replace(/\n$/, '').replace(/\n/g, `\n${innerIndent}`)
  lines.splice(markerLineIndex, 1, `${indent}<${tag}>\n${innerIndent}${body}\n${indent}</${tag}>`)
  return lines.join('\n')
}
