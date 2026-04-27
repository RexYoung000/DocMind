# 聊天室策略优化任务计划

## 目标

把聊天室从“多个 Agent 轮流接龙”升级为有身份边界、事件响应、隐形调度、分层上下文、过程反馈和可沉淀结果的多 Agent 讨论系统。

协作规则：
- 主代理负责拆解、集成、验收和文档状态维护。
- 子代理负责边界清晰的独立模块。
- 每完成一个需求必须补对应测试。
- 纯策略模块优先单元测试，UI 行为后续用 E2E。

## 当前状态

已完成：
- P0 核心策略层。
- P1-1 新建聊天室策略配置。
- P1-2 分层上下文组装。
- P1-3 反重复机制。
- P1-4 观点记忆与立场追踪。
- P1-5 证据等级。
- P2-1 UI 过程反馈。
- P2-2 消息元信息。
- P2-3 实时用户控制栏。
- P2-4 聊天室成果沉淀。
- P3-1 失败与降级策略。
- P3-2 可回放策略日志。
- 主流程集成：`ChatRoomPage` 已真实接入分层上下文、Agent 记忆、身份输出校验、重复防护、失败恢复和策略日志。
- P3-3 模块清理：旧 `scheduler.ts`、`reactor.ts` 已确认无运行时引用并删除旧导出。

已验证：
- `npm test -- src/services/chatEngine/__tests__`
- `npm test -- src/services/chatEngine/__tests__/chatRoomStrategyFlow.test.ts`
- `npx eslint src/types/index.ts src/stores/chatStore.ts src/pages/chat/ChatListPage.tsx src/pages/chat/ChatRoomPage.tsx src/services/chatEngine/*.ts src/services/chatEngine/__tests__/*.test.ts`
- `npm run build`

全量 `npm run lint` 仍被历史问题阻塞，主要在 `Header.tsx`、`CommandPalette.tsx`、`AgentListPage.tsx`、`ReviewCreatePage.tsx`、`ReviewDetailPage.tsx`、`SettingsPage.tsx`、`reviewStore.ts` 等旧文件。

## P0 已完成：可信度与真实感

### P0-1 身份边界与能力画像

产物：
- `frontend/src/services/chatEngine/strategyTypes.ts`
- `frontend/src/services/chatEngine/capabilityProfiler.ts`
- `frontend/src/services/chatEngine/responseValidator.ts`

能力：
- 为每个 Agent 推断能力画像。
- 学生、家长、观察者不能直接做专业评审判断，会自然转成体验反馈、澄清追问或风险提醒。
- 自定义 Agent 身份不清晰时默认降级为保守观察者。
- 通过策略层约束、prompt 指导和输出校验共同限制越权发言。

测试：
- 学生 Agent 被要求专业判断时转为体验反馈。
- 家长 Agent 保持在家庭风险和体验反馈边界内。
- 模糊自定义 Agent 降级为观察者。
- 越权姿态触发重写建议。

### P0-2 事件响应与优先级

产物：
- `frontend/src/services/chatEngine/eventRouterV2.ts`

能力：
- 支持点名、文档附件、证据请求、用户困惑、观点冲突、议题推进、空闲补充。
- 优先级：点名 > 文档附件 > 证据请求 > 用户困惑 > 观点冲突 > 议题推进 > 空闲补充。

测试：
- 点名优先于文档、证据、冲突和空闲事件。
- 用户困惑能独立识别。

### P0-3 隐形对话调度层

产物：
- `frontend/src/services/chatEngine/turnPlanner.ts`
- `frontend/src/pages/chat/ChatRoomPage.tsx`

能力：
- 不引入显式主持人。
- 由 TurnPlanner 在后台决定谁接话、谁找证据、谁反驳、谁总结。
- `ChatRoomPage` 优先使用 `EventRouter + TurnPlanner`，旧逻辑作为兜底。
- 不适合专业判断的 Agent 会自然转译为身份安全的发言姿态。

测试：
- 点名学生角色时只返回学生体验反馈姿态。
- 证据请求优先路由到具备能力的教师/专家角色。
- 激烈冲突模式可生成多轮，温和模式不强制专业反驳。

### P0-4 议题生命周期与过程反馈

产物：
- `frontend/src/services/chatEngine/topicLifecycle.ts`
- `frontend/src/services/chatEngine/feedbackController.ts`

能力：
- 议题状态支持 `opened -> exploring -> conflicting -> grounding -> closing -> done`。
- 过程反馈支持阅读文档、定位段落、寻找证据、形成反驳、总结议题、切换议题等状态。

测试：
- opened 议题在 Agent 首次回应后进入 exploring。
- 冲突议题遇到证据请求后进入 grounding。
- 文档附件和冲突事件能生成完整过程反馈。

## P1 已完成：讨论质量

### P1-1 新建聊天室策略配置

产物：
- `frontend/src/types/index.ts`
- `frontend/src/stores/chatStore.ts`
- `frontend/src/pages/chat/ChatListPage.tsx`
- `frontend/src/pages/chat/ChatRoomPage.tsx`
- `frontend/src/services/chatEngine/strategyTypes.ts`
- `frontend/src/services/chatEngine/__tests__/strategyCore.test.ts`

