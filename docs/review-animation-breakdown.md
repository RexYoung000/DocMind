# Review Animation Breakdown

参考视频：
[帮小忙-在线录屏.mp4](C:/Users/rex_y/Downloads/%E5%B8%AE%E5%B0%8F%E5%BF%99-%E5%9C%A8%E7%BA%BF%E5%BD%95%E5%B1%8F.mp4)

抽帧参考：
- [frame_00_00.00s.png](/D:/vibe%20coding/User_web/.tmp/review-video-frames/frame_00_00.00s.png)
- [frame_01_02.00s.png](/D:/vibe%20coding/User_web/.tmp/review-video-frames/frame_01_02.00s.png)
- [frame_02_04.00s.png](/D:/vibe%20coding/User_web/.tmp/review-video-frames/frame_02_04.00s.png)
- [frame_03_06.00s.png](/D:/vibe%20coding/User_web/.tmp/review-video-frames/frame_03_06.00s.png)
- [frame_04_08.00s.png](/D:/vibe%20coding/User_web/.tmp/review-video-frames/frame_04_08.00s.png)

## 1. Core Observation

这个视频的重点不是“炫技动画”，而是把长任务处理过程做成一个可读、可感知、可等待的状态舞台。

它的核心体验来自 5 个点：

1. 页面主体大面积留白，处理中的任务区域被聚焦为单一中心模块。
2. 进度容器使用细边框的彩色流动渐变，给人“系统仍在工作”的持续感。
3. 真正的进度不是靠大数字，而是靠“顶部横向进度条 + 逐步推进的状态日志”共同表达。
4. 已完成步骤被弱化，当前步骤被加重，用户视觉注意力永远只落在“现在做到哪一步”。
5. 右侧百分比和预计剩余时间只作为辅助，不抢主体信息。

## 2. Motion Decomposition

### 2.1 Scene Structure

- 左侧导航完全静止，不参与动画。
- 顶部工具区基本静止，只保留“停止”这种危险动作。
- 中央只出现一个大进度容器，说明系统在“单线程叙事”。

这意味着动画服务于“任务感”，不是服务于“页面热闹”。

### 2.2 Main Animated Object

主对象是一个超宽的进度卡片：

- 大圆角长条容器
- 极细的多色描边
- 描边颜色沿边缘缓慢流动
- 容器内部背景保持高亮、低噪音

这个描边不是高频闪烁，而是低速、连续、轻量的光谱流动。它提供的是“活着”的感觉，不是“催促”的感觉。

### 2.3 Progress Expression

视频里进度由 4 层组成：

1. 顶部深色细进度条
2. 右上角百分比
3. 左侧步骤日志列表
4. 右下角 ETA

其中真正最重要的是第 3 层。

步骤日志的状态层级非常清楚：

- 已完成步骤：低对比度、淡出
- 进行中步骤：黑色实心圆点 + 更高对比度文字
- 未完成步骤：不出现，或仅作为将来步骤轻描淡写显示

这比单纯 spinner 更高级，因为它能让用户感到“系统不是盲算，而是在推进一个可理解的流程”。

### 2.4 Tempo

从抽帧看，节奏不是跳变式，而是平滑推进：

- 百分比不是每帧快速闪动，而是阶段式推进
- 当前步骤文本在阶段切换时更新
- 渐变边框持续缓慢运动，承担“底噪级动感”

因此应拆成两类动画：

- 常驻慢动画：边框流光、轻微光晕
- 事件驱动动画：步骤切换、进度条推进、状态文字替换

### 2.5 Emotional Tone

这个动画系统的情绪不是兴奋，而是“系统性、可信、冷静、持续推进”。

对 DocMind 来说，这很适合评审过程，因为评审需要的是：

- 专业感
- 可等待感
- 过程透明
- 不是娱乐化 loading

## 3. Mapping to DocMind

### 3.1 What Should Be Borrowed

DocMind 评审过程应该借用这 6 个特征：

1. 单中心进度舞台
   不要同时出现太多动画对象，聚焦中间一块“评审过程卡”。

2. 流动边框
   用低速、轻量的多色边框流光表示“多角色并行推理”正在持续。

3. 结构化步骤日志
   将“解析文档 -> 对齐角色视角 -> 逐维度分析 -> 聚合共识/争议 -> 生成建议”拆成可读步骤。

4. 当前步骤高亮
   只强调当前步骤，其他步骤弱化，不要所有 chip 一起亮。

5. 轻量 ETA / 百分比
   只做辅助信息，不作为主视觉中心。

6. 危险动作外置
   “取消评审”要清晰可见，但不抢主进度的视觉。

### 3.2 What Should Be Adapted

DocMind 不应该照搬视频里的“通用任务进度”，而应该替换成教研评审语义：

- 视频中的“搜索策略、连接数据源”
  应替换为：
  - 解析文档结构
  - 提取教学目标
  - 分析重点与难点
  - 校验学习梯度
  - 汇总多角色分歧
  - 生成高价值建议

- 百分比推进不应该是机械匀速
  应该按阶段推进：
  - 文档解析快
  - 维度分析相对慢
  - 汇总阶段再快速收束

### 3.3 What Should Not Be Copied

以下内容不建议直接复刻：

1. 过宽的大面积空白
   DocMind 信息密度更高，评审页不能像工具面板那样留太多空。

2. 纯黑进度条
   DocMind 更适合用深靛蓝或墨蓝，而不是纯黑。

3. 通用任务文案
   必须换成教学评审语义，否则会显得像工程任务，而不是教研分析。

4. 完全无角色感
   DocMind 可以在步骤右侧加入“小型角色头像亮起”或“当前参与角色”提示，增强多角色特征。

## 4. Recommended DocMind Animation Spec

### 4.1 Container

- 容器形态：大圆角宽卡片
- 外轮廓：1.5px 多色渐变描边
- 背景：高亮浅色或暗色下低对比 surface
- 阴影：柔和，不厚重

### 4.2 Border Animation

- 类型：慢速 gradient travel
- 时长：`8s - 12s linear infinite`
- 强度：低
- 目的：表达“持续计算中”

### 4.3 Progress Bar

- 位置：容器顶部
- 高度：`6px - 8px`
- 动画：宽度平滑过渡 `400ms - 700ms ease-out`
- 颜色：深主色块

### 4.4 Step List

- 每步一行
- 已完成：`opacity 0.35 - 0.5`
- 当前步骤：高对比文字 + 实心点
- 将来步骤：不显示或弱显

### 4.5 Timing

- 步骤切换：`220ms - 320ms`
- 当前步骤高亮出现：`fade + slight rise`
- 完成步骤弱化：`opacity transition`
- 数字变化：不要滚轮数字，直接平滑替换

## 5. Implementation Advice

对 DocMind 当前项目，最适合的实现方式是：

- CSS 变量控制颜色、圆角、阴影、边框渐变
- React state 控制步骤推进
- 容器边框流光使用 `background` + `mask` 或伪元素渐变动画
- 步骤切换使用普通 CSS transition
- 不需要 Canvas / WebGL

建议的组件拆分：

- `ReviewProgressStageCard`
- `ReviewProgressBar`
- `ReviewProgressSteps`
- `ReviewProgressMeta`

## 6. Final Conclusion

这个视频最值得借鉴的，不是外观本身，而是它把“等待”设计成了一个有结构、有叙事、有节奏的过程。

对 DocMind 来说，正确的落地方向是：

- 把评审过程从“普通 loading”升级成“教研分析正在逐步推进”的过程卡
- 让用户看见评审在做什么，而不是只知道系统在转
- 保持专业、克制、轻量，不做花哨的科技特效
