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

test('调候表：12 个月令 × 10 个日干，共 120 格，且全是合法天干', async () => {
  const { TIAOHOU } = await import('../src/tiaohou.mjs')
  const gans = new Set('甲乙丙丁戊己庚辛壬癸')
  assert.equal(Object.keys(TIAOHOU).length, 12)
  let cells = 0
  for (const [month, row] of Object.entries(TIAOHOU)) {
    assert.equal(Object.keys(row).length, 10, `${month} 月应覆盖 10 个日干`)
    for (const [day, val] of Object.entries(row)) {
      assert.ok(val.length >= 1, `${month}月${day}日为空`)
      for (const g of val) assert.ok(gans.has(g), `${month}月${day}日含非法天干 ${g}`)
      cells++
    }
  }
  assert.equal(cells, 120)
})

test('调候取用：甲木寅月取丙为先，丙火午月取壬为先，壬水子月取戊为先', async () => {
  const { TIAOHOU } = await import('../src/tiaohou.mjs')
  assert.equal(TIAOHOU.寅.甲[0], '丙')
  assert.equal(TIAOHOU.午.丙[0], '壬')
  assert.equal(TIAOHOU.子.壬[0], '戊')
  assert.equal(TIAOHOU.亥.癸[0], '庚')
})

test('调候输出：带季节、主用五行与推导依据', async () => {
  const { tiaohou } = await import('../src/tiaohou.mjs')
  const c = chart({ date: '1993-06-15', time: '12:00', longitude: 116.4 })
  const t = tiaohou({ chart: c })
  assert.equal(t.available, true)
  assert.equal(t.month, '午')
  assert.equal(t.main, '壬')
  assert.equal(t.mainElement, '水')
  assert.ok(t.basis.length >= 3)
  assert.match(t.basis[0], /仲夏/)
})

test('调候表未收录时明确说明，不编造', async () => {
  const { tiaohou } = await import('../src/tiaohou.mjs')
  const fake = { dayGan: '甲', pillars: [null, { zhi: 'X' }, null, null], score: {} }
  const t = tiaohou({ chart: fake })
  assert.equal(t.available, false)
  assert.match(t.reason, /未收录/)
})

test('地支关系：六合、六冲、六害各自成对', async () => {
  const { findRelations } = await import('../src/relations.mjs')
  const p = (a, b, c, d) => [{ zhi: a }, { zhi: b }, { zhi: c }, { zhi: d }]
  assert.ok(findRelations(p('子', '丑', '午', '酉')).some((r) => r.type === '六合'), '子丑合')
  assert.ok(findRelations(p('寅', '申', '子', '丑')).some((r) => r.type === '六冲'), '寅申冲')
  assert.ok(findRelations(p('子', '未', '午', '酉')).some((r) => r.type === '六害'), '子未害')
})

test('地支关系：三合局需要三支齐全', async () => {
  const { findRelations } = await import('../src/relations.mjs')
  const full = findRelations([{ zhi: '申' }, { zhi: '子' }, { zhi: '辰' }, { zhi: '酉' }])
  const half = findRelations([{ zhi: '申' }, { zhi: '子' }, { zhi: '午' }, { zhi: '酉' }])
  assert.ok(full.some((r) => r.type === '三合' && /水/.test(r.detail)))
  assert.ok(!half.some((r) => r.type === '三合'))
})

test('地支关系：三刑与自刑', async () => {
  const { findRelations } = await import('../src/relations.mjs')
  const sanxing = findRelations([{ zhi: '寅' }, { zhi: '巳' }, { zhi: '申' }, { zhi: '子' }])
  assert.ok(sanxing.some((r) => r.type === '相刑' && /无恩/.test(r.detail)))
  const self = findRelations([{ zhi: '辰' }, { zhi: '辰' }, { zhi: '午' }, { zhi: '酉' }])
  assert.ok(self.some((r) => r.type === '自刑'))
})

test('地支关系：流年/大运与原局的关系能定位到具体柱', async () => {
  const { relationsWith } = await import('../src/relations.mjs')
  const pillars = [{ zhi: '酉' }, { zhi: '卯' }, { zhi: '未' }, { zhi: '辰' }]
  const liu = relationsWith(pillars, '午', '流年')
  assert.ok(liu.length > 0)
  assert.ok(liu.every((r) => r.pairs.some((p) => p.pos === '流年')))
  assert.ok(liu.some((r) => r.type === '六合' && r.pairs.some((p) => p.zhi === '未')))
  const yun = relationsWith(pillars, '亥', '大运')
  assert.ok(yun.some((r) => r.type === '三合'))
})