能力：
- 新建聊天室可选择讨论模式、上下文深度、主动性、冲突强度、产品气质和过程反馈。
- 原文引用策略默认“可引用但不强制”。
- 身份边界默认开启标准约束。
- 旧聊天室没有 strategy 时会自动补默认策略。
- 聊天室运行时已读取 strategy，并把冲突强度、主动性传入回合规划。

测试：
- 缺失策略时补默认策略。
- 旧 `discussionMode` 可被保留并补齐新策略字段。
- 用户选择的策略覆盖项不会被默认值覆盖。

### P1-2 分层上下文组装

产物：
- `frontend/src/services/chatEngine/contextAssembler.ts`
- `frontend/src/services/chatEngine/__tests__/contextAssembler.test.ts`

能力：
- 按 `fast` / `deep` / `long-document` 生成分层上下文。
- 上下文包含房间主题、产品气质、当前议题、文档摘要、相关片段、评审痛点/建议、最近聊天消息和 Agent 记忆。
- 长文档模式按议题选片段，不直接把全文塞进 prompt。

测试：
- 快速模式只保留短摘要和少量近期消息。
- 深度模式包含评审痛点和相关文档片段。
- 长文档模式按当前议题选片段，避免塞入无关全文。

### P1-3 反重复机制

产物：
- `frontend/src/services/chatEngine/repetitionGuard.ts`
- `frontend/src/services/chatEngine/__tests__/memoryAndRepetition.test.ts`

能力：
- 基于近期 Agent 消息检测候选发言相似度。
- 高相似观点默认跳过。
- 重复时可转成追问、证据补充或总结。

测试：
- 高相似观点不重复发言。
- 同一 Agent 重复观点会被跳过。
- 不同 Agent 重复但带追问/证据/总结意图时可保留为更有价值的动作。

### P1-4 观点记忆与立场追踪

产物：
- `frontend/src/services/chatEngine/memoryTracker.ts`
- `frontend/src/services/chatEngine/__tests__/memoryAndRepetition.test.ts`

能力：
- 记录当前立场、已提出主张、支持/反对对象、未解决问题和上次发言意图。
- 可从消息流构建每个 Agent 的独立记忆。
- 无新反对信号时不会随意反转立场。

测试：
- Agent 下一轮能读取自身上次立场。
- 无新证据时不随意反转立场。
- 同一消息流可构建多 Agent 隔离记忆。

### P1-5 证据等级

产物：
- `frontend/src/services/chatEngine/evidenceClassifier.ts`
- `frontend/src/services/chatEngine/__tests__/evidenceClassifier.test.ts`

能力：
- 证据等级：`quote`、`review`、`user`、`inference`、`experience`。
- 可识别原文引用、评审结论、用户描述、Agent 推断和经验判断。
- 用户请求依据时优先排序 `quote` 和 `review`。

测试：
- 学生体验反馈标为 `experience`。
- 原文引用标为 `quote`。
- 用户请求依据时优先返回 `quote` 或 `review`。

## P2 已完成：用户体验与控制

### P2-1 UI 过程反馈

产物：
- `frontend/src/services/chatEngine/feedbackPresenter.ts`
- `frontend/src/services/chatEngine/__tests__/feedbackPresenter.test.ts`
- `frontend/src/pages/chat/ChatRoomPage.tsx`

能力：
- 把 `feedbackController` 的内部步骤映射成 UI 可展示的状态标签。
- `simple` 反馈模式只显示轻量 typing。
- `full` 反馈模式显示文档、证据、冲突、总结等细粒度过程。
- 聊天室生成回复期间会展示当前过程反馈。

测试：
- 完整反馈模式显示细粒度状态。
- 简洁反馈模式只显示轻量 typing。
- 文档、证据、冲突、议题推进事件有稳定 tone 和顺序。

### P2-2 消息元信息

产物：
- `frontend/src/types/index.ts`
- `frontend/src/services/chatEngine/messageMetadata.ts`
- `frontend/src/services/chatEngine/__tests__/messageMetadata.test.ts`
- `frontend/src/pages/chat/ChatRoomPage.tsx`

能力：
Agent 消息已增加：
- `intent`
- `respondingTo`
- `contextSource`
- `evidenceLevel`
- `citations`

消息气泡会显示轻量 chips，例如意图、回应对象、上下文来源、证据等级和来源数量。

测试：
- 消息气泡可轻提示“学生体验反馈 / 教研专业判断 / 家长风险提醒”等。
- 学生体验反馈会标为角色经验和经验反馈。
- 证据请求会标为文档/评审依据。
- 旧消息没有元信息时不会显示 chips。

### P2-3 实时用户控制栏

产物：
- `frontend/src/services/chatEngine/controlActions.ts`
- `frontend/src/services/chatEngine/__tests__/controlActions.test.ts`
- `frontend/src/components/chat/ChatToolbar.tsx`
- `frontend/src/pages/chat/ChatRoomPage.tsx`

