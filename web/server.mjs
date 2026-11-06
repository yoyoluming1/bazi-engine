/**
 * 命理 bot 的网页入口。
 *
 * 设计：
 *   · 不依赖任何第三方包（Node 内置 http），一个文件跑起来
 *   · 每个浏览器一个 sid（cookie），映射到一个 DSH 会话，聊天有上下文
 *   · 同一个 sid 的请求串行处理：DSH 是「一次调用一轮」，并发会互相踩
 *   · 访问码 + 每 IP 限流：公网裸奔至少要有一道门
 *   · createApp(cfg) 返回 server，不自动监听 —— 测试可以随便起临时端口
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const HERE = dirname(fileURLToPath(import.meta.url))

export function createApp(cfg) {
  const PAGE = readFileSync(join(HERE, 'index.html'), 'utf8')
  const sessions = new Map() // sid -> { dshSessionId, lastSeen, queue }
  const hits = new Map()     // ip -> [timestamps]

  const json = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(obj))
  }

  function parseCookies(req) {
    const out = {}
    for (const part of (req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=')
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    }
    return out
  }

  const allowed = (req, url) => {
    if (!cfg.accessCode) return true
    if (parseCookies(req).code === cfg.accessCode) return true
    return url.searchParams.get('code') === cfg.accessCode
  }

  function rateLimited(ip) {
    const now = Date.now()
    const max = cfg.rateLimitPerMinute ?? 6
    const list = (hits.get(ip) || []).filter((t) => now - t < 60_000)
    if (list.length >= max) {
      hits.set(ip, list)
      return true
    }
    list.push(now)
    hits.set(ip, list)
    return false
  }

  /** 调一轮 DSH，解析 NDJSON，返回最终文本 */
  function runTurn({ sessionId, text }) {
    return new Promise((resolve) => {
      const args = ['--profile', cfg.dsh.profile, '--json']
      if (sessionId) args.push('--session-id', sessionId)
      args.push(text)

      const child = spawn(cfg.dsh.bin || 'dsh', args, {
        cwd: cfg.dsh.cwd,
        env: { ...process.env, ...(cfg.dsh.env || {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let out = ''
      let err = ''
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        resolve({ ok: false, error: '超时（模型没在限定时间内答完）' })
      }, cfg.dsh.timeoutMs ?? 180_000)

      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (err += d))
      child.on('error', (e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ok: false, error: String(e?.message || e) })
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        let sid = sessionId || ''
        let final = ''
        let lastError = ''
        for (const line of out.split('\n')) {
          const s = line.trim()
          if (!s) continue
          let ev
          try { ev = JSON.parse(s) } catch { continue }
          if (ev.type === 'session' && ev.sessionId) sid = ev.sessionId
          else if (ev.type === 'final' && typeof ev.text === 'string') final = ev.text
          else if (ev.type === 'error') lastError = ev.message || JSON.stringify(ev)
        }
        if (code !== 0 || !final) {
          console.error('[dsh] failed', code, lastError, String(err).slice(0, 200))
          resolve({ ok: false, error: lastError || `dsh 退出码 ${code}` })
          return
        }
        resolve({ ok: true, text: final.trim(), sessionId: sid })
      })
    })
  }

  function readBody(req, limit = 20_000) {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
        if (data.length > limit) {
          reject(new Error('消息太长了'))
          req.destroy()
        }
      })
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const ip = req.socket.remoteAddress || 'unknown'

    if (url.pathname === '/api/health') return json(res, 200, { ok: true })

    if (!allowed(req, url)) {
      if (url.pathname === '/') {
        res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<meta charset="utf-8"><body style="font-family:system-ui;padding:40px">需要访问码：在网址后面加 <code>?code=你的访问码</code></body>')
        return
      }
      return json(res, 403, { error: '需要访问码' })
    }

    if (cfg.accessCode && url.searchParams.get('code') === cfg.accessCode) {
      res.setHeader('set-cookie', `code=${encodeURIComponent(cfg.accessCode)}; Path=/; Max-Age=2592000; SameSite=Lax`)
    }

    if (req.method === 'GET' && url.pathname === '/') {
      // 不缓存：改版后刷新就能看到，不用教用户清缓存
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, must-revalidate',
      })
      res.end(PAGE)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      let payload
      try {
        payload = JSON.parse(await readBody(req))
      } catch (e) {
        return json(res, 400, { error: String(e.message || e) })
      }
      const message = String(payload?.message || '').trim()
      if (!message) return json(res, 400, { error: '消息不能为空' })
      if (message.length > 2000) return json(res, 400, { error: '消息太长了（最多 2000 字）' })
      if (rateLimited(ip)) {
        return json(res, 429, { error: `说得太快了，缓一缓（每分钟最多 ${cfg.rateLimitPerMinute ?? 6} 条）` })
      }

      const cookies = parseCookies(req)
      let sid = cookies.sid
      if (!sid || !/^[0-9a-f-]{36}$/.test(sid)) {
        sid = randomUUID()
        const prev = res.getHeader('set-cookie')
        const list = prev === undefined ? [] : [prev].flat()
        list.push(`sid=${sid}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`)
        res.setHeader('set-cookie', list)
      }
      const entry = sessions.get(sid) || { dshSessionId: '', lastSeen: Date.now(), queue: Promise.resolve() }
      entry.lastSeen = Date.now()
      sessions.set(sid, entry)

      // 同一会话串行：DSH 一次调用就是一轮，并发会互相踩
      const run = entry.queue.then(async () => {
        const r = await runTurn({ sessionId: entry.dshSessionId, text: message })
        if (r.ok) entry.dshSessionId = r.sessionId || entry.dshSessionId
        return r
      })
      entry.queue = run.catch(() => {})

      const result = await run
      if (!result.ok) return json(res, 502, { error: result.error || '出错了' })
      return json(res, 200, { reply: result.text })
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  })

  // 过期会话清理
  setInterval(() => {
    const now = Date.now()
    for (const [sid, s] of sessions) if (now - s.lastSeen > 6 * 3600_000) sessions.delete(sid)
  }, 3600_000).unref()

  return server
}

// 直接运行时才读配置并监听
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'))
  const port = cfg.port ?? 8080
  const host = cfg.host ?? '127.0.0.1'
  createApp(cfg).listen(port, host, () => {
    console.log(`[web] listening on http://${host}:${port}`)
    console.log(`[web] access code: ${cfg.accessCode ? '已设置' : '未设置（公网部署请务必设置）'}`)
  })
}
