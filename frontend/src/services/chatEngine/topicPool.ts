import type { Document, Review } from '@/types'

export interface Topic {
  id: string
  text: string
  source: 'document' | 'review' | 'user'
  priority: number
  used: boolean
}

export class TopicPool {
  private topics: Topic[] = []
  private nextId = 1

  loadFromDocument(doc: Document) {
    const sections: string[] = []

    if (doc.doc_metadata?.keyPoints) {
      sections.push(...doc.doc_metadata.keyPoints.map((kp) => `关于要点"${kp}"的深入讨论`))
    }
    if (doc.doc_metadata?.abstract) {
      sections.push(`文档摘要的核心论点分析`)
    }
    if (doc.doc_metadata?.topic) {
      sections.push(`"${doc.doc_metadata.topic}"的整体评价`)
    }

    for (const text of sections) {
      this.addTopic(text, 'document')
    }
  }

  loadFromReview(review: Review) {
    const agentReviews = review.agent_reviews?.filter((r) => r.status !== 'failed') || []

    for (const ar of agentReviews) {
      for (const suggestion of ar.suggestions.filter((s) => s.priority === 'high')) {
        this.addTopic(`${ar.agent_name}提出：${suggestion.content}`, 'review', 2)
      }
    }

    const summary = review.summary
    if (summary?.controversies) {
      for (const c of summary.controversies) {
        this.addTopic(`争议焦点：${c.topic}`, 'review', 3)
      }
    }
  }

  addTopic(text: string, source: Topic['source'], priority = 1) {
    this.topics.push({
      id: `topic-${this.nextId++}`,
      text,
      source,
      priority,
      used: false,
    })
    this.topics.sort((a, b) => b.priority - a.priority)
  }

  getNext(): Topic | null {
    const topic = this.topics.find((t) => !t.used)
    if (topic) topic.used = true
    return topic || null
  }

  getAll(): Topic[] {
    return [...this.topics]
  }

  getUnused(): Topic[] {
    return this.topics.filter((t) => !t.used)
  }

  reset() {
    for (const t of this.topics) t.used = false
  }
}
