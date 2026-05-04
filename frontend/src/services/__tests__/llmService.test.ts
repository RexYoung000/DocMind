import { describe, expect, it } from 'vitest'
import { getLlmErrorUserMessage } from '../llmService'

describe('getLlmErrorUserMessage', () => {
  it('distinguishes network timeouts, quota limits, and parse errors', () => {
    expect(getLlmErrorUserMessage('network')).toContain('请求超时')
    expect(getLlmErrorUserMessage('api_error', 429)).toContain('额度')
    expect(getLlmErrorUserMessage('parse_error')).toContain('返回格式异常')
  })

  it('keeps provider detail for actionable api errors', () => {
    const message = getLlmErrorUserMessage('api_error', 401, 'invalid key')

    expect(message).toContain('鉴权失败')
    expect(message).toContain('invalid key')
  })
})
