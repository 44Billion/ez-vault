import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getSvgAvatar, seededAvatarDataUrl } from '../src/services/avatar.js'

describe('local avatars', () => {
  it('generates a circular Avataaars SVG without an HTTP request', (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', () => {
      throw new Error('unexpected HTTP request')
    })

    const svg = getSvgAvatar('alice')

    assert.match(svg, /^<svg /)
    assert.match(svg, /viewBox="0 0 280 280"/)
    assert.match(svg, /<mask /)
    assert.match(svg, /rx="140"/)
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it('is byte-deterministic for a given seed', () => {
    assert.equal(getSvgAvatar('same-seed'), getSvgAvatar('same-seed'))
    assert.notEqual(getSvgAvatar('first-seed'), getSvgAvatar('second-seed'))
  })

  it('returns a stable encoded data URL and shares generation by seed', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', () => {
      throw new Error('unexpected HTTP request')
    })

    const [first, second] = await Promise.all([
      seededAvatarDataUrl('shared-seed'),
      seededAvatarDataUrl('shared-seed')
    ])

    assert.equal(first, second)
    assert.match(first, /^data:image\/svg\+xml;charset=utf-8,%3Csvg/)
    assert.equal(fetchMock.mock.callCount(), 0)
  })
})
