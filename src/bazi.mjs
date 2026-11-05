/**
 * 八字排盘与力量分析。
 *
 * 分工：历法（节气交接、干支纪日）交给 lunar-javascript 保证正确性；
 * 这一层负责**它不给的部分**——真太阳时喂进去、五行力量自己算、十神标注、
 * 身强身弱给一个**可复现、可解释、可测试**的评分，而不是让模型自由心证。
 */
import pkg from 'lunar-javascript'
import { trueSolarTime } from './solar-time.mjs'

const { Solar } = pkg

export const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
export const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']

/** 天干五行 */
const GAN_ELEM = { 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水' }
/** 地支五行（本气） */
const ZHI_ELEM = { 子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水' }
/** 地支藏干 [本气, 中气, 余气] */
const HIDDEN = {
  子:['癸'], 丑:['己','癸','辛'], 寅:['甲','丙','戊'], 卯:['乙'],
  辰:['戊','乙','癸'], 巳:['丙','戊','庚'], 午:['丁','己'], 未:['己','丁','乙'],
  申:['庚','壬','戊'], 酉:['辛'], 戌:['戊','辛','丁'], 亥:['壬','甲'],
}
const HIDDEN_WEIGHT = [1.0, 0.5, 0.3]

const GENERATES = { 木:'火', 火:'土', 土:'金', 金:'水', 水:'木' }
const CONTROLS  = { 木:'土', 土:'水', 水:'火', 火:'金', 金:'木' }

const yang = (gan) => GAN.indexOf(gan) % 2 === 0

/** 十神：以日干为「我」 */
export function tenGod(dayGan, targetGan) {
  const me = GAN_ELEM[dayGan], other = GAN_ELEM[targetGan]
  const same = yang(dayGan) === yang(targetGan)
  if (me === other) return same ? '比肩' : '劫财'
  if (GENERATES[me] === other) return same ? '食神' : '伤官'
  if (CONTROLS[me] === other) return same ? '偏财' : '正财'
  if (CONTROLS[other] === me) return same ? '七杀' : '正官'
  if (GENERATES[other] === me) return same ? '偏印' : '正印'
  throw new Error('十神无法判定')
}

/**
 * 五行力量：天干各 1.0，地支按藏干加权（本气 1.0 / 中气 0.5 / 余气 0.3），月令加成 ×1.5。
 * 这套权重是**明写的假设**，不是玄学结论 —— 换权重就是换流派，改这里即可。
 */
export function elementStrength({ pillars, monthZhi }) {
  const score = { 木:0, 火:0, 土:0, 金:0, 水:0 }
  const add = (gan, w) => { score[GAN_ELEM[gan]] += w }

  for (const p of pillars) add(p.gan, 1.0)
  for (const p of pillars) {
    const hidden = HIDDEN[p.zhi] || []
    hidden.forEach((g, i) => {
      const w = HIDDEN_WEIGHT[i] ?? 0.3
      score[GAN_ELEM[g]] += (p.zhi === monthZhi ? w * 1.5 : w)   // 月令当权
    })
  }
  for (const k of Object.keys(score)) score[k] = Math.round(score[k] * 100) / 100
  return score
}

/**
 * 身强身弱：帮扶（比劫 + 印）对 克泄耗（食伤 + 财 + 官杀）。
 * 返回比值和一个档位；比值 1.0 附近算中和。
 */
export function dayMasterStrength(dayGan, score) {
  const me = GAN_ELEM[dayGan]
  const resource = Object.entries(GENERATES).find(([, v]) => v === me)[0]  // 生我
  const support = score[me] + score[resource]
  const total = Object.values(score).reduce((a, b) => a + b, 0)
  const ratio = total === 0 ? 0 : support / total
  let grade
  if (ratio >= 0.55) grade = '偏强'
  else if (ratio >= 0.45) grade = '中和'
  else grade = '偏弱'
  return { support: Math.round(support * 100) / 100, total: Math.round(total * 100) / 100, ratio: Math.round(ratio * 1000) / 1000, grade }
}

/** 完整排盘 */
export function chart({ date, time, longitude = 116.4, tzHours = 8, useTrueSolar = true }) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)

  const solar = useTrueSolar
    ? (() => { const t = trueSolarTime({ y, m, d, hh, mm, longitude, tzHours }).corrected
               return { t, adj: trueSolarTime({ y, m, d, hh, mm, longitude, tzHours }) } })()
    : { t: { y, m, d, hh, mm }, adj: null }

  const { t } = solar
  const ec = Solar.fromYmdHms(t.y, t.m, t.d, t.hh, t.mm, 0).getLunar().getEightChar()

  const pillars = [
    { name: '年', gan: ec.getYearGan(),  zhi: ec.getYearZhi() },
    { name: '月', gan: ec.getMonthGan(), zhi: ec.getMonthZhi() },
    { name: '日', gan: ec.getDayGan(),   zhi: ec.getDayZhi() },
    { name: '时', gan: ec.getTimeGan(),  zhi: ec.getTimeZhi() },
  ]
  const dayGan = pillars[2].gan
  for (const p of pillars) {
    p.ganTenGod = p.name === '日' ? '日主' : tenGod(dayGan, p.gan)
    p.zhiHidden = (HIDDEN[p.zhi] || []).map((g) => ({ gan: g, tenGod: tenGod(dayGan, g) }))
  }

  const score = elementStrength({ pillars, monthZhi: pillars[1].zhi })
  const strength = dayMasterStrength(dayGan, score)

  return {
    input: { date, time, longitude, tzHours, useTrueSolar },
    solarTimeAdjust: solar.adj,
    effectiveTime: t,
    pillars,
    dayGan,
    dayElement: GAN_ELEM[dayGan],
    score,
    strength,
    baZi: pillars.map((p) => p.gan + p.zhi).join(' '),
  }
}
