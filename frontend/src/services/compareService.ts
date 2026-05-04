import { diffLines } from 'diff'
import type { DiffPoint, DiffResult } from '@/types'

export function computeDiff(
  oldText: string,
  newText: string,
  oldFileName: string,
  newFileName: string,
): DiffResult {
  const changes = diffLines(oldText, newText)
  const points: DiffPoint[] = []
  let additions = 0
  let deletions = 0
  let modifications = 0
  let equalLines = 0

  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i]
    const next = changes[i + 1]

    if (change.removed && next?.added) {
      points.push({
        type: 'modify',
        text: next.value,
        oldText: change.value,
        newText: next.value,
      })
      modifications++
      i += 1
      continue
    }

    if (change.added) {
      points.push({ type: 'add', text: change.value })
      additions++
    } else if (change.removed) {
      points.push({ type: 'delete', text: change.value })
      deletions++
    } else {
      points.push({ type: 'equal', text: change.value })
      equalLines++
    }
  }

  return {
    oldFileName,
    newFileName,
    points,
    stats: { additions, deletions, modifications, equalLines },
  }
}
