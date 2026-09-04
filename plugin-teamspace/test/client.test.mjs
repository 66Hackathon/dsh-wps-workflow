/**
 * Smoke test for TeamSpaceClient without a live server (mock fetch).
 * Run: node --test test/client.test.mjs
 */
import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { TeamSpaceClient } from '../src/client.js'

describe('TeamSpaceClient', () => {
  it('autoDevLogin then GET /api/projects', async () => {
    const calls = []
    const original = globalThis.fetch
    globalThis.fetch = mock.fn(async (url, init) => {
      const href = String(url)
      calls.push({ href, method: init?.method || 'GET', auth: init?.headers?.Authorization })
      if (href.endsWith('/api/auth/dev-login')) {
        return new Response(JSON.stringify({ token: 'tok-1', user: { id: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (href.endsWith('/api/projects')) {
        assert.equal(init.headers.Authorization, 'Bearer tok-1')
        return new Response(JSON.stringify({ items: [{ id: 1, name: 'Demo' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('not found', { status: 404 })
    })

    try {
      const client = new TeamSpaceClient({
        baseUrl: 'http://127.0.0.1:8090',
        token: '',
        autoDevLogin: true,
        devUserId: 1,
      })
      const data = await client.get('/api/projects')
      assert.equal(data.items[0].name, 'Demo')
      assert.equal(calls.length, 2)
      assert.match(calls[0].href, /\/api\/auth\/dev-login$/)
      assert.equal(calls[0].method, 'POST')
    } finally {
      globalThis.fetch = original
    }
  })

  it('uses configured token without login', async () => {
    const original = globalThis.fetch
    globalThis.fetch = mock.fn(async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer ready')
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    try {
      const client = new TeamSpaceClient({
        baseUrl: 'http://example.test',
        token: 'ready',
        autoDevLogin: false,
      })
      const data = await client.get('/api/workspace')
      assert.deepEqual(data, { ok: true })
      assert.equal(globalThis.fetch.mock.callCount(), 1)
    } finally {
      globalThis.fetch = original
    }
  })
})
