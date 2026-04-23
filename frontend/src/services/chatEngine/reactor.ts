import type { Agent, ChatMessage, DiscussionMode } from '@/types'
import { chatCompletion } from '@/services/llmService'

const MAX_RESPONSE_DEPTH: Record<DiscussionMode, number> = {
  free: 2,
  moderated: 3,
  debate: 5,
}

export function buildAgentPrompt(
  agent: Agent,
  docContext: string,
  recentMessages: ChatMessage[],
  otherAgents: Agent[],
  mode: DiscussionMode,
): string {
  const othersDesc = otherAgents.length > 0
    ? `\n群里还有：${otherAgents.map((a) => `${a.name}（${a.tagline}）`).join('、')}。你可以直接回应他们的观点，叫他们的名字。`
    : ''

  const modeInstruction = mode === 'debate'
    ? '\n当前是辩论模式，请积极针对其他角色的观点提出不同看法，并给出充分论据。'
    : mode === 'moderated'
      ? '\n当前是引导式讨论，请围绕主题深入分析，避免偏题。'
      : '\n当前是自由讨论模式，请自然参与话题。'

  const recentContext = recentMessages.slice(-8).map((m) => {
    const prefix = m.sender_type === 'user' ? '用户' : m.sender_name
    return `[${prefix}]: ${m.content}`
  }).join('\n')

  return `${agent.system_prompt}
${othersDesc}
${modeInstruction}

文档摘要：
${docContext.slice(0, 2000)}

最近对话：
${recentContext}

请以 ${agent.name} 的身份回复，保持角色性格和专业视角。字数控制在100-300字。`
}

export function shouldRespond(
  agent: Agent,
  recentMessages: ChatMessage[],
  mode: DiscussionMode,
): boolean {
  const maxDepth = MAX_RESPONSE_DEPTH[mode]
  const recentAgentMsgs = recentMessages.slice(-maxDepth * 2)
    .filter((m) => m.sender_id === agent.id)

  if (recentAgentMsgs.length >= maxDepth) return false

  const lastMsg = recentMessages[recentMessages.length - 1]
  if (!lastMsg) return false
  if (lastMsg.sender_id === agent.id) return false

  if (lastMsg.target_agent_id === agent.id) return true

  if (lastMsg.content.includes(`@${agent.name}`)) return true

  const mentionsAgent = lastMsg.content.toLowerCase().includes(agent.name.toLowerCase())
  if (mentionsAgent) return true

  if (mode === 'debate') return Math.random() > 0.3
  if (mode === 'moderated') return Math.random() > 0.5
  return Math.random() > 0.6
}

export async function generateAgentResponse(
  agent: Agent,
  docContext: string,
  recentMessages: ChatMessage[],
  otherAgents: Agent[],
  mode: DiscussionMode,
  signal?: AbortSignal,
): Promise<string> {
  const systemPrompt = buildAgentPrompt(agent, docContext, recentMessages, otherAgents, mode)

  const chatHistory: { role: 'user' | 'assistant'; content: string }[] =
    recentMessages.slice(-10).map((m) => ({
      role: (m.sender_type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.sender_type === 'agent' && m.sender_id !== 'system'
        ? `[${m.sender_name}]: ${m.content}`
        : m.content,
    }))

  let reply = ''
  await chatCompletion(
    [{ role: 'system', content: systemPrompt }, ...chatHistory],
    {
      onChunk: (chunk) => { reply += chunk },
      onDone: (text) => { reply = text },
      onError: () => {},
    },
    signal,
  )

  return reply.trim()
}
