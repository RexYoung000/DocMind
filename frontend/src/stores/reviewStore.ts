import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Review } from '@/types'
import { useActivityStore } from './activityStore'

interface ReviewState {
  reviews: Review[]
  addReview: (review: Review) => void
  updateReview: (id: string, updates: Partial<Review>) => void
  getReview: (id: string) => Review | undefined
  getReviewsByDocument: (docId: string) => Review[]
  toggleSuggestionAdopted: (reviewId: string, suggestionId: string) => void
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      reviews: [],

      addReview: (review) => {
        set((state) => ({ reviews: [review, ...state.reviews] }))
      },

      updateReview: (id, updates) => {
        set((state) => ({
          reviews: state.reviews.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        }))
        if (updates.status === 'completed') {
          const review = get().reviews.find((r) => r.id === id)
          if (review) {
            useActivityStore.getState().addActivity({
              type: 'review',
              text: `完成了评审，综合评分 ${updates.overall_score?.toFixed(1) ?? ''}`,
              score: updates.overall_score,
            })
          }
        }
      },

      getReview: (id) => get().reviews.find((r) => r.id === id),

      getReviewsByDocument: (docId) =>
        get().reviews.filter((r) => r.document_id === docId),

      toggleSuggestionAdopted: (reviewId, suggestionId) => {
        set((state) => ({
          reviews: state.reviews.map((r) => {
            if (r.id !== reviewId) return r
            const updatedAgentReviews = r.agent_reviews?.map((ar) => ({
              ...ar,
              suggestions: ar.suggestions.map((s) =>
                s.id === suggestionId ? { ...s, adopted: !s.adopted } : s
              ),
            }))
            const updatedSummary = r.summary
              ? {
                  ...r.summary,
                  top_suggestions: r.summary.top_suggestions.map((s) =>
                    s.id === suggestionId ? { ...s, adopted: !s.adopted } : s
                  ),
                }
              : r.summary
            return { ...r, agent_reviews: updatedAgentReviews, summary: updatedSummary }
          }),
        }))
      },
    }),
    { name: 'docmind-reviews' }
  )
)
