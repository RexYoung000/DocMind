# DocMind Design DNA

基于 `design-dna` 方法论整理的当前项目设计基线，供后续页面和组件统一参考。

## 1. Design System

- Color
  - Primary: `#4F46E5`
  - Primary soft: `#EEF2FF`
  - Background: `#F5F3FF`
  - Text primary: `#111827`
  - Text secondary: `#374151`
  - Surface: `#FFFFFF`
  - Success: `#10B981`
  - Warning: `#F59E0B`
  - Error: `#EF4444`
  - Info: `#3B82F6`
- Typography
  - Tone: 清晰、克制、偏专业
  - Body: `Inter + PingFang SC + Microsoft YaHei`
  - Heading: 与正文同体系，但更高权重与更紧 tracking
- Shape
  - Small radius: `8px`
  - Standard card radius: `16px`
  - Hero / major panel radius: `24px+`
  - Pill radius: `9999px`
- Elevation
  - 普通卡片使用轻阴影
  - 重点卡片使用柔和多层阴影，不用重投影
- Layout
  - Max width: `1280px`
  - Page padding: `16px / 24px`
  - 以信息层级优先，不追求复杂瀑布流

## 2. Design Style

- Mood
  - 专业
  - 温暖
  - 清晰
  - 有一点智能感，但不过度科技化
- Composition
  - 页面先给总结，再给细节
  - 卡片化组织，但避免全站千篇一律的白卡堆叠
  - 关键动作优先置顶，低频动作往后收
- Interaction Feel
  - 反馈直接、轻量
  - Hover 明确但不过分跳动
  - 弹窗和提示遵循同一套表面语言

## 3. Visual Effects

- 策略
  - 只使用轻量视觉效果
  - 不引入 WebGL / 重 Canvas / 复杂 3D
- 允许的效果
  - 渐变背景
  - 柔和高光
  - 轻量位移与阴影过渡
  - 页面淡入、卡片微抬升
- 禁止项
  - 高频闪烁
  - 过重玻璃拟态
  - 大量噪点和粒子背景
  - 影响阅读的过强动效

## 4. Review Animation DNA

评审过程的动效基线来自视频参考的“任务推进卡”模式，详见：
[review-animation-breakdown.md](/D:/vibe%20coding/User_web/docs/review-animation-breakdown.md)

### design_system.motion

- philosophy
  - 把等待设计成“过程可见”，而不是普通 loading
- easing
  - `ease-out` 用于步骤推进
  - `linear` 用于边框流光
- duration_scale
  - micro: `180ms - 240ms`
  - normal: `260ms - 420ms`
  - macro: `8s - 12s`
- entrance_pattern
  - 评审卡淡入 + 轻微上移
- exit_pattern
  - 完成后整体降强调，不做重弹跳

### design_style.interaction_feel

- feedback_style
  - 让用户知道当前做到哪一步
- transition_personality
  - 冷静、连续、可信
- loading_style
  - 结构化步骤日志 + 顶部进度条 + 低速流光描边
- microinteraction_density
  - 低到中，重点放在状态推进，不做花哨 hover

### visual_effects.overview

- effect_intensity
  - low
- performance_tier
  - lightweight
- fallback_strategy
  - reduced-motion 下关闭流光，只保留静态描边与进度条
- primary_technology
  - CSS gradients + pseudo-elements + React state

### visual_effects.background_effects

- type
  - `gradient-border-travel`
- description
  - 宽进度卡外轮廓使用缓慢流动的多色渐变描边，表达系统持续工作中
- technology
  - CSS pseudo-element

### visual_effects.text_effects

- type
  - `stepwise-status-update`
- description
  - 当前步骤高亮，已完成步骤降透明度，步骤切换时用轻量 fade/translate 过渡
- technology
  - CSS transition

## 5. Apply Rules

## 4. Apply Rules

- Dashboard
  - 作为工作台，应优先展示下一步动作和运行概况
- Review Detail
  - 先总览诊断，再展示痛点、建议和分角色细评
- Review Create / Review Running
  - 用单中心进度卡替代普通碎片化 loading
  - 步骤必须是教研语义，如“解析教学目标”“分析难点突破”“聚合多角色分歧”
  - 百分比和 ETA 只能辅助，不应压过步骤本身
- Chat Room
  - 保持工具感和实时感并存，弱化“花哨”，强化“讨论推进”
- Shared Components
  - 所有反馈组件优先复用统一 Button / Card / Input / Badge / ConfirmDialog / Toast
