import type { Document, DocumentMetadata } from '@/types'
import { createId } from '@/utils/id'

interface ParseResult {
  raw_content: string
  structured_content: { sections: { title: string; content: string }[] }
  word_count: number
  doc_metadata?: DocumentMetadata
}

function countWords(text: string): number {
  const cleaned = text.replace(/\s+/g, '')
  return cleaned.length
}

function splitMarkdownSections(text: string): { title: string; content: string }[] {
  const lines = text.split('\n')
  const sections: { title: string; content: string }[] = []
  let currentTitle = '正文'
  let currentLines: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
      }
      currentTitle = headingMatch[2]
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
  }
  return sections.filter((s) => s.content.length > 0)
}

function splitPlainTextSections(text: string): { title: string; content: string }[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
  if (paragraphs.length <= 1) {
    return [{ title: '全文', content: text.trim() }]
  }
  return paragraphs.map((p, i) => {
    const firstLine = p.trim().split('\n')[0].slice(0, 30)
    return { title: `段落 ${i + 1}: ${firstLine}...`, content: p.trim() }
  })
}

function extractDocumentMetadata(text: string): DocumentMetadata | undefined {
  const fields: DocumentMetadata = {}
  let foundAny = false

  const topicMatch = text.match(/(?:标题|主题|题目|课题)[：:]\s*(.+?)(?:\n|$)/i)
  if (topicMatch) { fields.topic = topicMatch[1].trim(); foundAny = true }

  const categoryMatch = text.match(/(?:类别|分类|类型|领域)[：:]\s*(.+?)(?:\n|$)/i)
  if (categoryMatch) { fields.category = categoryMatch[1].trim(); foundAny = true }

  const authorMatch = text.match(/(?:作者|作者名|撰写人)[：:]\s*(.+?)(?:\n|$)/i)
  if (authorMatch) { fields.author = authorMatch[1].trim(); foundAny = true }

  const abstractMatch = text.match(/(?:摘要|概要|简介|内容提要)[：:]\s*([\s\S]*?)(?=(?:关键词|正文|目录|一、|\n\s*\n|$))/i)
  if (abstractMatch) { fields.abstract = abstractMatch[1].trim(); foundAny = true }

  const keyPointsMatch = text.match(/(?:关键词|关键要点|核心观点|重点)[：:]\s*([\s\S]*?)(?=(?:正文|目录|一、|\n\s*\n|$))/i)
  if (keyPointsMatch) {
    fields.keyPoints = keyPointsMatch[1].trim().split(/[；;,，、\n]+/).map((s) => s.trim()).filter(Boolean)
    foundAny = true
  }

  fields.wordCount = text.replace(/\s+/g, '').length
  if (fields.wordCount > 0) foundAny = true

  return foundAny ? fields : undefined
}

async function parseTxt(file: File): Promise<ParseResult> {
  const text = await file.text()
  const sections = splitPlainTextSections(text)
  const doc_metadata = extractDocumentMetadata(text)
  return {
    raw_content: text,
    structured_content: { sections },
    word_count: countWords(text),
    doc_metadata,
  }
}

async function parseMd(file: File): Promise<ParseResult> {
  const text = await file.text()
  const sections = splitMarkdownSections(text)
  const doc_metadata = extractDocumentMetadata(text)
  return {
    raw_content: text,
    structured_content: { sections },
    word_count: countWords(text),
    doc_metadata,
  }
}

async function parsePdf(file: File): Promise<ParseResult> {
  const pdfjsLib = await import('pdfjs-dist')
  const pdfWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const textParts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    textParts.push(pageText)
  }

  const fullText = textParts.join('\n\n')
  const sections = textParts.map((text, i) => ({
    title: `第 ${i + 1} 页`,
    content: text.trim(),
  })).filter((s) => s.content.length > 0)

  const doc_metadata = extractDocumentMetadata(fullText)

  return {
    raw_content: fullText,
    structured_content: { sections },
    word_count: countWords(fullText),
    doc_metadata,
  }
}

async function parseDocx(file: File): Promise<ParseResult> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  const text = result.value
  const sections = splitPlainTextSections(text)
  const doc_metadata = extractDocumentMetadata(text)
  return {
    raw_content: text,
    structured_content: { sections },
    word_count: countWords(text),
    doc_metadata,
  }
}

export async function parseDocument(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'txt':
      return parseTxt(file)
    case 'md':
      return parseMd(file)
    case 'pdf':
      return parsePdf(file)
    case 'docx':
      return parseDocx(file)
    default:
      throw new Error(`不支持的文件格式: .${ext}`)
  }
}

export function createDocumentFromFile(file: File, ownerId: string): Document {
  const ext = file.name.split('.').pop()?.toLowerCase() as Document['file_type']
  const title = file.name.replace(/\.\w+$/, '')
  return {
    id: createId(),
    owner_id: ownerId,
    title,
    file_name: file.name,
    file_type: ext || 'txt',
    file_size: file.size,
    status: 'parsing',
    review_count: 0,
    created_at: new Date().toISOString(),
  }
}

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.md', '.txt']
export const MAX_FILE_SIZE = 20 * 1024 * 1024
