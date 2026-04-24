import { test, expect } from '@playwright/test'

const authState = {
  state: {
    user: {
      id: 'user-visual-1',
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

const themeState = {
  state: {
    theme: 'light',
  },
  version: 0,
}

const documentsState = {
  state: {
    documents: [
      {
        id: 'doc-visual-main',
        owner_id: 'user-visual-1',
        title: '一次函数复习课',
        file_name: '一次函数复习课.md',
        file_type: 'md',
        file_size: 18520,
        raw_content:
          '课题：一次函数复习课\n教学目标：让学生能够回顾一次函数图像、斜率与截距的关系，并能用一次函数解释真实情境。\n教学重点：一次函数图像与表达式互相转化；斜率意义与现实问题建模。\n教学难点：将情境语言转成函数关系；在不同表示之间切换。\n教学过程：导入用校园电费案例引入；小组讨论图像变化；练习题分层设计；课堂小结整理迁移方法。',
        structured_content: {
          sections: [
            { title: '教学目标', content: '让学生回顾一次函数图像、斜率与截距关系。' },
            { title: '教学过程', content: '导入案例、小组讨论、分层练习、课堂总结。' },
          ],
        },
        summary: '这是一份围绕一次函数复习的教研案，亮点在于案例导入，但目标、难点突破和评价闭环仍需加强。',
        word_count: 1280,
        teaching_plan: {
          subject: '数学',
          grade: '初二',
          topic: '一次函数复习课',
          duration: '1课时',
          objectives: {
            knowledge: '理解图像与表达式关系',
            process: '能用图像分析变化趋势并建立模型',
            emotion: '增强用函数解释现实问题的意识',
          },
          keyPoints: ['图像与表达式互化', '斜率意义'],
          difficulties: ['情境建模', '多表示切换'],
        },
        status: 'ready',
        review_count: 0,
        created_at: '2026-04-23T10:00:00.000Z',
        updated_at: '2026-04-24T01:00:00.000Z',
      },
    ],
  },
  version: 0,
}

const agentsState = {
  state: {
    agents: [
      {
        id: 'agent-visual-1',
        owner_id: 'user-visual-1',
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
        id: 'agent-visual-2',
        owner_id: 'user-visual-1',
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
      {
        id: 'agent-visual-3',
        owner_id: 'user-visual-1',
        name: '刘妈妈',
        avatar: '👩',
        tagline: '家长视角，关注学习效果与负担',
        personality: { directness: 4, strictness: 3, humor: 1, empathy: 4 },
        expertise: ['学习效果', '作业负担'],
        behavior: { style: '直接但关心孩子感受' },
        system_prompt: '你是一位关注学习效果的家长。',
        source: 'template',
        is_public: false,
        usage_count: 4,
        color: 'emerald',
        category: 'parent',
        created_at: '2026-04-20T00:00:00.000Z',
      },
    ],
    hiddenTemplateIds: [],
    trashedAgents: [],
  },
  version: 0,
}

const reviewState = {
  state: {
    reviews: [],
  },
  version: 0,
}

const chatState = {
  state: {
    rooms: [],
    messages: {},
    bookmarks: [],
    polls: [],
    summaries: [],
  },
  version: 0,
}

const activityState = {
  state: {
    activities: [],
  },
  version: 0,
}

function createStreamBody(text: string) {
  return text
    .split('')
    .map((chunk) => `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
    .join('') + 'data: [DONE]\n\n'
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({
      auth,
      settings,
      theme,
      documents,
      agentsStore,
      reviews,
      chat,
      activities,
    }) => {
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

    await new Promise((resolve) => setTimeout(resolve, 2500))

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': '*',
      },
      body: createStreamBody(
        JSON.stringify({
          overview: '这份教案基础是有的，但真正需要优化的是目标、难点和评价之间的闭环。',
          strengths: ['案例导入有真实场景感'],
          pain_points: ['难点突破不够具体'],
          consensus: ['案例导入有效'],
          controversies: [],
          top_suggestions: [
            {
              title: '补一个中间练习',
              content: '增加从情境翻译到表达式的过渡练习。',
              priority: 'high',
              expected_effect: '让更多学生跟上难点突破节奏。',
              source_agent: '评审汇总',
            },
          ],
        })
      ),
    })
  })
})

test('评审动画运行态视觉可见', async ({ page }) => {
  test.setTimeout(60000)

  await page.goto('/reviews/create?doc=doc-visual-main')
  await expect(page.getByRole('heading', { name: '发起评审' })).toBeVisible()

  await page.getByText('周老师').click()
  await page.getByText('小芳').click()
  await page.getByText('刘妈妈').click()
  await page.getByRole('button', { name: /开始评审/ }).click()

  await expect(page.getByRole('heading', { name: '正在生成教研评审' })).toBeVisible()
  await expect(page.getByText('Current Stage')).toBeVisible()
  await expect(page.getByText('多角色参与态势')).toBeVisible()
  await expect(page.getByText('系统正在推进本轮教研评审流程')).toBeVisible()

  await page.screenshot({ path: '.tmp/review-running-state.png', fullPage: true })
})
