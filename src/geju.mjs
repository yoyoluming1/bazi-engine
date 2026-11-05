/**
 * 格局与用神。
 *
 * 这是命理里分歧最大的部分，所以设计上有三条纪律：
 *   1. 只实现一套判法：月令取格 + 扶抑用神（并在代码里写清楚）
 *   2. 每个结论都必须带 basis（推导链），不输出无来源的断言
 *   3. 不出现「注定/必然」这类措辞 —— 输出是推演，不是判决
 */
import { tenGod, GAN } from './bazi.mjs'

const GAN_ELEM = { 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水' }
const GENERATES = { 木:'火', 火:'土', 土:'金', 金:'水', 水:'木' }
const CONTROLS  = { 木:'土', 土:'水', 水:'火', 火:'金', 金:'木' }
/** 地支藏干 [本气,中气,余气]，与 bazi.mjs 同源 */
const HIDDEN = {
  子:['癸'], 丑:['己','癸','辛'], 寅:['甲','丙','戊'], 卯:['乙'],
  辰:['戊','乙','癸'], 巳:['丙','戊','庚'], 午:['丁','己'], 未:['己','丁','乙'],
  申:['庚','壬','戊'], 酉:['辛'], 戌:['戊','辛','丁'], 亥:['壬','甲'],
}
/** 十干的禄位（用于建禄/羊刃判定） */
const LU = { 甲:'寅', 乙:'卯', 丙:'巳', 丁:'午', 戊:'巳', 己:'午', 庚:'申', 辛:'酉', 壬:'亥', 癸:'子' }

/**
 * 月令取格。
 * 规则：月支本气与日干同类 → 建禄格（比肩）或羊刃格（劫财）；
 *       否则看月支藏干有没有透到年月时天干，透出者取那个十神为格；
 *       都不透则取月令本气十神为格（标明"本气格"）。
 */
export function findGeJu({ pillars, dayGan }) {
  const monthZhi = pillars[1].zhi
  const hidden = HIDDEN[monthZhi] || []
  const benQi = hidden[0]
  const dayElem = GAN_ELEM[dayGan]
  const basis = []

  // 同类：建禄 / 羊刃
  if (GAN_ELEM[benQi] === dayElem) {
    const same = GAN.indexOf(dayGan) % 2 === GAN.indexOf(benQi) % 2
    const name = LU[dayGan] === monthZhi && same ? '建禄格' : '羊刃格'
    basis.push(`月令${monthZhi}本气为${benQi}（${GAN_ELEM[benQi]}），与日干${dayGan}同类`)
    basis.push(`日干${dayGan}的禄在${LU[dayGan]}，月支${monthZhi}${LU[dayGan] === monthZhi ? '正是' : '不是'}禄位`)
    return { name, monthZhi, via: '月令本气', basis }
  }

  // 藏干透干
  const otherGans = [pillars[0].gan, pillars[2].gan, pillars[3].gan]
  const tou = hidden.find((g) => otherGans.includes(g))
  if (tou) {
    const god = tenGod(dayGan, tou)
    basis.push(`月令${monthZhi}藏干 ${hidden.join('、')}`)
    basis.push(`其中 ${tou} 透到天干（${otherGans.join('、')}）`)
    basis.push(`日干${dayGan}见${tou}为${god}，故取${god}格`)
    return { name: `${god}格`, monthZhi, via: `藏干${tou}透干`, basis }
  }

  const god = tenGod(dayGan, benQi)
  basis.push(`月令${monthZhi}藏干 ${hidden.join('、')} 均未透干`)
  basis.push(`取本气${benQi}所主之${god}为格（本气格）`)
  return { name: `${god}格`, monthZhi, via: '月令本气', basis }
}

/**
 * 扶抑用神：
 *   身偏强 → 喜「克我（官杀）/ 我克（财）/ 我生（食伤）」，忌「我（比劫）/ 生我（印）」
 *   身偏弱 → 喜「生我（印）/ 我（比劫）」，忌「克我 / 我克 / 我生」
 *   中和   → 喜「通关」：按盘中最弱的一环补
 * 优先级不是拍脑袋：同一档里挑**盘中有根（力量 > 0.5）**的，没有根的排后面。
 */
export function yongShen({ chart }) {
  const dayGan = chart.dayGan
  const me = GAN_ELEM[dayGan]
  const resource = Object.keys(GENERATES).find((k) => GENERATES[k] === me)  // 生我
  const output = GENERATES[me]        // 我生
  const wealth = CONTROLS[me]         // 我克
  const officer = Object.keys(CONTROLS).find((k) => CONTROLS[k] === me)     // 克我

  const score = chart.score
  const hasRoot = (e) => (score[e] ?? 0) > 0.5
  const basis = []
  let xi = []   // 喜
  let ji = []   // 忌

  if (chart.strength.grade === '偏强') {
    xi = [officer, wealth, output].filter(Boolean)
    ji = [me, resource]
    basis.push(`身偏强（帮扶占 ${(chart.strength.ratio * 100).toFixed(1)}%）→ 宜泄宜克，不宜再扶`)
    basis.push(`方向：官杀(${officer}) 克身、财(${wealth}) 耗身、食伤(${output}) 泄身`)
  } else if (chart.strength.grade === '偏弱') {
    xi = [resource, me]
    ji = [officer, wealth, output].filter(Boolean)
    basis.push(`身偏弱（帮扶仅占 ${(chart.strength.ratio * 100).toFixed(1)}%）→ 宜生宜扶`)
    basis.push(`方向：印(${resource}) 生身、比劫(${me}) 帮身`)
  } else {
    const weakest = Object.entries(score).sort((a, b) => a[1] - b[1])[0][0]
    xi = [weakest]
    ji = []
    basis.push(`身中和（帮扶 ${(chart.strength.ratio * 100).toFixed(1)}%）→ 走通关路线`)
    basis.push(`盘中最弱为${weakest}（${score[weakest]}），补之使五行流行`)
  }

  // 排序：有根者优先
  const primary = xi.filter(hasRoot)
  const ordered = [...primary, ...xi.filter((e) => !primary.includes(e))]
  for (const e of ordered) {
    basis.push(`${e}：${hasRoot(e) ? `盘中有力（${score[e]}），可用` : `盘中无根（${score[e]}），力弱`}`)
  }
  basis.push(`忌：${ji.join('、')}${ji.length ? '（已足，再叠则失衡）' : ''}`)

  return { xi: ordered, ji, primary: ordered[0] ?? null, basis }
}

/** 把格局与用神合成一段「可解释的结论」 */
export function analyze(chart) {
  const geju = findGeJu({ pillars: chart.pillars, dayGan: chart.dayGan })
  const ys = yongShen({ chart })
  return { geju, yongShen: ys }
}
