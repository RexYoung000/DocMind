import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { parseDocument, SUPPORTED_EXTENSIONS } from '../documentParser'

function makeFile(parts: BlobPart[], name: string, options?: FilePropertyBag): File {
  return new File(parts, name, options)
}

function createOleDocFile(text: string, name = 'legacy.doc'): File {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  const bytes = new Uint8Array(256 + text.length * 2)
  bytes.set(signature)

  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.charCodeAt(index)
    const offset = 128 + index * 2
    bytes[offset] = codePoint & 0xff
    bytes[offset + 1] = codePoint >> 8
  }

  return makeFile([bytes], name, { type: 'application/msword' })
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function createDocxFile(paragraphs: string[], name = 'review-plan.docx'): Promise<File> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map((paragraph) => `<w:p><w:r><w:t>${escapeXml(paragraph)}</w:t></w:r></w:p>`).join('\n')}
    <w:sectPr/>
  </w:body>
</w:document>`)

  const buffer = await zip.generateAsync({ type: 'arraybuffer' })
  return makeFile([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

describe('documentParser', () => {
  it('parses UTF-8 TXT content and metadata', async () => {
    const file = makeFile(['标题：课堂观察记录\n作者：王老师\n正文内容'], 'lesson.txt', { type: 'text/plain' })

    const result = await parseDocument(file)

    expect(result.raw_content).toContain('课堂观察记录')
    expect(result.word_count).toBeGreaterThan(0)
    expect(result.structured_content.sections[0]).toMatchObject({ title: '全文' })
    expect(result.doc_metadata?.topic).toBe('课堂观察记录')
    expect(result.doc_metadata?.author).toBe('王老师')
  })

  it('decodes GB18030 TXT files instead of storing mojibake', async () => {
    const gb18030Bytes = new Uint8Array([
      191, 206, 204, 226, 163, 186, 212, 178, 181, 196, 195, 230, 187, 253, 10,
      209, 167, 191, 198, 163, 186, 202, 253, 209, 167, 10,
      213, 253, 206, 196, 196, 218, 200, 221,
    ])
    const file = makeFile([gb18030Bytes], 'gbk-lesson.txt', { type: 'text/plain' })

    const result = await parseDocument(file)

    expect(result.raw_content).toContain('课题：圆的面积')
    expect(result.raw_content).toContain('学科：数学')
    expect(result.raw_content).not.toContain('�')
  })

  it('parses Markdown headings into sections', async () => {
    const file = makeFile(['# 目标\n内容 A\n\n## 过程\n内容 B'], 'plan.md', { type: 'text/markdown' })

    const result = await parseDocument(file)

    expect(result.structured_content.sections).toEqual([
      { title: '目标', content: '内容 A' },
      { title: '过程', content: '内容 B' },
    ])
  })

  it('parses DOCX text content', async () => {
    const file = await createDocxFile(['标题：产品方案', '摘要：用于课堂评审', '正文内容'])

    const result = await parseDocument(file)

    expect(result.raw_content).toContain('产品方案')
    expect(result.raw_content).toContain('用于课堂评审')
    expect(result.doc_metadata?.topic).toBe('产品方案')
  })

  it('parses DOCX content even when the file extension is DOC', async () => {
    const file = await createDocxFile(['标题：兼容文档', '正文内容'], 'renamed.doc')

    const result = await parseDocument(file)

    expect(result.raw_content).toContain('兼容文档')
    expect(result.doc_metadata?.topic).toBe('兼容文档')
  })

  it('parses HTML-based DOC files', async () => {
    const file = makeFile([
      '<html><body><h1>标题：网页文档</h1><p>摘要：HTML 保存为 DOC</p><p>正文内容</p></body></html>',
    ], 'html-doc.doc', { type: 'application/msword' })

    const result = await parseDocument(file)

    expect(result.raw_content).toContain('网页文档')
    expect(result.raw_content).toContain('HTML 保存为 DOC')
    expect(result.raw_content).not.toContain('<p>')
  })

  it('extracts readable text from legacy binary DOC files', async () => {
    const file = createOleDocFile('标题：老式 Word 文档\n摘要：二进制内容提取\n正文内容')

    const result = await parseDocument(file)

    expect(result.raw_content).toContain('老式 Word 文档')
    expect(result.raw_content).toContain('二进制内容提取')
  })

  it('rejects empty text documents with an actionable error', async () => {
    const file = makeFile(['   \n\t'], 'empty.txt', { type: 'text/plain' })

    await expect(parseDocument(file)).rejects.toThrow('没有可解析的文字内容')
  })

  it('includes DOC in the supported upload list', () => {
    expect(SUPPORTED_EXTENSIONS).toContain('.doc')
  })
})