能力：
支持：
- 更激烈一点
- 更温和一点
- 回到文档证据
- 让学生视角说说
- 让专家判断一下
- 先总结当前结论
- 少说废话
- 推进下一议题

测试：
- 每个控制按钮映射为明确策略事件或策略补丁。
- “回到文档证据”触发证据请求路径。
- 学生/专家控制可按参与者角色解析目标 Agent。

### P2-4 聊天室成果沉淀

产物：
- `frontend/src/services/chatEngine/artifactBuilder.ts`
- `frontend/src/services/chatEngine/__tests__/artifactBuilder.test.ts`
- `frontend/src/pages/chat/ChatRoomPage.tsx`

能力：
可从消息流沉淀：
- 当前共识
- 关键分歧
- 可执行建议
- 待验证问题
- 被采纳观点
- 下一步行动

同时提供本地讨论纪要兜底：LLM 总结未返回可解析 JSON 或失败时，仍会生成结构化纪要。

测试：
- 可从消息流提取共识和分歧。
- 重复建议被合并。
- 可导出讨论纪要。

## P3 部分完成：稳定性与工程可维护性

### P3-1 失败与降级策略

产物：
- `frontend/src/services/chatEngine/failureStrategy.ts`
- `frontend/src/services/chatEngine/__tests__/failureStrategy.test.ts`
- `frontend/src/pages/chat/ChatRoomPage.tsx`

能力：
模型失败时可规划：
- 当前 Agent 重试
- 换同能力 Agent
- 降级生成阶段摘要
- 保留用户消息并支持重发

主流程行为：
- LLM 错误不再被吞成 `...`。
- 单个 Agent 失败会先按预算重试，再按能力画像切换兼容 Agent。
- 所有失败恢复都保留用户消息，并记录策略日志。

测试：
- LLM 失败生成重试任务。
- 连续失败后换 Agent。
- 聊天室不因单个 Agent 失败卡死。

### P3-2 可回放策略日志

产物：
- `frontend/src/services/chatEngine/strategyLogger.ts`
- `frontend/src/services/chatEngine/__tests__/strategyLogger.test.ts`
- `frontend/src/pages/chat/ChatRoomPage.tsx`

能力：
开发模式可记录：
- 为什么选这个 Agent。
- 当前事件。
- 使用的上下文。
- 是否触发身份转译。
- 是否输出重写。
- 为什么切换议题。

主流程行为：
- 每轮 Agent 回复、失败恢复、重复跳过都会生成脱敏策略日志。
- 日志保留在内存 ref，同时写入 `localStorage` 的 `chat-strategy-log:{roomId}`，便于回放排查。

测试：
- 每轮规划产生日志。
- 日志脱敏 API Key 和长文档原文。

### P3-2.5 主流程运行时防护

产物：
- `frontend/src/services/chatEngine/runtimeGuards.ts`
- `frontend/src/services/chatEngine/__tests__/runtimeGuards.test.ts`
- `frontend/src/services/chatEngine/__tests__/chatRoomStrategyFlow.test.ts`
- `frontend/src/pages/chat/ChatRoomPage.tsx`

能力：
- Agent 记忆会被压缩成 prompt 可消费的上下文行。
- 生成后会做身份边界校验；学生、家长、观察者等角色越界时先触发重写，重写仍越界时使用身份安全兜底回复。
- 重复候选回复会被跳过；整轮都重复时，兜底回复会强制转成追问、证据缺口或下一步动作。
- `fast` / `deep` / `long-document` 上下文深度已进入真实 LLM prompt，不再只是纯策略模块。

测试：
- Agent 记忆压缩为稳定上下文。
- 重复防护动作可生成具体重试指令。
- 学生兜底回复保持在体验边界内。
- 主流程策略链路覆盖事件路由、回合规划、分层上下文、消息元信息、重复防护和策略日志。

### P3-3 模块清理

目标结构：

```text
frontend/src/services/chatEngine/
  strategyTypes.ts
  capabilityProfiler.ts
  contextAssembler.ts
  eventRouter.ts
  turnPlanner.ts
  topicLifecycle.ts
  personalityAdapter.ts
  feedbackController.ts
  responseValidator.ts
  citationSelector.ts
  memoryTracker.ts
  evidenceClassifier.ts
  artifactBuilder.ts
```

验收测试：
- 每个纯策略模块有单元测试。
- 聊天室主流程通过新引擎完成开场、接话、反馈、总结、切换议题。
- 旧 `scheduler.ts`、`reactor.ts` 已删除，`chatEngine/index.ts` 不再导出旧 API。

当前状态：
- 主流程已通过新策略引擎完成开场、接话、反馈、失败恢复和日志记录。
- `scheduler.ts`、`reactor.ts` 已确认无 `frontend/src` 运行时引用，并从 `chatEngine/index.ts` 移除旧导出后删除。
- 新增 `chatRoomStrategyFlow.test.ts` 覆盖关键策略链路，避免旧模块删除后回退到旧接龙逻辑。
