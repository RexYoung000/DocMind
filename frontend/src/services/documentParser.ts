import type { Document, DocumentMetadata } from '@/types'
import { createId } from '@/utils/id'

interface ParseResult {
  raw_content: string
  structured_content: { sections: { title: string; content: string }[] }
  word_count: number
  doc_metadata?: DocumentMetadata
}

type PdfWorkerConstructor = new (options?: WorkerOptions) => Worker

async function createPdfWorker(): Promise<Worker> {
  // Inline the worker so hosts that serve .mjs assets as octet-stream do not break PDF.js.
  const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker&inline')
  return new (PdfWorker as PdfWorkerConstructor)()
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function replacementCount(text: string): number {
  return (text.match(/\uFFFD/g) || []).length
}

function decodeWithEncoding(buffer: ArrayBuffer, encoding: string): string | null {
  try {
    return stripBom(new TextDecoder(encoding).decode(buffer))
  } catch {
    return null
  }
}

function readTextBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeWithEncoding(buffer, 'utf-16le') || ''
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeWithEncoding(buffer, 'utf-16be') || ''
  }

  const utf8Text = decodeWithEncoding(buffer, 'utf-8') || ''
  if (replacementCount(utf8Text) === 0) {
    return utf8Text
  }

  const gbText = decodeWithEncoding(buffer, 'gb18030')
  return gbText && replacementCount(gbText) < replacementCount(utf8Text) ? gbText : utf8Text
}

async function readTextFile(file: File): Promise<string> {
  return readTextBuffer(await file.arrayBuffer())
}

function assertReadableText(text: string, fileType: string): void {
  if (!text.split('\u0000').join('').trim()) {
    throw new Error(`${fileType} 没有可解析的文字内容，请确认文件不是空文档或图片扫描件`)
  }
}

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

function isDocxLike(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, [0x50, 0x4b])
}

function isOleDoc(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\u0000').join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, value: string) => {
    if (value[0] === '#') {
      const isHex = value[1]?.toLowerCase() === 'x'
      const codePoint = Number.parseInt(value.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }
    return namedEntities[value.toLowerCase()] || entity
  })
}

function htmlToText(html: string): string {
  return normalizeExtractedText(decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?(?:p|div|section|article|header|footer|h[1-6]|li|tr|br)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ))
}

function rtfToText(rtf: string): string {
  const text = rtf
    .replace(/\\u(-?\d+)\??/g, (_, value: string) => {
      const codePoint = Number.parseInt(value, 10)
      return String.fromCharCode(codePoint < 0 ? codePoint + 65536 : codePoint)
    })
    .replace(/\\par[d]?|\\line/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\'[0-9a-f]{2}/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/\\[^a-z]/gi, '')

  return normalizeExtractedText(text)
}

function isReadableCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0x3000 && codePoint <= 0x9fff) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef)
  )
}

function collectReadableRuns(text: string, minLength = 4): string[] {
  const runs: string[] = []
  let current = ''

  for (const char of text) {
    const codePoint = char.codePointAt(0) || 0
    if (isReadableCodePoint(codePoint)) {
      current += char
      continue
    }
    if (current.replace(/\s/g, '').length >= minLength) {
      runs.push(current)
    }
    current = ''
  }

  if (current.replace(/\s/g, '').length >= minLength) {
    runs.push(current)
  }

  return runs
}

function extractUtf16LeRuns(bytes: Uint8Array): string[] {
  const runs: string[] = []

  for (const offset of [0, 1]) {
    let current = ''
    for (let index = offset; index + 1 < bytes.length; index += 2) {
      const codePoint = bytes[index] | (bytes[index + 1] << 8)
      if (isReadableCodePoint(codePoint)) {
        current += String.fromCharCode(codePoint)
        continue
      }
      if (current.replace(/\s/g, '').length >= 4) {
        runs.push(current)
      }
      current = ''
    }
    if (current.replace(/\s/g, '').length >= 4) {
      runs.push(current)
    }
  }

  return runs
}

function scoreExtractedText(text: string): number {
  const meaningfulChars = text.match(/[\p{Script=Han}A-Za-z0-9]/gu)?.length || 0
  return meaningfulChars - replacementCount(text) * 5
}

function extractBinaryDocText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const decoded = readTextBuffer(buffer)
  const candidates = [
    normalizeExtractedText(extractUtf16LeRuns(bytes).join('\n')),
    normalizeExtractedText(collectReadableRuns(decoded).join('\n')),
  ].filter(Boolean)

  return candidates.sort((a, b) => scoreExtractedText(b) - scoreExtractedText(a))[0] || ''
}

function parseDocText(text: string): string {
  const trimmedStart = text.trimStart()
  if (/^<(!doctype\s+html|html|body|meta|\?xml)|<\w+[\s>]/i.test(trimmedStart)) {
    return htmlToText(text)
  }
  if (/^\{\\rtf/i.test(trimmedStart)) {
    return rtfToText(text)
  }
  return normalizeExtractedText(text)
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
  const text = await readTextFile(file)
  assertReadableText(text, 'TXT')
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
  const text = await readTextFile(file)
  assertReadableText(text, 'Markdown')
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
  const [pdfjsLib, workerPort] = await Promise.all([
    import('pdfjs-dist'),
    createPdfWorker(),
  ])

  const arrayBuffer = await file.arrayBuffer()
  const pdfWorker = pdfjsLib.PDFWorker.create({ port: workerPort })
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, worker: pdfWorker })
  let pdf: Awaited<typeof loadingTask.promise> | undefined

  try {
    pdf = await loadingTask.promise
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
    assertReadableText(fullText, 'PDF')
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
  } finally {
    if (pdf) {
      await pdf.destroy()
    } else {
      await loadingTask.destroy()
    }
    workerPort.terminate()
  }
}

async function parseDocx(file: File): Promise<ParseResult> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const mammothInput: { arrayBuffer: ArrayBuffer; buffer?: Uint8Array } = { arrayBuffer }
  const nodeBuffer = (globalThis as typeof globalThis & { Buffer?: { from: (input: ArrayBuffer) => Uint8Array } }).Buffer
  if (nodeBuffer) {
    mammothInput.buffer = nodeBuffer.from(arrayBuffer)
  }
  const result = await mammoth.extractRawText(mammothInput)
  const text = result.value
  assertReadableText(text, 'DOCX')
  const sections = splitPlainTextSections(text)
  const doc_metadata = extractDocumentMetadata(text)
  return {
    raw_content: text,
    structured_content: { sections },
    word_count: countWords(text),
    doc_metadata,
  }
}

async function parseDoc(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let text: string

  if (isDocxLike(bytes)) {
    return parseDocx(file)
  }

  if (isOleDoc(bytes)) {
    text = extractBinaryDocText(arrayBuffer)
  } else {
    text = parseDocText(readTextBuffer(arrayBuffer))
  }

  assertReadableText(text, 'DOC')
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
    case 'doc':
      return parseDoc(file)
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

export const SUPPORTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.md', '.txt']
export const MAX_FILE_SIZE = 20 * 1024 * 1024
