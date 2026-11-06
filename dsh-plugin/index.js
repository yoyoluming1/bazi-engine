/**
 * 八字排盘工具（DSH 插件）。
 *
 * 设计取舍：工具只负责**算**，把结构化结果交给模型去**说**。
 * 反向（把盘塞进提示词）会让人设和事实搅在一起 —— 算错也看不出来。
 */
let defineTool
try {
  ({ defineTool } = await import('@deepseek-ai/dsh-tools'))
} catch {
  // 宿主没把这个包暴露出来时，退化为原样返回（defineTool 本身只是做 schema 编译）
  defineTool = (options) => options
}

// 引擎的导入有两种上下文：
//   · 装进宿主（pnpm 复制到 profile/node_modules）→ 按包名 'bazi-engine' 解析
//   · 在本仓库里直接跑测试 → 没有 node_modules，回退到相对路径
// 用相对路径写死会在宿主里断（pnpm 复制包，相对路径失效），所以必须双路。
let engine
try {
  engine = await import('bazi-engine')
} catch {
  engine = await import('../index.mjs')
}
const { chart, luck, liuNian, analyze } = engine

export const name = 'tool-bazi'
export const inject = ['tools']

const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { text: { type: 'string', required: true } },
  },
  render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
}

function renderChart(c, meta = {}) {
  const lines = []
  const lonTag = meta.longitudeDefaulted ? '（未提供，按默认假设）' : ''
  lines.push(`输入：${c.input.date} ${c.input.time}｜经度 ${c.input.longitude}°E${lonTag}｜${meta.gender === 'female' ? '女' : '男'}命`)
  lines.push(`八字：${c.baZi}`)
  lines.push(`日主：${c.dayGan}（${c.dayElement}）`)
  if (c.solarTimeAdjust) {
    const a = c.solarTimeAdjust
    const t = c.effectiveTime
    lines.push(
      `真太阳时：修正 ${a.minutes} 分钟（经度 ${a.breakdown.longitude} + 均时差 ${a.breakdown.eot}）` +
      ` → ${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')} ${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`,
    )
  }
  lines.push('')
  lines.push('柱 / 干支 / 十神 / 藏干')
  for (const p of c.pillars) {
    const hidden = p.zhiHidden.map((h) => `${h.gan}(${h.tenGod})`).join(' ')
    lines.push(`${p.name}：${p.gan}${p.zhi} / ${p.ganTenGod} / ${hidden || '—'}`)
  }
  lines.push('')
  lines.push(`五行力量：${Object.entries(c.score).map(([k, v]) => `${k}${v}`).join(' ')}`)
  const s = c.strength
  lines.push(`身强弱：${s.grade}（帮扶 ${s.support} / 总 ${s.total} = ${(s.ratio * 100).toFixed(1)}%）`)
  return lines.join('\n')
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'bazi_chart',
    description: [
      '排一张八字盘并给出可解释的结论：真太阳时修正、四柱、十神、五行力量、身强弱、大运、流年、格局、用神。',
      '每个结论都附推导依据（basis），解释时应当引用这些依据，而不是自行发挥。调候与扶抑是两套正交的判断，不要混为一谈。',
      '不知道出生地经度时不要编；默认 116.4（北京）并明确说明这是假设。',
    ].join(' '),
    parameters: {
      birthDate: { type: 'string', required: true, description: '出生日期，格式 YYYY-MM-DD' },
      birthTime: { type: 'string', required: true, description: '出生时间，格式 HH:mm（24 小时制）' },
      longitude: { type: 'number', description: '出生地经度，东经为正，默认 116.4（北京）' },
      gender: { type: 'string', enum: ['male', 'female'], description: '性别，决定大运顺逆' },
      targetYear: { type: 'integer', description: '要看的流年，默认今年' },
    },
    output: TEXT_OUTPUT,
    async execute(args) {
      const birthDate = String(args.birthDate || '').trim()
      const birthTime = String(args.birthTime || '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error('birthDate 必须是 YYYY-MM-DD')
      if (!/^\d{1,2}:\d{2}$/.test(birthTime)) throw new Error('birthTime 必须是 HH:mm')

      const longitude = Number.isFinite(args.longitude) ? args.longitude : 116.4
      if (longitude < -180 || longitude > 180) throw new Error('longitude 需要在 -180~180 之间')

      const gender = args.gender === 'female' ? 'female' : 'male'
      const c = chart({ date: birthDate, time: birthTime, longitude })
      const a = analyze(c)
      const l = luck({ chart: c, gender })
      const year = Number.isInteger(args.targetYear) ? args.targetYear : new Date().getFullYear()
      const ln = liuNian({ chart: c, year })

      const out = [renderChart(c, { gender, longitudeDefaulted: !Number.isFinite(args.longitude) }), '']
      out.push(`格局：${a.geju.name}（取法：${a.geju.via}）`)
      for (const b of a.geju.basis) out.push(`  · ${b}`)
      out.push('')
      out.push(`用神：喜 ${a.yongShen.xi.join('、')}｜第一用神 ${a.yongShen.primary}｜忌 ${a.yongShen.ji.join('、') || '无'}`)
      for (const b of a.yongShen.basis) out.push(`  · ${b}`)
      out.push('')
      if (a.tiaohou?.available) {
        const t = a.tiaohou
        out.push(`调候：主用 ${t.main}（${t.mainElement}）${t.assist.length ? `，辅以 ${t.assist.join('、')}` : ''}｜${t.season}`)
        for (const b of t.basis) out.push(`  · ${b}`)
      } else {
        out.push(`调候：${a.tiaohou?.reason ?? '未计算'}`)
      }
      out.push('')
      out.push(`大运：${gender === 'male' ? '男' : '女'}命，${l.forward ? '顺行' : '逆行'}，${l.qiYun.text}`)
      for (const d of l.daYun) out.push(`  ${d.startYear} 起 ${d.startAge} 岁 ${d.ganZhi}（${d.ganTenGod}）`)
      out.push('')
      out.push(`流年：${year} 年 ${ln.ganZhi}（${ln.ganTenGod}）`)

      return { text: out.join('\n') }
    },
  }))
}
