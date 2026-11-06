#!/usr/bin/env node
/** 用法: node cli.mjs 1993-03-15 08:20 [经度=116.4] */
import { chart } from './src/bazi.mjs'
import { luck, liuNian } from './src/luck.mjs'
import { analyze } from './src/geju.mjs'
import { relationsWith } from './src/relations.mjs'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const [date, time, lonArg] = args.filter((a) => !a.startsWith('--'))
const gender = flags.has('--female') ? 'female' : 'male'
if (!date || !time) {
  console.error('用法: node cli.mjs <YYYY-MM-DD> <HH:mm> [经度]')
  process.exit(1)
}
const c = chart({ date, time, longitude: Number(lonArg ?? 116.4) })
const pad = (s, n) => String(s).padEnd(n, '　')

console.log(`\n输入      ${date} ${time}  经度 ${c.input.longitude}°E`)
if (c.solarTimeAdjust) {
  const a = c.solarTimeAdjust
  console.log(`真太阳时  修正 ${a.minutes} 分钟（经度 ${a.breakdown.longitude} + 均时差 ${a.breakdown.eot}）`)
  const t = c.effectiveTime
  console.log(`          → ${t.y}-${String(t.m).padStart(2,'0')}-${String(t.d).padStart(2,'0')} ${String(t.hh).padStart(2,'0')}:${String(t.mm).padStart(2,'0')}`)
}
console.log(`\n八字      ${c.baZi}`)
console.log(`日主      ${c.dayGan}（${c.dayElement}）\n`)

console.log('柱  干支  十神   藏干')
for (const p of c.pillars) {
  const hidden = p.zhiHidden.map((h) => `${h.gan}(${h.tenGod})`).join(' ')
  console.log(`${pad(p.name,4)}${pad(p.gan + p.zhi,6)}${pad(p.ganTenGod,7)}${hidden}`)
}

console.log('\n五行力量')
const total = Object.values(c.score).reduce((a, b) => a + b, 0)
for (const [k, v] of Object.entries(c.score)) {
  const bar = '█'.repeat(Math.round((v / total) * 30))
  console.log(`  ${k} ${String(v).padStart(5)}  ${bar}`)
}

const s = c.strength
console.log(`\n身强弱    ${s.grade}（帮扶 ${s.support} / 总 ${s.total} = ${(s.ratio * 100).toFixed(1)}%）`)
console.log(`判断依据  比劫+印 占总量 ${(s.ratio * 100).toFixed(1)}%，月令加权已计入`)

const a = analyze(c)
const l = luck({ chart: c, gender })
const thisYear = new Date().getFullYear()
if (a.tiaohou?.available) {
  const t = a.tiaohou
  console.log(`\n调候      主用 ${t.main}（${t.mainElement}）${t.assist.length ? `，辅 ${t.assist.join('、')}` : ''}｜${t.season}`)
  for (const b of t.basis) console.log(`  · ${b}`)
} else {
  console.log(`\n调候      ${a.tiaohou?.reason ?? '未计算'}`)
}

console.log(`\n大运      ${gender === 'male' ? '男' : '女'}命，${l.forward ? '顺行' : '逆行'}，${l.qiYun.text}`)
console.log('  起始年  年龄  干支  十神')
for (const d of l.daYun) {
  const now = d.startYear <= thisYear && thisYear < d.startYear + 10 ? ' ← 当前' : ''
  console.log(`  ${d.startYear}    ${String(d.startAge).padStart(2)} 岁  ${d.ganZhi}   ${d.ganTenGod}${now}`)
}
const ln = liuNian({ chart: c, year: thisYear })
console.log(`\n流年      ${thisYear} 年 ${ln.ganZhi}（${ln.ganTenGod}）`)

console.log(`\n格局      ${a.geju.name}（取法：${a.geju.via}）`)
for (const b of a.geju.basis) console.log(`  · ${b}`)
console.log(`\n用神      喜 ${a.yongShen.xi.join('、')}｜第一用神 ${a.yongShen.primary}｜忌 ${a.yongShen.ji.join('、') || '无'}`)
for (const b of a.yongShen.basis) console.log(`  · ${b}`)
if (a.relations.length) {
  console.log('\n地支关系')
  for (const r of a.relations) console.log(`  ${r.type}  ${r.pairs.map((x) => x.pos + x.zhi).join(' ')}  ${r.detail}`)
} else {
  console.log('\n地支关系  无')
}
const lr = relationsWith(c.pillars, ln.zhi, '流年')
if (lr.length) {
  console.log(`\n流年 ${ln.ganZhi} 与原局`)
  for (const r of lr) console.log(`  ${r.type}  ${r.pairs.map((x) => x.pos + x.zhi).join(' ')}`)
}
console.log('')
