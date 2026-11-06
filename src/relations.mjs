/**
 * 地支关系：六合、六冲、三合、三会、相刑、六害。
 *
 * 只处理**地支之间**的关系（天干五合另说），因为这是判断「流年/大运碰到原局哪一柱」的基础。
 * 关系表是确定的，没有流派分歧；分歧在「合化与否」—— 这里只标出关系存在，
 * 不断言是否化（化不化还要看透干与月令，属于下一层）。
 */

const POS = ['年', '月', '日', '时']

/** 六合（地支相合） */
const LIU_HE = {
  子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯',
  辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午',
}
/** 六冲 */
const LIU_CHONG = {
  子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅',
  卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳',
}
/** 六害 */
const LIU_HAI = {
  子: '未', 未: '子', 丑: '午', 午: '丑', 寅: '巳', 巳: '寅',
  卯: '辰', 辰: '卯', 申: '亥', 亥: '申', 酉: '戌', 戌: '酉',
}
/** 三合局：三支齐则合化一方 */
const SAN_HE = [
  { zhi: ['申', '子', '辰'], elem: '水' },
  { zhi: ['亥', '卯', '未'], elem: '木' },
  { zhi: ['寅', '午', '戌'], elem: '火' },
  { zhi: ['巳', '酉', '丑'], elem: '金' },
]
/** 三会方：方位之气 */
const SAN_HUI = [
  { zhi: ['寅', '卯', '辰'], elem: '木' },
  { zhi: ['巳', '午', '未'], elem: '火' },
  { zhi: ['申', '酉', '戌'], elem: '金' },
  { zhi: ['亥', '子', '丑'], elem: '水' },
]
/** 三刑 + 自刑 */
const XING = [
  { zhi: ['子', '卯'], name: '无礼之刑' },
  { zhi: ['寅', '巳', '申'], name: '无恩之刑' },
  { zhi: ['丑', '戌', '未'], name: '恃势之刑' },
]
const SELF_XING = ['辰', '午', '酉', '亥']

/** 找出所有地支两两关系 */
export function findRelations(pillars) {
  // 保留调用方传来的自定义位置标签（如「流年」「大运」），没有才用默认柱名
  const items = pillars.map((p, i) => ({ pos: p.pos ?? POS[i], zhi: p.zhi }))
  const out = []
  const seen = new Set()
  const push = (type, pairs, detail) => {
    const key = `${type}:${pairs.map((p) => p.pos + p.zhi).join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ type, pairs, detail })
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]
      if (LIU_HE[a.zhi] === b.zhi) push('六合', [a, b], `${a.zhi}${b.zhi}合`)
      if (LIU_CHONG[a.zhi] === b.zhi) push('六冲', [a, b], `${a.zhi}${b.zhi}冲`)
      if (LIU_HAI[a.zhi] === b.zhi) push('六害', [a, b], `${a.zhi}${b.zhi}害`)
    }
  }

  // 三合 / 三会：需要三支都出现在四柱里
  for (const g of [...SAN_HE, ...SAN_HUI]) {
    const hits = g.zhi.map((z) => items.find((it) => it.zhi === z)).filter(Boolean)
    if (hits.length === 3) {
      const type = SAN_HE.includes(g) ? '三合' : '三会'
      push(type, hits, `${g.zhi.join('')}${type === '三合' ? '合化' : '会方'}${g.elem}`)
    }
  }

  // 刑：两支型、三支型、自刑
  for (const x of XING) {
    const hits = x.zhi.map((z) => items.find((it) => it.zhi === z)).filter(Boolean)
    if (hits.length === x.zhi.length) push('相刑', hits, `${x.name}（${x.zhi.join('')}）`)
  }
  for (const z of SELF_XING) {
    const hits = items.filter((it) => it.zhi === z)
    if (hits.length >= 2) push('自刑', hits.slice(0, 2), `${z}${z}自刑`)
  }

  return out
}

/** 某一年/某一大运与命局的关系（流年看的是「碰到哪一柱」） */
export function relationsWith(pillars, extra, label = '流年') {
  const base = pillars.map((p, i) => ({ pos: POS[i], zhi: p.zhi }))
  const target = base.map((p) => ({ ...p }))
  target.push({ pos: label, zhi: extra })
  return findRelations(target).filter((r) => r.pairs.some((p) => p.pos === label))
}
