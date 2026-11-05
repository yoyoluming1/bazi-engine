/**
 * 真太阳时修正 —— 命理排盘的第一个"物理"步骤，也是最容易被跳过的一步。
 *
 * 钟表时间是行政区时（中国统一 UTC+8 = 东经 120°），但传统命理用的是**当地真太阳时**。
 * 两个偏差来源：
 *   1. 经度差：每偏离 1° 差 4 分钟（北京 116.4°E → 差 -14.4 分钟）
 *   2. 均时差（Equation of Time）：地球轨道椭圆 + 轴倾角，一年内 ±16 分钟
 * 修正后可能跨时辰边界 —— 差 20 分钟就换时柱，这不是小事。
 */

/** 均时差（分钟），Spencer 近似式，误差 < 30 秒，足够排盘用 */
export function equationOfTime(dayOfYear) {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 365
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}

function dayOfYear(y, m, d) {
  const start = Date.UTC(y, 0, 1)
  const cur = Date.UTC(y, m - 1, d)
  return Math.floor((cur - start) / 86400000) + 1
}

/**
 * @param {{y:number,m:number,d:number,hh:number,mm:number,longitude:number,tzHours:number}} t
 * @returns {{minutes:number, breakdown:{longitude:number, eot:number}, corrected:{y:number,m:number,d:number,hh:number,mm:number}}}
 */
export function trueSolarTime({ y, m, d, hh, mm, longitude, tzHours = 8 }) {
  const lonCorr = (longitude - 15 * tzHours) * 4
  const eot = equationOfTime(dayOfYear(y, m, d))
  const total = Math.round((lonCorr + eot) * 100) / 100

  const base = new Date(Date.UTC(y, m - 1, d, hh, mm))
  base.setUTCMinutes(base.getUTCMinutes() + Math.round(total))
  return {
    minutes: total,
    breakdown: { longitude: Math.round(lonCorr * 100) / 100, eot: Math.round(eot * 100) / 100 },
    corrected: {
      y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(),
      hh: base.getUTCHours(), mm: base.getUTCMinutes(),
    },
  }
}
