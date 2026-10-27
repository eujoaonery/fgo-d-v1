import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAllowedAvatarUrl } from './avatarUrl.js'

const supa = 'https://xyz.supabase.co'

describe('isAllowedAvatarUrl', () => {
  it('allows null', () => {
    assert.equal(isAllowedAvatarUrl(null, supa), true)
  })
  it('rejects javascript', () => {
    assert.equal(isAllowedAvatarUrl('javascript:alert(1)', supa), false)
  })
  it('allows public avatars path on project host', () => {
    assert.equal(
      isAllowedAvatarUrl(`${supa}/storage/v1/object/public/avatars/u1/x.png`, supa),
      true,
    )
  })
  it('rejects external host', () => {
    assert.equal(isAllowedAvatarUrl('https://evil.com/a.png', supa), false)
  })
  it('allows BFF proxy path', () => {
    assert.equal(isAllowedAvatarUrl('/api/public/avatars/u/avatar.jpg', supa), true)
  })
})
