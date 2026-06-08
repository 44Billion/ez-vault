import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNT_NAME_COLORS,
  ACCOUNT_NAME_NATURE,
  randomAccountName
} from '../docs/services/account-names.js'
import { profileEventTemplate } from '../docs/helpers/nostr/index.js'

test('randomAccountName returns a color and nature combination', () => {
  const name = randomAccountName()
  const [color, nature] = name.split(' ')
  assert.ok(ACCOUNT_NAME_COLORS.includes(color))
  assert.ok(ACCOUNT_NAME_NATURE.includes(nature))
})

test('randomAccountName avoids returning the previous combination', () => {
  const previous = `${ACCOUNT_NAME_COLORS[0]} ${ACCOUNT_NAME_NATURE[0]}`
  assert.notEqual(randomAccountName(previous), previous)
})

test('profileEventTemplate writes name and picture content and tags', () => {
  const event = profileEventTemplate({
    name: 'Azure Ember',
    picture: 'data:image/png;base64,avatar'
  })

  assert.equal(event.kind, 0)
  assert.equal(event.content, JSON.stringify({
    name: 'Azure Ember',
    picture: 'data:image/png;base64,avatar'
  }))
  assert.deepEqual(event.tags, [
    ['name', 'Azure Ember'],
    ['picture', 'data:image/png;base64,avatar']
  ])
})

test('profileEventTemplate preserves unrelated profile metadata', () => {
  const prior = {
    kind: 0,
    content: JSON.stringify({
      name: 'Old Name',
      about: 'kept',
      lud16: 'user@example.test'
    }),
    tags: [
      ['name', 'Old Name'],
      ['picture', 'old-picture'],
      ['alt', 'profile metadata']
    ]
  }

  const event = profileEventTemplate({
    name: 'Ruby Tide',
    picture: 'new-picture',
    profileEvent: prior
  })

  assert.deepEqual(JSON.parse(event.content), {
    name: 'Ruby Tide',
    about: 'kept',
    lud16: 'user@example.test',
    picture: 'new-picture'
  })
  assert.deepEqual(event.tags, [
    ['alt', 'profile metadata'],
    ['name', 'Ruby Tide'],
    ['picture', 'new-picture']
  ])
})
