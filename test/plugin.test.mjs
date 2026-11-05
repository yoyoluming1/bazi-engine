import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, name as pluginName, inject } from '../dsh-plugin/index.js'

/** 假 ctx：捕获注册进来的工具定义 */
function registerOnce() {
  let def = null
  const ctx = { tools: { register: (d) => { def = d; return () => {} } } }
  apply(ctx)
  assert.ok(def, 'apply() 必须注册一个工具')
  return def
}

test('插件元数据：名字与依赖服务正确', () => {
  assert.equal(pluginName, 'tool-bazi')
  assert.deepEqual(inject, ['tools'])
})

test('注册的工具定义满足 DSH 合约', () => {
  const def = registerOnce()
  assert.equal(def.name, 'bazi_chart')
  assert.equal(typeof def.execute, 'function')
  assert.ok(def.output && typeof def.output.render === 'function')
  assert.equal(def.output.schema.type, 'object')
  assert.ok(def.output.schema.properties.text, '输出必须有 text 字段')
  // 必填字段用属性级 required（DSH 的 schema DSL 不支持顶层 required 数组）
  assert.equal(def.output.schema.required, undefined)
  assert.equal(def.output.schema.properties.text.required, true)
})

test('正常输入：返回完整盘，且带推导依据', async () => {
  const def = registerOnce()
  const r = await def.execute({ birthDate: '1993-03-15', birthTime: '08:20', longitude: 116.4, gender: 'male' })
  assert.equal(typeof r.text, 'string')
  assert.match(r.text, /癸酉 乙卯 乙未 庚辰/)
  assert.match(r.text, /建禄格/)
  assert.match(r.text, /真太阳时/)
  assert.match(r.text, /用神/)
  assert.match(r.text, /大运/)
  assert.match(r.text, /流年/)
})

test('默认经度是 116.4，并在输出里标注为假设', async () => {
  const def = registerOnce()
  const r = await def.execute({ birthDate: '1993-03-15', birthTime: '08:20' })
  assert.match(r.text, /116\.4/)
})

test('非法日期格式直接拒绝，不静默兜底', async () => {
  const def = registerOnce()
  await assert.rejects(() => def.execute({ birthDate: '1993/03/15', birthTime: '08:20' }), /YYYY-MM-DD/)
  await assert.rejects(() => def.execute({ birthDate: '1993-03-15', birthTime: '8点20' }), /HH:mm/)
})

test('经度越界拒绝', async () => {
  const def = registerOnce()
  await assert.rejects(() => def.execute({ birthDate: '1993-03-15', birthTime: '08:20', longitude: 999 }), /longitude/)
})

test('性别影响大运顺逆（同一张盘男女不同）', async () => {
  const def = registerOnce()
  const male = await def.execute({ birthDate: '1993-03-15', birthTime: '08:20', gender: 'male' })
  const female = await def.execute({ birthDate: '1993-03-15', birthTime: '08:20', gender: 'female' })
  assert.match(male.text, /逆行/)
  assert.match(female.text, /顺行/)
})

test('render 产出标准 text block', () => {
  const def = registerOnce()
  const blocks = def.output.render({}, { text: 'hi' })
  assert.deepEqual(blocks, [{ type: 'text', text: 'hi' }])
})
