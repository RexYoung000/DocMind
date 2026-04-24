# Chat Strategy Notes from Lumon1

参考项目：
[Lumon1](https://github.com/jason2kkk/Lumon1)

## 1. 结论

Lumon1 最值得借鉴的不是聊天气泡样式，而是它把“多角色讨论”做成了一个明确的状态机和回合制流程。

这正好对症 DocMind 当前聊天室的核心问题：

- 角色主动性不稳定
- 自动开口和继续接话缺少确定性
- 讨论容易变成“谁随机触发，谁就说一句”
- 用户看不清当前讨论到底处于哪一阶段

## 2. Lumon1 值得迁移的策略

### 2.1 显式状态机，而不是纯随机触发

Lumon1 前端和后端都有明确的 `debateStatus`：

- `idle`
- `debating`
- `debate_done`
- `generating_proposal`
- `proposal_done`
- `deep_diving`
- `deep_dive_done`

它的优点是：

- 每个阶段的 UI 和动作都稳定
- 用户知道系统在干什么
- 不是一堆消息随机冒出来

对 DocMind 的启发：

聊天室也应该有明确状态，而不是只靠 `active / closed`。

建议新增：

- `idle`
- `kickoff`
- `discussing`
- `summarizing`
- `closed`

### 2.2 回合制调度，而不是纯概率调度

Lumon1 的讨论不是“谁可能想说就说”，而是：

1. 先拆分话题
2. 每个话题按角色顺序发言
3. 每轮有明确开始和结束
4. 话题结束后再进入下一话题

对 DocMind 的启发：

当前 `shouldRespond + evaluateTriggers` 适合做“微观扰动”，不适合做“宏观推进”。

建议改成双层机制：

- 宏观层：显式回合调度器
- 微观层：保留 `chatEngine` 的触发器做局部追问、质疑、总结

### 2.3 先拆话题，再讨论

Lumon1 会先生成 topics，然后逐 topic 推进。

对 DocMind 的启发：

评审结果进入聊天室后，不应该直接自由聊，而应该先生成本轮讨论 agenda：

- 痛点 1
- 痛点 2
- 分歧点
- 优先建议

然后聊天室围绕 agenda 推进。

### 2.4 前序结论压缩

Lumon1 不会把全部历史原样灌给每个角色，而是把前序话题压缩成简短结论再带入下一轮。

对 DocMind 的启发：

当前聊天室上下文虽然已经带文档和评审摘要，但还缺：

- “上一轮聊出了什么”
- “下一轮该推进什么”

建议新增：

- `roundSummary`
- `currentTopic`
- `pendingTopics`

### 2.5 流式事件而不是只存最终消息

Lumon1 的 SSE 会发出多种事件：

- `message_start`
- `chunk`
- `message_end`
- `round_start`
- `topic_start`
- `topic_end`
- `debate_end`

这意味着 UI 不只是“显示消息”，而是“显示讨论过程”。

对 DocMind 的启发：

聊天室可以逐步补成事件流：

- `room_kickoff`
- `topic_start`
- `agent_turn_start`
- `agent_turn_end`
- `round_summary`

即使底层还是前端本地状态，也应该先把数据结构变成事件驱动。

## 3. 对 DocMind 的具体落地建议

### 3.1 第一阶段：补状态，不大改架构

- 给 `ChatRoom` 增加 `discussionState`
- 给 `ChatRoomStatusBar` 显示当前阶段
- 给聊天室增加 `currentTopic`
- 首轮自动讨论不再直接随机说话，而是先从 `topicTags / review.summary` 里选一个 topic

### 3.2 第二阶段：补回合调度器

- 新增 `discussionScheduler`
- 每轮最多 2-3 位角色
- 每轮结束后生成一句 `roundSummary`
- 如果用户插话，打断当前轮，进入新的用户驱动轮

### 3.3 第三阶段：补事件流 UI

- 系统消息不再只是普通提示
- 把“开始讨论某个话题”“本轮小结”“达成共识/出现分歧”做成结构化事件条

## 4. 现在最该做的事

如果只做一件事，优先级最高的是：

**把 DocMind 聊天室从“概率触发回复”升级成“话题驱动的回合式讨论”。**

因为这会直接解决：

- 主动性不稳定
- 讨论推进感不足
- 用户发一句后没人接
- 房间虽然有很多角色，但不像真的在开会

## 5. 不建议照搬的部分

以下内容不建议直接复制：

- Lumon1 的产品经理 / 杠精 / 投资人固定角色结构
- 过于产品机会分析导向的话题模板
- 它的完整多阶段产品研究链路

DocMind 只需要借它的“讨论状态机 + 话题驱动 + 回合推进 + 事件流”。
