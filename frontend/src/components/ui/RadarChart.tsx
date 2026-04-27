import { AGENT_COLORS } from '@/stores/agentStore'
import type { AgentColor } from '@/types'
import { REVIEW_DIMENSIONS } from '@/types'

interface RadarDataset {
  label: string
  color: AgentColor
  scores: number[]
}

interface RadarChartProps {
  datasets: RadarDataset[]
  size?: number
}

export function RadarChart({ datasets, size = 280 }: RadarChartProps) {
  const dimensions = REVIEW_DIMENSIONS
  const n = dimensions.length
  const cx = size / 2
  const cy = size / 2
  const maxR = size / 2 - 40

  const angles = dimensions.map((_, i) => (Math.PI * 2 * i) / n - Math.PI / 2)

  const getPoint = (angle: number, r: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  })

  const gridLevels = [1, 2, 3, 4, 5]

  const gridPolygons = gridLevels.map((level) => {
    const r = (level / 5) * maxR
    const points = angles.map((a) => getPoint(a, r))
    return points.map((p) => `${p.x},${p.y}`).join(' ')
  })

  const axisLines = angles.map((a) => {
    const end = getPoint(a, maxR)
    return { x1: cx, y1: cy, x2: end.x, y2: end.y }
  })

  const labelPositions = angles.map((a, i) => {
    const p = getPoint(a, maxR + 20)
    return { ...p, label: dimensions[i] }
  })

  const dataPolygons = datasets.map((ds) => {
    const points = ds.scores.map((score, i) => {
      const r = (Math.min(5, Math.max(0, score)) / 5) * maxR
      return getPoint(angles[i], r)
    })
    return {
      points: points.map((p) => `${p.x},${p.y}`).join(' '),
      color: AGENT_COLORS[ds.color],
      label: ds.label,
    }
  })

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {gridPolygons.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            className="stroke-gray-200 dark:stroke-gray-600"
            strokeWidth={i === gridLevels.length - 1 ? 1.5 : 0.5}
          />
        ))}

        {axisLines.map((line, i) => (
          <line key={i} {...line} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth={0.5} />
        ))}

        {dataPolygons.map((dp, i) => (
          <g key={i}>
            <polygon
              points={dp.points}
              fill={dp.color + '20'}
              stroke={dp.color}
              strokeWidth={2}
            />
            {datasets[i].scores.map((score, j) => {
              const r = (Math.min(5, Math.max(0, score)) / 5) * maxR
              const p = getPoint(angles[j], r)
              return (
                <circle
                  key={j}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill={dp.color}
                />
              )
            })}
          </g>
        ))}

        {labelPositions.map((lp, i) => (
          <text
            key={i}
            x={lp.x}
            y={lp.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[11px] fill-gray-600 dark:fill-gray-300 font-medium"
          >
            {lp.label}
          </text>
        ))}
      </svg>

      {datasets.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2 justify-center">
          {datasets.map((ds, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: AGENT_COLORS[ds.color] }} />
              {ds.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
