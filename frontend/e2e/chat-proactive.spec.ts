import { test, expect } from '@playwright/test'

let chatCallCount = 0

const authState = {
  state: {
    user: {
      id: 'user-chat-1',
      email: 'user@docmind.local',
      name: '体验用户',
      created_at: '2026-04-24T01:00:00.000Z',
    },
    token: 'auto-token',
    isAuthenticated: true,
  },
  version: 0,
}

const settingsState = {
  state: {
    profiles: [],
    activeProfileId: null,
    currentConfig: {
      providerMode: 'third-party',
      model: 'deepseek-chat',
      apiKey: 'playwright-test-key',
      baseUrl: 'http://mock-llm.local/v1',
      localEndpoint: '',
      maxConcurrentReviews: 2,
    },
  },
  version: 0,
}

const themeState = { state: { theme: 'light' }, version: 0 }

const documentsState = {
  state: {
    documents: [
      {
        id: 'doc-chat-main',
        owner_id: 'user-chat-1',
        title: '一次函数复习课',
        file_name: '一次函数复习课.md',
        file_type: 'md',
        file_size: 18520,
        raw_content: '教学目标：理解图像与表达式关系。教学难点：将情境语言转成函数关系。教学过程：案例导入，小组讨论，分层练习。',
        structured_content: { sections: [{ title: '教学过程', content: '案例导入，小组讨论，分层练习。' }] },
        summary: '案例导入有真实场景感，但目标、难点突破和评价闭环仍需加强。',
        word_count: 1280,
        teaching_plan: {
          subject: '数学',
          grade: '初二',
          topic: '一次函数复习课',
          duration: '1课时',
          keyPoints: ['图像与表达式互化', '斜率意义'],
          difficulties: ['情境建模', '多表示切换'],
        },
        status: 'ready',
        review_count: 1,
        created_at: '2026-04-23T10:00:00.000Z',
      },
      {
        id: 'doc-chat-attachment',
        owner_id: 'user-chat-1',
        title: '课堂观察补充记录',
        file_name: '课堂观察补充记录.txt',
        file_type: 'txt',
        file_size: 4200,
        raw_content: '学生在把文字情境转成函数表达式时卡顿明显，尤其是难以判断自变量和因变量。',
        structured_content: { sections: [{ title: '观察记录', content: '学生在情境建模时卡顿明显。' }] },
        summary: '课堂观察显示，学生在情境翻译阶段最容易掉队。',
        word_count: 120,
        status: 'ready',
        review_count: 0,
        created_at: '2026-04-24T01:05:00.000Z',
      },
    ],
  },
  version: 0,
}

const agents = [
  {
    id: 'agent-chat-1',
    owner_id: 'user-chat-1',
    name: '周老师',
    avatar: '👩‍🏫',
    tagline: '课程设计与教学结构专家',
    personality: { directness: 4, strictness: 4, humor: 2, empathy: 3 },
    expertise: ['课程设计', '教学结构'],
    behavior: { style: '严谨务实' },
    system_prompt: '你是一位课程设计专家。',
    source: 'template',
    is_public: false,
    usage_count: 8,
    color: 'indigo',
    category: 'teacher',
    focusDimension: '璇剧▼璁捐',
    created_at: '2026-04-20T00:00:00.000Z',
  },
  {
    id: 'agent-chat-2',
    owner_id: 'user-chat-1',
    name: '小芳',
    avatar: '🧑‍🎓',
    tagline: '学生视角，关注理解负担',
    personality: { directness: 3, strictness: 2, humor: 3, empathy: 4 },
    expertise: ['理解难度', '学习节奏'],
    behavior: { style: '认真但会直接说困惑' },
    system_prompt: '你是一位初中学生视角的讨论者。',
    source: 'template',
    is_public: false,
    usage_count: 5,
    color: 'orange',
    category: 'student',
    created_at: '2026-04-20T00:00:00.000Z',
  },
]

const agentsState = {
  state: {
    agents,
    hiddenTemplateIds: [],
    trashedAgents: [],
  },
  version: 0,
}

