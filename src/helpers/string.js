export function getRandomId () {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

export function shortId (value, length = 5) {
  return String(value).slice(0, length)
}
