import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from './server.mjs'
import { writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 假的 dsh：输出一行 session + 一行 final */
function fakeDsh(dir) {
  const p = join(dir, `fake-dsh-${Math.random().toString(16).slice(2)}`)
  writeFileSync(p, '#!/bin/bash\necho \'{"type":"session","sessionId":"sess-test"}\'\necho \'{"type":"final","text":"假回复"}\'\n')
  chmodSync(p, 0o755)
  return p
}

async function start(overrides = {}) {
  const cfg = {
    accessCode: 'k',
    rateLimitPerMinute: 3,
    dsh: { bin: fakeDsh(tmpdir()), profile: 't', cwd: tmpdir(), timeoutMs: 5000, env: {} },
    ...overrides,
  }
  const server = createApp(cfg)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  return { server, base, close: () => new Promise((r) => server.close(r)) }
}

test('没有访问码：页面与接口都拒绝', async () => {
  const s = await start()
  assert.equal((await fetch(s.base + '/')).status, 403)
  assert.equal((await fetch(s.base + '/api/chat', { method: 'POST', body: '{}' })).status, 403)
  await s.close()
})

test('带访问码：能拿到页面，聊天返回模型输出', async () => {
  const s = await start()
  const page = await fetch(s.base + '/?code=k')
  assert.equal(page.status, 200)
  assert.match(await page.text(), /看个盘/)

  const res = await fetch(s.base + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'code=k' },
    body: JSON.stringify({ message: '1993年3月15日早上8点20，北京' }),
  })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).reply, '假回复')
  await s.close()
})

test('空消息与超长消息被拒绝', async () => {
  const s = await start()
  const post = (body) => fetch(s.base + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'code=k' },
    body,
  })
  assert.equal((await post(JSON.stringify({ message: '   ' }))).status, 400)
  assert.equal((await post(JSON.stringify({ message: 'x'.repeat(2001) }))).status, 400)
  await s.close()
})

test('限流：超过每分钟上限返回 429，且提示里带配置值', async () => {
  const s = await start({ rateLimitPerMinute: 2 })
  const post = () => fetch(s.base + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'code=k' },
    body: JSON.stringify({ message: 'hi' }),
  })
  assert.equal((await post()).status, 200)
  assert.equal((await post()).status, 200)
  const third = await post()
  assert.equal(third.status, 429)
  assert.match((await third.json()).error, /每分钟最多 2 条/)
  await s.close()
})

test('健康检查不需要访问码', async () => {
  const s = await start()
  assert.equal((await fetch(s.base + '/api/health')).status, 200)
  await s.close()
})
