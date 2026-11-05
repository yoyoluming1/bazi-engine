/**
 * 大运与流年。
 *
 * 规则（古法，不是我们发明）：
 *   起运方向：阳年男、阴年女 → 顺行；阴年男、阳年女 → 逆行
 *   起运岁数：顺数到下一个节气 / 逆数到上一个节气，三天折一年
 *   大运每步十年，从月柱推移
 * 节气与历法换算仍交给 lunar-javascript；我们负责把它接进 chart 的真太阳时口径，
 * 并给每一步标上十神，供后面的格局分析使用。
 */
import pkg from 'lunar-javascript'
import { tenGod } from './bazi.mjs'

const { Solar } = pkg

const yangGan = (gan) => '甲丙戊庚壬'.includes(gan)

/** @param {{chart:object, gender:'male'|'female'}} opts */
export function luck({ chart, gender = 'male' }) {
  const t = chart.effectiveTime
  const ec = Solar.fromYmdHms(t.y, t.m, t.d, t.hh, t.mm, 0).getLunar().getEightChar()
  const yun = ec.getYun(gender === 'male' ? 1 : 0)

  const yearGan = chart.pillars[0].gan
  const forward = (yangGan(yearGan) && gender === 'male') || (!yangGan(yearGan) && gender === 'female')

  const daYun = yun.getDaYun().filter((d) => d.getGanZhi()).map((d) => {
    const gz = d.getGanZhi()
    return {
      startYear: d.getStartYear(),
      startAge: d.getStartAge(),
      ganZhi: gz,
      gan: gz[0],
      zhi: gz[1],
      ganTenGod: tenGod(chart.dayGan, gz[0]),
    }
  })

  return {
    gender,
    forward,
    qiYun: {
      years: yun.getStartYear(),
      months: yun.getStartMonth(),
      days: yun.getStartDay(),
      text: `${yun.getStartYear()} 年 ${yun.getStartMonth()} 个月 ${yun.getStartDay()} 天起运`,
    },
    daYun,
  }
}

/** 某一年的流年干支与十神 */
export function liuNian({ chart, year }) {
  const gz = Solar.fromYmd(year, 6, 1).getLunar().getYearInGanZhiExact()
  return { year, ganZhi: gz, gan: gz[0], zhi: gz[1], ganTenGod: tenGod(chart.dayGan, gz[0]) }
}
