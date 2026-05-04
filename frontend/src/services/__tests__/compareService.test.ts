import { describe, expect, it } from 'vitest'
import { computeDiff } from '../compareService'

describe('compareService', () => {
  it('classifies added, deleted, modified, and equal diff points', () => {
    const result = computeDiff(
      '目标 A\n保留内容\n删除内容\n结束\n',
      '目标 B\n保留内容\n结束\n新增内容\n',
      'before.txt',
      'after.txt',
    )

    expect(result.oldFileName).toBe('before.txt')
    expect(result.newFileName).toBe('after.txt')
    expect(result.stats).toMatchObject({
      additions: 1,
      deletions: 1,
      modifications: 1,
    })
    expect(result.points.map((point) => point.type)).toEqual(['modify', 'equal', 'delete', 'equal', 'add'])
    expect(result.points[0]).toMatchObject({
      type: 'modify',
      oldText: '目标 A\n',
      newText: '目标 B\n',
      text: '目标 B\n',
    })
  })
})