const reviewState = {
  state: {
    reviews: [
      {
        id: 'review-chat-1',
        document_id: 'doc-chat-main',
        owner_id: 'user-chat-1',
        overall_score: 3.9,
        status: 'completed',
        created_at: '2026-04-24T01:12:00.000Z',
        document: documentsState.state.documents[0],
        agents,
        agent_reviews: [],
        summary: {
          overview: '这份设计基础是有的，但最关键的问题仍是目标、难点突破和评价闭环没有完全锁住。',
          strengths: ['案例导入有真实场景感。'],
          pain_points: ['目标缺少可验证结果。', '学生在情境建模前缺一个过渡练习。'],
          consensus: ['案例导入是亮点。'],
          controversies: [],
          top_suggestions: [
            {
              id: 'sg-chat-1',
              title: '补一个过渡练习',
              content: '问题定位：从案例理解直接跳到独立建模跨度过大。 -> 改进动作：增加一句示范和一句模仿。 -> 预期收益：降低学生卡顿。',
              priority: 'high',
              adopted: false,
              source_agent: '评审汇总',
              expected_effect: '让更多学生跟上。',
            },
          ],
        },
      },
    ],
  },
  version: 0,
}

const chatState = { state: { rooms: [], messages: {}, bookmarks: [], polls: [], summaries: [] }, version: 0 }
const activityState = { state: { activities: [] }, version: 0 }

function createStreamBody(text: string) {
  return text
    .split('')
    .map((chunk) => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
    .join('') + 'data: [DONE]\n\n'
}

test.beforeEach(async ({ page }) => {
  chatCallCount = 0

  await page.addInitScript(
    ({ auth, settings, theme, documents, agentsStore, reviews, chat, activities }) => {
      window.localStorage.clear()
      window.localStorage.setItem('docmind-auth', JSON.stringify(auth))
      window.localStorage.setItem('docmind-settings', JSON.stringify(settings))
      window.localStorage.setItem('docmind-theme', JSON.stringify(theme))
      window.localStorage.setItem('docmind-documents', JSON.stringify(documents))
      window.localStorage.setItem('docmind-agents', JSON.stringify(agentsStore))
      window.localStorage.setItem('docmind-reviews', JSON.stringify(reviews))
      window.localStorage.setItem('docmind-chat', JSON.stringify(chat))
      window.localStorage.setItem('docmind-activities', JSON.stringify(activities))
    },
    {
      auth: authState,
      settings: settingsState,
      theme: themeState,
      documents: documentsState,
      agentsStore: agentsState,
      reviews: reviewState,
      chat: chatState,
      activities: activityState,
    }
  )

  await page.route('http://mock-llm.local/**/chat/completions', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': '*',
        },
        body: '',
      })
      return
    }

    const body = JSON.parse(route.request().postData() || '{}')
    const messages = body.messages || []
    const lastUserContent = messages[messages.length - 1]?.content || ''

    const replies = [
      '我先抛个判断：这份设计最大的问题不是内容少，而是目标、活动、评价之间还没有完全锁住。',
      '从学生跟进的角度看，案例导入不错，但情境转函数表达式那一步还缺一个中间台阶。',
      '我看完附带文档后更确定了，学生不是完全不会，而是缺一个示范翻译过程。',
      '如果继续往下改，我会优先补一个过渡练习，再把评价出口和目标对齐。',
    ]

    const responseText = lastUserContent.includes('附带文档')
      ? replies[2]
      : replies[Math.min(chatCallCount, replies.length - 1)]

    chatCallCount += 1

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': '*',
      },
      body: createStreamBody(responseText),
    })
  })
})

test('聊天室会围绕议题自动开口并在附带文档后继续接话', async ({ page }) => {
  test.setTimeout(60000)

  await page.goto('/reviews/review-chat-1')
  await page.getByRole('button', { name: '教研研讨' }).click()

  await expect(page).toHaveURL(/\/chat\/.+/)
  await expect(page.getByText('讨论议程')).toBeVisible()
  await expect(page.getByText('补一个过渡练习')).toBeVisible()
  await expect.poll(() => chatCallCount, { timeout: 12000 }).toBeGreaterThanOrEqual(2)
  await expect(page.getByText('这份设计最大的问题不是内容少，而是目标、活动、评价之间还没有完全锁住。')).toBeVisible()

  await page.getByRole('button', { name: /文档/i }).click()
  await page.getByRole('button', { name: /课堂观察补充记录/ }).click()
  await page.getByPlaceholder('输入消息... 可用 @ 提及角色，或 / 快捷命令').fill('请结合我刚附上的观察记录继续讨论，先说最关键的问题。')
  await page.getByPlaceholder('输入消息... 可用 @ 提及角色，或 / 快捷命令').press('Enter')

  await expect.poll(() => chatCallCount, { timeout: 12000 }).toBeGreaterThanOrEqual(3)
  await expect(page.getByText('我看完附带文档后更确定了，学生不是完全不会，而是缺一个示范翻译过程。')).toBeVisible()
})
