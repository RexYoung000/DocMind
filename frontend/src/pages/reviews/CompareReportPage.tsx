import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Filter, GitCompare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReviewStore } from '@/stores/reviewStore'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { DiffType } from '@/types'

const FILTER_OPTIONS: { label: string; value: DiffType | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '新增', value: 'add' },
  { label: '修改', value: 'modify' },
  { label: '删除', value: 'delete' },
]

const DIFF_BADGE: Record<Exclude<DiffType, 'equal'>, { label: string; variant: 'success' | 'danger' | 'warning'; border: string }> = {
  add: { label: '新增', variant: 'success', border: 'border-l-emerald-400' },
  modify: { label: '修改', variant: 'warning', border: 'border-l-amber-400' },
  delete: { label: '删除', variant: 'danger', border: 'border-l-red-400' },
}

export default function CompareReportPage() {
  const { reviewId } = useParams<{ reviewId: string }>()
  const getReview = useReviewStore((state) => state.getReview)
  const [filter, setFilter] = useState<DiffType | 'all'>('all')

  const review = reviewId ? getReview(reviewId) : undefined

  const compareData = review?.compareReport

  const filteredReviews = useMemo(() => {
    if (!compareData) return []
    if (filter === 'all') return compareData.pointReviews
    return compareData.pointReviews.filter((pr) => pr.diffType === filter)
  }, [compareData, filter])

  const stats = useMemo(() => {
    if (!compareData) return { additions: 0, deletions: 0, modifications: 0, total: 0 }
    const additions = compareData.pointReviews.filter((p) => p.diffType === 'add').length
    const deletions = compareData.pointReviews.filter((p) => p.diffType === 'delete').length
    const modifications = compareData.pointReviews.filter((p) => p.diffType === 'modify').length
    return { additions, deletions, modifications, total: additions + deletions + modifications }
  }, [compareData])

  if (!review || !compareData) {
    return (
      <div className="space-y-6 animate-slide-up">
        <Link to="/reviews" className="flex items-center gap-1 text-sm text-gray-500 no-underline hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> 返回评审大厅
        </Link>
        <div className="py-16 text-center">
          <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-sm text-gray-500">未找到对比评审报告</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <Link to="/reviews" className="flex items-center gap-1 text-sm text-gray-500 no-underline hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> 返回评审大厅
      </Link>

      <div className="dm-page-header">
        <div>
          <span className="dm-kicker">
            <GitCompare className="h-3.5 w-3.5" />
            Compare Report
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">对比评审报告</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-600">
            {review.document?.title || '未知文档'} — 逐条评审修改差异，评估修改质量
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-[20px] text-center">
          <CardContent className="py-4">
            <p className="text-2xl font-bold text-emerald-600">{stats.additions}</p>
            <p className="text-xs text-gray-500">新增</p>
          </CardContent>
        </Card>
        <Card className="rounded-[20px] text-center">
          <CardContent className="py-4">
            <p className="text-2xl font-bold text-red-500">{stats.deletions}</p>
            <p className="text-xs text-gray-500">删除</p>
          </CardContent>
        </Card>
        <Card className="rounded-[20px] text-center">
          <CardContent className="py-4">
            <p className="text-2xl font-bold text-amber-600">{stats.modifications}</p>
            <p className="text-xs text-gray-500">修改</p>
          </CardContent>
        </Card>
        <Card className="rounded-[20px] text-center">
          <CardContent className="py-4">
            <p className="text-2xl font-bold text-gray-700">{stats.total}</p>
            <p className="text-xs text-gray-500">总计变更</p>
          </CardContent>
        </Card>
      </div>

      {compareData.overview && (
        <Card className="rounded-[24px]">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">整体评估</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-gray-700">{compareData.overallAssessment || compareData.overview}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-gray-500">筛选：</span>
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filter === option.value
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredReviews.map((pr) => {
          const typeMeta = pr.diffType === 'equal' ? DIFF_BADGE.modify : DIFF_BADGE[pr.diffType]
          return (
          <Card
            key={pr.pointIndex}
            className={cn(
              'rounded-[20px] border-l-[3px]',
              typeMeta.border
            )}
          >
            <CardContent className="py-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant={typeMeta.variant}>
                  {typeMeta.label}
                </Badge>
                <span className="text-xs text-gray-400">#{pr.pointIndex + 1}</span>
              </div>

              {pr.oldText && (
                <div className="mb-2 rounded-lg bg-red-50 p-3">
                  <p className="mb-1 text-xs font-medium text-red-600">修改前</p>
                  <p className="text-sm text-red-900 line-through decoration-red-400">{pr.oldText.trim().slice(0, 200)}</p>
                </div>
              )}
              {pr.newText && (
                <div className="mb-3 rounded-lg bg-emerald-50 p-3">
                  <p className="mb-1 text-xs font-medium text-emerald-600">修改后</p>
                  <p className="text-sm text-emerald-900">{pr.newText.trim().slice(0, 200)}</p>
                </div>
              )}

              <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="mb-2 text-xs font-medium text-gray-500">评审意见</p>
                <p className="text-sm leading-6 text-gray-700">{pr.comment}</p>
              </div>

              <div className="flex gap-2">
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  pr.isCore ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'
                )}>
                  {pr.isCore ? '核心修改' : '非核心'}
                </span>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  pr.isNecessary ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                )}>
                  {pr.isNecessary ? '必要' : '不必要'}
                </span>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  pr.alignsWithKnowledge ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                )}>
                  {pr.alignsWithKnowledge ? '贴合知识点' : '偏离知识点'}
                </span>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>

      {filteredReviews.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">没有匹配的评审记录</p>
        </div>
      )}
    </div>
  )
}
