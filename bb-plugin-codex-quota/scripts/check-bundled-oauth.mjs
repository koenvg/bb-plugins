import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Run against bb plugin build's actual self-contained host artifact. No real credentials or network.
const agentDir = mkdtempSync(join(tmpdir(), 'codex-quota-oauth-'))
const refresh = process.argv.includes('--refresh')
const access = 'synthetic-access-token-do-not-log'
const refreshedAccess = `e30.${Buffer.from(JSON.stringify({
  'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' },
})).toString('base64url')}.synthetic-signature`
const previousDir = process.env.PI_CODING_AGENT_DIR
const previousFetch = globalThis.fetch
try {
  writeFileSync(join(agentDir, 'auth.json'), JSON.stringify({
    'openai-codex': {
      type: 'oauth',
      access,
      refresh: 'synthetic-refresh-token',
      expires: Date.now() + (refresh ? 1000 : 3_600_000),
    },
  }), { mode: 0o600 })
  process.env.PI_CODING_AGENT_DIR = agentDir
  let quotaCalls = 0
  let refreshCalls = 0
  globalThis.fetch = async (url, init) => {
    if (url === 'https://auth.openai.com/oauth/token') {
      assert.equal(init?.method, 'POST')
      assert.equal(init?.body?.get('grant_type'), 'refresh_token')
      assert.equal(init?.body?.get('refresh_token'), 'synthetic-refresh-token')
      refreshCalls++
      return new Response(JSON.stringify({
        access_token: refreshedAccess, refresh_token: 'synthetic-rotated-refresh', expires_in: 3600,
      }))
    }
    assert.equal(url, 'https://chatgpt.com/backend-api/wham/usage')
    assert.equal(init?.method, 'GET')
    assert.equal(init?.headers?.Authorization, `Bearer ${refresh ? refreshedAccess : access}`)
    quotaCalls++
    return new Response(JSON.stringify({
      rate_limit: { primary_window: { used_percent: 20 } },
      rate_limit_reset_credits: { available_count: 0 },
    }))
  }
  const { default: entry } = await import('../dist/host.js')
  const result = await entry.handlers.quota({ refresh: false }, { signal: new AbortController().signal })
  if (result.state !== 'fresh') console.log('Synthetic failure:', result.reason, 'refresh calls:', refreshCalls, 'quota calls:', quotaCalls)
  assert.equal(result.state, 'fresh')
  assert.equal(result.snapshot?.general.length, 1)
  assert.equal(result.snapshot?.general[0]?.remainingPercent, 80)
  assert.equal(result.snapshot?.bankedResets, 0)
  assert.equal(quotaCalls, 1)
  assert.equal(refreshCalls, refresh ? 1 : 0)
  const stored = JSON.parse(readFileSync(join(agentDir, 'auth.json'), 'utf8'))['openai-codex']
  assert.equal(stored.access, refresh ? refreshedAccess : access)
  console.log(`Bundled OAuth ${refresh ? 'refresh' : 'fresh-token'} + bounded quota read: passed (synthetic)`)
} finally {
  if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR
  else process.env.PI_CODING_AGENT_DIR = previousDir
  globalThis.fetch = previousFetch
  rmSync(agentDir, { recursive: true, force: true })
}
