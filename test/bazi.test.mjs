import test from 'node:test'
import assert from 'node:assert/strict'
import { chart, tenGod, elementStrength, GAN } from '../src/bazi.mjs'
import { trueSolarTime, equationOfTime } from '../src/solar-time.mjs'

test('真太阳时：北京经度修正约 -14 分钟', () => {
  const r = trueSolarTime({ y: 1993, m: 3, d: 15, hh: 8, mm: 20, longitude: 116.4 })
  assert.ok(r.breakdown.longitude < -14 && r.breakdown.longitude > -15)
  assert.ok(Math.abs(r.breakdown.eot) < 17)
})

test('均时差在一年内不超过 ±17 分钟', () => {
  for (let d = 1; d <= 365; d += 7) {
    const v = equationOfTime(d)
    assert.ok(Math.abs(v) <= 17, `day ${d} => ${v}`)
  }
})

test('已知盘：1993-03-15 08:20 北京 → 癸酉 乙卯 乙未 庚辰', () => {
  const c = chart({ date: '1993-03-15', time: '08:20', longitude: 116.4 })
  assert.equal(c.baZi, '癸酉 乙卯 乙未 庚辰')
  assert.equal(c.dayGan, '乙')
})

test('真太阳时会跨时辰边界（09:05 → 辰时，而非巳时）', () => {
  const withFix = chart({ date: '1993-03-15', time: '09:05', longitude: 116.4 })
  const without = chart({ date: '1993-03-15', time: '09:05', longitude: 116.4, useTrueSolar: false })
  assert.equal(without.pillars[3].zhi, '巳')
  assert.equal(withFix.pillars[3].zhi, '辰')
  assert.notEqual(withFix.baZi, without.baZi, '修正前后时柱应当不同')
})

test('十神：乙日见庚为阳金 → 正官', () => {
  assert.equal(tenGod('乙', '庚'), '正官')
  assert.equal(tenGod('乙', '辛'), '七杀')   // 辛为阴金，同阴阳? 乙阴 辛阴 → 同 → 七杀
  assert.equal(tenGod('乙', '甲'), '劫财')   // 同为木，阴阳不同 → 劫财
  assert.equal(tenGod('乙', '乙'), '比肩')
})

test('五行力量总和守恒，月令有加成', () => {
  const c = chart({ date: '1993-03-15', time: '08:20', longitude: 116.4 })
  const total = Object.values(c.score).reduce((a, b) => a + b, 0)
  // 4 天干 + 4 地支藏干（月令 ×1.5）
  assert.ok(total > 9 && total < 13, `total ${total}`)
  assert.ok(c.strength.ratio > 0 && c.strength.ratio < 1)
})

test('非法干支组合不会被静默接受', () => {
  assert.throws(() => tenGod('甲', 'X'))
})

test('大运：阴年男命逆行，起运 3 年 1 月 20 天', async () => {
  const { luck } = await import('../src/luck.mjs')
  const c = chart({ date: '1993-03-15', time: '08:20', longitude: 116.4 })
  const l = luck({ chart: c, gender: 'male' })
  assert.equal(l.forward, false)            // 癸酉年，阴年男 → 逆行
  assert.equal(l.qiYun.years, 3)
  assert.equal(l.qiYun.months, 1)
  assert.equal(l.qiYun.days, 20)
  assert.equal(l.daYun[0].ganZhi, '甲寅')   // 乙卯 逆推一位
  // lunar-javascript 的 getDaYun 首项是「起运前」，过滤后剩 9 步正式大运
  assert.equal(l.daYun.length, 9)
})

test('大运：同一张盘，女命顺行，第一步是丙辰', async () => {
  const { luck } = await import('../src/luck.mjs')
  const c = chart({ date: '1993-03-15', time: '08:20', longitude: 116.4 })
  const l = luck({ chart: c, gender: 'female' })
  assert.equal(l.forward, true)             // 阴年女 → 顺行
  assert.equal(l.daYun[0].ganZhi, '丙辰')   // 乙卯 顺推一位
})

test('流年：2026 年是丙午', async () => {
  const { liuNian } = await import('../src/luck.mjs')
  const c = chart({ date: '1993-03-15', time: '08:20', longitude: 116.4 })
  const ln = liuNian({ chart: c, year: 2026 })
  assert.equal(ln.ganZhi, '丙午')
  assert.equal(ln.ganTenGod, '伤官')        // 乙日见丙（阳火）→ 伤官
})

test('取格：月令与日干同类 → 建禄格（乙日卯月）', async () => {
  const { findGeJu } = await import('../src/geju.mjs')
  const g = findGeJu({
    dayGan: '乙',
    pillars: [{ gan:'癸', zhi:'酉' }, { gan:'乙', zhi:'卯' }, { gan:'乙', zhi:'未' }, { gan:'庚', zhi:'辰' }],
  })
  assert.equal(g.name, '建禄格')
})

test('取格：甲日卯月 → 羊刃格（禄在寅不在卯）', async () => {
  const { findGeJu } = await import('../src/geju.mjs')
  const g = findGeJu({
    dayGan: '甲',
    pillars: [{ gan:'癸', zhi:'酉' }, { gan:'乙', zhi:'卯' }, { gan:'甲', zhi:'子' }, { gan:'庚', zhi:'辰' }],
  })
  assert.equal(g.name, '羊刃格')
})

test('取格：藏干透干优先于本气（戊日寅月见丙 → 偏印格）', async () => {
  const { findGeJu } = await import('../src/geju.mjs')
  const g = findGeJu({
    dayGan: '戊',
    pillars: [{ gan:'丙', zhi:'午' }, { gan:'甲', zhi:'寅' }, { gan:'戊', zhi:'申' }, { gan:'壬', zhi:'子' }],
  })
  assert.equal(g.name, '偏印格')
  assert.match(g.via, /透干/)
})

test('用神：身偏强喜克泄耗，忌比劫与印', async () => {
  const { analyze } = await import('../src/geju.mjs')
  const c = chart({ date: '1993-03-15', time: '08:20', longitude: 116.4 })
  const a = analyze(c)
  assert.equal(a.geju.name, '建禄格')
  assert.deepEqual(a.yongShen.xi.sort(), ['土', '火', '金'])
  assert.deepEqual(a.yongShen.ji.sort(), ['木', '水'])
  assert.equal(a.yongShen.primary, '金')
  assert.ok(a.yongShen.basis.length >= 3, '必须带推导根据')
})
