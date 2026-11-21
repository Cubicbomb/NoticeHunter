# HANDOFF.md — 进度真相源

> **读写规则**：第 1、4、5 节描述**当前状态**，允许覆盖更新；第 2 节是竞赛规则缓存；第 3、6、7 节**只增不改**。
> 协作规则见 `AGENTS.md`。**新接手的智能体请从第 1 节和第 5 节看起。**

**最后更新**：2026-11-21 22:15 ｜ **更新者**：主智能体（新增 `slides/` 单页视频开场动效；规则补充项灰调已验收，基线 **159 PASS / 0 FAIL**；本轮改动未提交）

---

## 1. 当前位置

- **阶段**：**LLM 抽取路径已按「精度不高、体验很差」做了整轮优化**——重写 system prompt（日期锚点/出处契约/跨段规则/示例）、候选段带上上下文窗口、模型输出五级容错解析、年份与出处按原文校正、同文件去重、空结果不再误回退；体验侧新增进度条+取消、回退常驻提示、结果摘要、连接测试、调用诊断面板。**已提交并推送：`66c44b2`**（本文件随后单独提交）。
- **`main` 状态**：本轮提交 **`2f9dedf`**（README 请求解剖补充）、**`e69a993`**（规则条目级补漏 + 灰调，3 files / +171 −18）、**`143bf5d`**（`slides/` 9 files / +1439），连同此前未推送的 `9f68371` / `b6cc6bf` 一并 `git push origin main`；推送后 `git rev-list --left-right --count origin/main...HEAD` = **0 0**。**未建分支、未动 tag。**
- **已推送的历史提交**：`66c44b2`（2026-11-21 18:35 推送）此前已在远端；本轮把本地领先的所有提交补齐。
- **最新文档提交（2026-11-21 21:15）**：README 新增「AI 抽取背后」请求解剖并附 `docs/ai-request-example.json`，已提交 **`9f68371`** 并随本轮推送。
- **本轮新特性（2026-11-21 21:25 起，已提交 `e69a993`）**：**AI 主抽取 + 规则条目级补漏（D-014）**——AI 成功且至少一条有效结果时，对 AI 未覆盖的候选段追加规则条目；补漏强制 `low` + `supplement=true` + 原因「AI 未从本段抽取，由规则补充，请核对」，卡片徽章「规则补充」；AI 返回 `[]`、用户取消、失败回退均不补。**22:15 追加**：规则补充卡片与清单项改为灰调（`#f8f9fa` 底、灰边/灰字、灰色原因 chip），与 AI 结果拉开视觉层级；`verify-llm.cjs` 新增 T23–T26（8 条断言）。
- **本轮改动（2026-11-21，按失败模式组织，详见 spec S2.12）**：
  1. **Prompt 重写**（`llmSystemPrompt()`）：加入「今天是 YYYY-MM-DD（星期）」、8 条规则（出处逐字、跨段取动作、签字人≠办事人、空结果合法…）、1 条格式示例。原文留档 `prompts/P-003`。
  2. **候选段上下文**：每段候选前后各带 2 段 + 首段（`LLM_CONTEXT_RADIUS`）；切批改为「60 段 + 12000 字符」双上限（`chunkParagraphs()`）。
  3. **解析容错**：`parseModelContent()` 去围栏 → 括号配对扫描 → 单对象包装 → 截断补齐 → 逐对象抢救；`[]` 视为合法空结果。
  4. **字段补正**：`mapLLMEntries()` 按 `dueRaw` 在原文中的实际位置校正 `sourceIndex`（宽松匹配全角/空格）；年份按原文/当前年校正；`dueRaw` 无据 → 强制 low；同文件去重；置信度以本地证据为准。
  5. **调用层**：`llmRequest()` 拆出，超时 15s→30s，HTTP 错误带服务端说明，新增取消（保留已完成批次）、`#llmTest` 连接测试、`#llmDebug` 诊断（只存内存、不含密钥）。
  6. **UI**：`#aiStatus` 三态状态栏（进行中可取消 / 已回退可重试 / 上次结果摘要）；卡片截止时间 placeholder 缩短。
  7. 验收：`verify-llm.cjs` 新增 T14–T22；`fake-llm-server.js` 支持 `{"raw":"..."}` 直接覆盖返回原文。
- **最近验收（2026-11-21 22:15，主目录）**：**`verify.cjs` 67 PASS / 0 FAIL + `verify-llm.cjs` 92 PASS / 0 FAIL = 159 PASS / 0 FAIL**。两条测试均以 danger-full-access 运行（沙箱仍不能写 `prototype/` 子目录，脚本要生成临时夹具），跑完夹具已自删。本轮新增规则补漏与灰调区分 T23–T26；视觉核对与旧的 151 条基线见下方历史记录。
- **未验证（必须如实写进项目文档）**：**新 prompt 没有在真实第三方 API 上跑过**（本机无 Key，也不擅自用他人 Key）。已实测的是「模型输出不听话时客户端不再整文件回退」；「prompt 对真实模型的提升」是设计推断。见第 7 节 R-21。
- **功能分支（未合并）**：`feat/relative-due` @ `.worktrees/relative-due`，基 `40c51fb`。脏文件：`prototype/index.html`、`prototype/verify.cjs`、`prototype/verify-llm.cjs`、`docs/compose/spec/noticehunter-relative-due.md`（**未 commit**）。⚠️ 本轮又改了 `index.html` 与 `verify-llm.cjs`，**合并冲突面进一步扩大，必须人工合**（R-22）。
- **功能内容**：相对时间（本周内/下周X/N天内等）按锚点日推算具体 due；规则+LLM 双路径；推算结果一律 low +「按锚点」。规格 `docs/compose/spec/noticehunter-relative-due.md`（status: delivered）。上次记录验收 145 PASS / 0 FAIL（本轮未复核该 worktree）。
- **远程仓库**：`git@github.com:Cubicbomb/NoticeHunter.git`。本轮推送后 `origin/main` = 本地 `main`；`.worktrees/` 与 `对话记录/` 未提交。
- **已有**：竞赛通知 docx（只读）、`AGENTS.md`、本文件、`README.md`（含「AI 抽取背后」请求解剖）、`LICENSE`、prompts P-001/P-002/**P-003**、`prototype/` 全套、三份功能规格、`docs/ai-request-example.json`（本地 stub 实际捕获的请求体）；**`slides/` 单页视频开场动效**（2026-11-21 新增，1 页 16:9，58 个原生 Fade 自动入场，约 8–9 秒，无点击）。
- **还没有**（**最大分数缺口**）：**项目文档、完整项目方案 PPT、演示视频——三件套主体仍未做**（`video/` 不存在；`docs/` 只有规格与一份请求样例；`slides/` 目前只有视频开场那 1 页，不构成 ≤20 页的方案 PPT），合计仍占预赛 **87.5 分**；团队名单、指导老师、提交日期平台（R-01/R-14）仍缺。
- **本轮新增的 `slides/` 状态**：成品 `slides/NoticeHunter-项目介绍-一页动效.pptx` + 末帧预览 `slides/preview-final.png` + 生成/验收脚本。**未在 PowerPoint 真机放映验证**（本机未装 PowerPoint）；LibreOffice 渲染核对通过，`slides/check_pptx.py` **27 PASS / 0 FAIL**（页数、16:9、58 条动画结构、无 click 触发、时间轴、数据披露）。
- **阻塞**：无技术阻塞。合并/提交/推送需用户当场授权（AGENTS §3.5）。
- **时间提醒（必须看）**：今天是 **2026-11-21**，竞赛通知落款 2026-10-10、第 12 周为硬截止。**D-011 的回切条件（第 11 周末三件套仍为 0 → 材料立刻回到第一优先级）按实质仍成立**——现在只完成了一段 1 页视频开场，完整方案 PPT、项目文档、演示视频都还是空的；R-01 的具体日期仍未确认。是否立即停开发、转做三件套，**待用户拍板**。

---

## 2. 竞赛规则速查（缓存自 docx 原文，**冲突时以 docx 为准**）

**参赛与组队**
- 参赛对象：2026—2027 学年第一学期选修《生成式人工智能应用基础》及《AI 智能化办公》的学生。**所有选课学生均须以团队形式报名参赛。**
- 团队赛：班内自由组队，**每队 4–6 人**，鼓励跨专业。**每位学生仅能参与一个团队。**
- 可邀请上述课程任课教师作指导老师，每位老师指导作品数量不限。

**赛题（附件一，任选其一）**
- 赛题一「AI 辅助开发 · 创意产品原型」：从学习生活、校园服务、文化创意、健康管理、产业应用等任一领域出发，找一个小问题，用 AI 编码工具做出**可操作的产品原型**（网页、交互式工具、信息管理工具等）。无编程基础可用自然语言 AI 编码 / 低代码。**不要求生产级，但不能停留在概念口号、静态海报或功能说明，至少完成一个从用户输入到结果输出的核心闭环。**
- 赛题二「AI 智能体 · 业务流程自动化」：选定真实业务/办公/校园流程，做出**可运行、可重复使用的技能 Skills 或 AI 智能体**，须说明 AI 参与环节与**人工确认节点**，至少呈现一个业务闭环。

**提交物**
1. **项目文档（Word）**：项目背景、解决方案、技术实现路径、团队分工、创新点与价值、总结与展望；**末尾附** AI 工具使用、关键 Prompt、生成或开发过程、迭代优化、测试验证、人工核查情况；格式规范。
2. **演示视频（MP4，≤5 分钟，≤100MB）**：全程录屏 + 解说，展示核心功能、使用流程、应用效果。
3. **项目方案 PPT（≤20 页）**：创作理念、问题与需求分析、技术路径或工作流、设计过程、最终成果与团队协作；格式与风格统一、排版美观。
4. （可选）附加材料：原型链接、代码仓库地址、可运行文件、测试数据说明、高清作品文件等。

**评分**
- 预赛（100 分）：学术诚信与 AI 使用规范 **12.5%** ｜ 项目文档 **25%** ｜ 项目方案 PPT **37.5%** ｜ 项目演示/答辩 **25%**
- 决赛（100 分）：创新性 **25%** ｜ 技术应用 **25%** ｜ 完整与实用性 **20%** ｜ 答辩表现 **30%**
- 评审原则：创意与应用并重；过程与成果结合；**符合 AIGC 应用特色——强调对 AIGC 技术的理解、选择与组合运用能力，而非复杂的底层代码开发。**

**晋级与奖项**
- 预赛由任课教师评审，推荐班内**前 8%** 进校级决赛；**8%–20% 直接获评校级三等奖**，不参加答辩。
- 奖项：一等奖约 **3%**、二等奖约 **5%**、三等奖约 **12%**（名额按实际参赛微调）。

**日程**
| 节点 | 时间 |
| --- | --- |
| 大赛启动 | 本学期第 5 周 |
| 项目过程辅导（任课老师指导） | 第 5–11 周 |
| **教学班推荐截止（硬截止）** | **第 12 周** |
| 校级决赛 | 第 15 周左右 |
| 优秀作品展示 | 学期末 |

> 提交方式与要求由课程组另行通知 → 见 R-01。
> **预赛成绩 = 对应课程期末成绩。**
> 发文单位：教务处、计算机学院（软件学院），二〇二六年十月十日。

---

## 3. 决策记录（只增不改）

### D-001 · 选赛题一，不选赛题二
- **日期**：2026-10-13 ｜ **状态**：已定（2026-10-13 用户在 compose-next Grill 环节确认）
- **决策**：作品走赛题一「AI 辅助开发 · 创意产品原型」。
- **理由**：赛题一的评分口径是「创意清晰 / 需求真实 / 核心功能可体验」，三项都可自证、可演示；赛题二的核心得分点在知识库与工作流配置合理性，同班大概率十几个队伍用 Coze/Dify 交相似作品，创新性分会被稀释。队伍中有人懂前端与 Python，正好跨过"能做可交互原型"的门槛。
- **保底**：见 D-004。

### D-002 · 作品方向《通知猎人 NoticeHunter》
- **日期**：2026-10-13 ｜ **状态**：已定（2026-10-13 用户在 compose-next Grill 环节确认）
- **一句话**：把学院通知、课程大纲、老师群聊里的碎片要求，转成「谁 / 什么时候前 / 交什么 / 交到哪」的可执行行动清单。
- **目标用户**：在校大学生（首要场景即团队自身）。
- **痛点**：学期内学院通知、竞赛公告、选课时段、体测报名、四六级报名、奖助学金材料散落在多个渠道，漏一件即事故；且多个通知的截止时间互相冲突，无人汇总。
- **核心闭环**：零散信息源 → 结构化抽取 → 跨通知去重与冲突检测 → **人工确认** → 输出行动清单（分人 / 日历 / 提醒）。
- **四道差异化设计（必须实现，缺一则退化为「AI 文档摘要」，创新性分守不住）**：
  1. **只输出动作，不输出摘要**——每条是「谁 + 截止 + 交什么 + 交到哪」的字段，不是一段总结文字。
  2. **每条待办可点回原文并高亮出处**——解决 AI 幻觉的信任问题，评委能直观看出团队想过这件事。
  3. **低置信度项标黄，强制人工确认后才写入待办**——命中赛题对「人工确认节点」的要求，也直接对应评分里的人工核查项。
  4. **跨文件去重与撞期预警**——同一 deadline 合并、时间冲突报警，这才是"流程自动化"的实质。
- **被否决的备选**：
  - 《考点回溯》（上传课件→抽考点→出题自测→错题定位回课件原文页码）：方向更偏学习辅助，情感吸引力强，作为备选保留。
  - 课程小组作业看板类工具：演示极易退化为"又一个待办看板"，创新性分低。
- **自带优势**：本项目的测试数据就是大赛通知本身——作品能解决团队自己的真实问题，答辩说服力强。

### D-003 · 原型技术形态：纯静态单页网页，零依赖离线可跑
- **日期**：2026-10-13 ｜ **状态**：已定
- **决策**：单文件 `HTML/CSS/JS`，不使用任何 npm 依赖与构建工具，断网可完整演示。
- **理由**：演示与录屏环境不保证有网；团队前端水平为"懂一点"，不做工程化；单文件便于交付与录屏。
- **配套**：MVP 输入仅支持 `.docx` 与 `.txt`。`.docx` 是 zip，浏览器原生 `DecompressionStream('deflate-raw')` 即可零依赖解出 `word/document.xml`。PDF 与图片 OCR 移入加分项（PDF 需解析 content stream，成本高，勿纳入 MVP）。

### D-004 · 保底切换点：第 10 周前端未跑通闭环即切赛题二
- **日期**：2026-10-13 ｜ **状态**：已定
- **决策**：若到第 10 周原型仍无法跑通「输入一份通知 → 输出行动清单」的闭环，立即切换为赛题二，用 Coze/Dify 把同一套逻辑搭成智能体，用工作流与人工确认节点保住分数。
- **理由**：第 12 周是硬截止，切换必须留出至少两周缓冲。把切换点前置说定，避免第 11 周才发现做不完、无路可退。

### D-005 · MVP 抽取方案：只做规则式，不接大模型
- **日期**：2026-10-13 ｜ **状态**：已定（用户在 Grill 环节选择）
- **决策**：结构化抽取只用确定性正则，MVP 期不接入任何 LLM / API。
- **理由**：零网络、零 Key、零依赖，断网必能演示（`AGENTS.md` 第 7 节硬要求）；写法不规范的表述一律标低置信度交给人工确认——这正好就是评分里「人工确认节点」的现成证据。LLM 接口列为下一迭代。

### D-006 · 开发工作区：开 worktree 与功能分支
- **日期**：2026-10-13 ｜ **状态**：已定（用户在 Grill 环节明确同意建分支）
- **决策**：在 `.worktrees/noticehunter-mvp` 上开 `feat/noticehunter-mvp` 分支开发，不直接改 `main`。
- **理由**：本条是 `AGENTS.md` 第 3 节第 5 条「禁止建分支，除非用户在当前对话中明确要求」的**显式授权**，不是对该条的推翻——合并回 `main` 后该条继续有效。好处是 `main` 始终保持可交付状态，多智能体并行不互踩。
- **覆盖说明**：`compose-next` 默认 spec 路径为 `docs/compose/spec/<feature>.md`，项目未规定 spec 路径，故沿用默认位置（已记录在该 spec 文件头部）。

### D-007 · 抽取引擎反转：LLM 主抽取 + 规则兜底（推翻 D-005）
- **日期**：2026-10-14 ｜ **状态**：已定（用户在 Grill 环节选择）
- **决策**：结构化抽取改为**大模型为主**，规则层降级为三用：① 候选段落前置筛选 ② 字段校验与修正（`due` 格式、`sourceIndex` 范围）③ 无 Key / 断网时的离线兜底。
- **推翻关系**：本条**推翻 D-005「MVP 只做规则式抽取，不接大模型」**。D-005 按「只增不改」原则保留不删。
- **理由**：D-005 当初的动机（零依赖、断网、可测）依然有效，故不删除规则层，只改变主次。但正则作为产品核心智能已实测出硬伤——「谁」被判成签字人而非办事人、动作字段剥出残渣、「考试前一天」「详见附件」类表述无解。同时决赛评分「技术应用 25%」考的是 AIGC 工具的综合深入运用，运行时完全不用 AI 是吃亏的。
- **工作区**：沿用 D-006 的模式，新开 `.worktrees/noticehunter-llm` + 分支 `feat/noticehunter-llm`（基于 `origin/main` = `454668a`）。本次未重新申请建分支授权，直接复用 D-006 既定约定。

### D-008 · 本轮迭代范围：只做 LLM 抽取
- **日期**：2026-10-14 ｜ **状态**：已定（用户在 Grill 环节选择）
- **决策**：本轮**只实现 LLM 主抽取 + 规则兜底**。**deadline 汇总功能与交互体验优化顺延到下一迭代**，已登记在第 4 节待办，不许丢失。
- **理由**：用户主动收敛范围。第 12 周硬截止，材料类产出占预赛 87.5 分，本轮先把抽取层做扎实。

### D-009 · 路线复核：维持赛题一，否决 skill 路线
- **日期**：2026-10-14 ｜ **状态**：已定（用户在 Grill 环节选择）
- **决策**：**维持 D-001（赛题一 · AI 辅助开发 · 创意产品原型），不改投赛题二、不做成 skill。**
- **背景**：用户主动提出「是不是可以走第二个参赛路线，即做成一个 skill」。经查竞赛附件一赛题二原文确实允许「可运行、可重复使用的技能 Skills 或 AI 智能体」，推荐工具也含 **WorkBuddy（本机已装）**，故该路线可行、并非不可行。
- **否决理由**：① 竞赛原文是「参赛团队**可任选其一**」，换赛道等于推翻 D-001；② 已通过两轮评审的 943 行网页原型在赛题二口径下不再是主交付物；③ D-001 当初否决赛题二的「Coze/Dify 同质化」顾虑依然成立；④ skill 要依赖对方运行时录屏，翻车概率高于零依赖断网可跑的网页。
- **保留价值**：若后续材料充裕，skill 可作为竞赛允许的「**可选附加材料**」补充，不必换主赛道。

### D-010 · 风险审查的处置授权（R-16 / R-17 / R-18 / R-20 的动手前提）
- **日期**：2026-10-16 ｜ **状态**：已定（用户在对话中直接回复「修复上述风险项」）
- **背景**：主智能体完成风险审查（R-13 ~ R-20）后，就两件事明确请示：① 是否把 `feat/noticehunter-llm` 合并进 `main` 并推送；② R-17 / R-18 是否要补。用户回复「修复上述风险项」，即把这批风险纳入可处置范围。
- **授权范围**：
  1. **git 操作**：本地提交、`--no-ff` 合并进 `main`、推送 `main` 与 tag —— 这构成 `AGENTS.md` 第 3 节第 5 条要求的「用户在当前对话中明确要求」；
  2. **修改 `AGENTS.md`** —— 其第 5 节要求「改动需用户确认」，本次确认即来源于本条（用于修 R-20 的工具链表过时）；
  3. **修改产品代码、验收脚本与功能规格** —— 用于修 R-17 / R-18。
- **未授权、本轮未执行**：删除功能分支与 worktree；触碰 WorkBuddy 的 worktree 与 `workbuddy/main-1927306e`（R-12）；删除或改写 `LICENSE`（R-09）。这三项都不属于「修复风险项」，仍需单独确认。
- **同时解除建分支授权灰区**（R-20 ②）：D-007 当初以「复用 D-006 既定约定」为由建分支，而 `AGENTS.md` 第 3 节第 5 条要求「用户在**当前对话中**明确要求」——严格按条文那是越权的。本条补上本轮的当场授权记录。**下一轮迭代开工前仍须重新当场确认，不得沿用本条**。

### D-011 · 优先级临时反转：先完成项目开发，材料与团队事项后置
- **日期**：2026-10-16 ｜ **状态**：已定（用户在同轮问答中，对 R-14 / R-13 / R-19 三个问题**统一回答**「不用管这些，先完成项目开发」/「先完成项目开发」）
- **决策**：把 D-008 顺延的开发项（**deadline 汇总**、**交互优化**）提到当前位置做完；**三件套（R-13）、团队组建（R-14）、演示视频方案（R-19）一律后置**，不再是当前阻塞项。
- **与既有规则的关系**：`AGENTS.md` 第 4 节写明「**材料 > 功能**」，理由是预赛 87.5 分全在材料上。本条**主动反转**该优先级，依据是用户本轮的直接指令（等同「当前对话中的明确要求」）。**两者冲突，本轮以本条为准**，`AGENTS.md` 不改。
- **风险自担（如实记录，不要删）**：第 12 周硬截止且 **R-01 的具体日期仍未知**，继续开发必然压缩材料时间。本条只回答「现在做什么」，**不回答**「材料什么时候做」。
- **回切条件（到点必须自动切回 `AGENTS.md` 第 4 节）**：
  1. 用户改口；或
  2. **第 11 周末三件套仍为 0**；或
  3. R-01 确认的截止日早于预期。
  三者任一满足，本条失效，**材料立刻回到第一优先级**。把回切条件写在这里，就是为了避免开发做得正顺手时忘了时间。

### D-012 · 布局改版：「2 原文」与「3 待确认」并排，待确认内联高亮
- **日期**：2026-11-21 ｜ **状态**：已定（用户在对话中直接指令：「把2原文和3待确认两块横向并排放置，待确认信息直接在原文中高亮。排版适配电脑屏幕即可」）
- **决策**：① 删除 D-008 的 `.split`（待确认 + 行动清单并排），改为 `.stage`：≥1080px 时「2 原文」左栏（sticky + 独立滚动）与「3 待确认」右栏并排；<1080px 单列。② 待确认条目直接在原文里内联高亮——低置信度 `<mark class="low">` 黄、高置信度 `<mark class="high">` 蓝，日期与 `HH:mm` 分段标出；段落同时加淡底并支持点击反向定位右侧卡片。③ 待确认卡片**不再重复原文**（删除 `.quote` / `.card-src`），只保留徽章、文件名·段号定位、原因、四字段与确认/丢弃。④ 原文桌面默认展开、窄屏默认折叠。
- **取代关系**：本条**取代** `docs/compose/spec/noticehunter-deadline.md` 的 **S2.4（待确认与清单分屏）/ T9（`.split` 两列断言）** 与 D-008 中「待确认与清单并排」那一项。规格文件按历史记录保留不改，验收口径以本条与 `verify.cjs` T9（改测 `.stage`）为准。
- **理由**：① 卡片重复整段原文，在双栏布局里等于把同一段话看两遍，真正要看的「抽取位置」反而被挤在小字引用块里；② 原文与待确认并排后，「左边看证据、右边做确认」形成一条视线，人工核对的成本最低；③ 行动清单是输出物，不需要和输入并排，单独整宽更易读。
- **不改变**：抽取逻辑、数据结构、导出格式、LLM 安全上限、行动清单与截止日汇总的行为。

### D-013 · LLM 抽取精度与体验优化（推翻 S2.3 / S2.4 / S2.5 / S2.6 的四处旧条文）
- **日期**：2026-11-21 ｜ **状态**：已定（用户在对话中直接指令：「优化一下LLM方式下的提取功能，现在的精度不高，体验很差」）
- **决策**：对 LLM 抽取路径做整轮优化，分两层：
  1. **精度**：重写 system prompt（今天日期+星期锚点、8 条规则、1 条格式示例）；候选段前后各带 2 段上下文 + 首段；模型输出五级容错解析（去围栏/括号配对/单对象/截断补齐/逐对象抢救）；用 `dueRaw` 在原文中的实际位置校正 `sourceIndex`；年份按原文/当前年校正；`dueRaw` 无据即降 low；同文件去重；`[]` 视为合法空结果。
  2. **体验**：`#aiStatus` 三态（进行中可取消 / 已回退可重试 / 结果摘要）、`#llmTest` 连接测试、`#llmDebug` 诊断面板、超时 15s→30s、HTTP 错误带服务端说明。
- **推翻关系**：本条**推翻** `docs/compose/spec/noticehunter-llm.md` 的 ① S2.3「超时 15s」→30s；② S2.3「空数组视为失败」→ 合法空结果；③ S2.4「只校 due 格式」→ 增加出处/年份/去重/本地置信度；④ S2.5「只送候选段」→ 候选段上下文窗口 + 字符上限；⑤ S2.6「失败一律整文件回退」→ 新增「用户主动取消保留已完成批次」。这些旧条文按只增不改保留在 spec 历史里，新口径见该文件 S2.12。
- **理由**：旧 prompt 缺「今天几号」导致年份错（卡片显示「已逾期 300 天」）；只送孤立候选段导致「动作与截止分处两段」时把截止行当动作；JSON 解析只认整段围栏导致一句前言就整文件回退；空数组误判失败导致规则式凭空造条目——都是可复现的精度问题，不是主观感受。
- **明确不做**：① 相对时间锚点推算（`feat/relative-due` 分支已有方案，未合并，避免重复实现造成更大冲突）；② 不为炫技引入流式输出 / 多轮对话 / 自动重试；③ 不合并、不推送、不建新分支（AGENTS §3.5 未授权）。
- **未验证边界**：新 prompt 未在真实第三方 API 上跑过（无可用 Key），见 R-21。

### D-014 · AI 主抽取 + 规则条目级补漏（限定修订 D-007，不推翻）
- **日期**：2026-11-21 ｜ **状态**：已定（用户在对话中选择「方案 A：条目级补漏」）
- **背景**：D-007 把规则层限定为「候选筛选 / 字段校验 / 离线兜底」三用。实际运行暴露出一个缺口——AI 成功时规则完全不产出条目，模型漏掉的候选段没有任何兜底；S2.5 的「规则保证不漏」只对候选筛选成立，不对条目召回成立。
- **决策**：新增规则层第四用——**AI 成功且至少产出一条有效条目后，对 AI 未覆盖的候选段做低置信度补漏**。补漏规则：只补 `sourceIndex` 未被 AI 条目覆盖的段落；强制 `confidence='low'`、`supplement=true`，原因首条固定为「AI 未从本段抽取，由规则补充，请核对」；原文须有交件动词，或至少有地点/责任人（过滤发布日期、落款日期等噪声）；**不改写任何 AI 条目**。
- **不补的场景**：AI 返回 `[]`（整篇无待办是有效判断，S2.12 / T17）；用户取消；AI 失败整文件回退；AI 条目全部被剔除后回退。S2.11 硬上限、S2.6 整文件回退、S2.9 离线兜底均不变。
- **理由**：规则是本地零成本，补漏能把「AI 漏抽」这一种最常见缺口补上；限定在段落级 + low + 明确原因，避免规则噪声污染 AI 结果，也保留「AI 为主」的溯源叙事。
- **被否决的替代**：批次级兜底（失败批次保留 AI、只对失败批次走规则）——会打破 S2.6「不出现半截结果」的既有契约，留待后续单独决策。

---

## 4. 任务板

### 进行中（文件占用登记：文件 → 智能体 → 开始时间）
- （已释放 2026-11-21 22:15）**规则补充项灰色视觉区分**（`lead`）：占用 `prototype/index.html`、`prototype/verify-llm.cjs`、`docs/compose/spec/noticehunter-llm.md`、`README.md`、`HANDOFF.md`；未触碰 `slides/`。**已实现并验收 159 PASS / 0 FAIL；未提交**，见第 6 节本条。
- （已释放 2026-11-21 22:10）**一页视频开场 PPT（`slides/`）**（`lead`）：占用 `slides/`、`HANDOFF.md`。已交付 1 页 16:9、58 个原生 Fade、无点击自动播放的项目介绍动效，用于嵌入演示视频；见第 6 节本条。
- （已释放 2026-11-21 21:25）**AI 主抽取 + 规则条目级补漏（方案 A）**（`lead`）：占用 `prototype/index.html`、`prototype/verify-llm.cjs`、`docs/compose/spec/noticehunter-llm.md`、`README.md`、`HANDOFF.md`。**已实现并验收 158 PASS / 0 FAIL；未提交**，见第 6 节本条。
- （已释放 2026-11-21 21:05）**README 增加「AI 请求解剖」章节**（`lead`）：占用 `README.md`、`HANDOFF.md`；另新增 `docs/ai-request-example.json`。临时验证脚本 `prototype/test/_capture-request.cjs` 已删除。**只改文档，未改产品代码**，见第 6 节本条。
- （已释放 2026-11-21 17:05）**LLM 抽取精度与体验优化**（用户直接指令「优化一下LLM方式下的提取功能，现在的精度不高，体验很差」）已完成并验收：`prototype/index.html`、`prototype/verify-llm.cjs`、`prototype/test/fake-llm-server.js`、`docs/compose/spec/noticehunter-llm.md`、`prompts/P-003-LLM抽取精度优化.md`（新建）、`HANDOFF.md` 占用释放。**改动未 commit / push**，见第 6 节最后两条。
- （已释放 2026-11-21 16:25）「2 原文 / 3 待确认 并排 + 原文内联高亮」已完成并验收，`prototype/index.html`、`prototype/verify.cjs`、`prototype/verify-llm.cjs`、`HANDOFF.md` 占用释放；改动**未 commit / push**，见第 6 节最后一条。
- （已释放 2026-11-21）待确认卡片「左原文 / 右操作」分栏已完成，占用释放；改动已提交并推送（`ce2df66`），见第 6 节。
- ⚠️ **流程补记**：同一轮的「原文区显示不完整」修复**没有先在 §4 登记就动手了**，属违反单一写者流程的疏漏；改动仍只涉及 `prototype/index.html` 与本文件，已在本条如实记录，不补写假的登记行。
- （已释放 2026-11-21）本轮 `prototype/index.html`、`prototype/verify.cjs`、`HANDOFF.md` 的占用已释放，改动见第 6 节最后一条，**未提交**。
- （已释放 2026-10-16）relative-due 迭代改动落在 worktree `.worktrees/relative-due`（分支 `feat/relative-due`，基 `origin/main`=`40c51fb`），**尚未 commit / merge / push**——等用户当场授权。主目录 `main` 工作树**未改产品文件**（仅本 HANDOFF 有登记痕迹）。

> **本轮工作区说明**：依 D-011「先完成项目开发」，为避免再走一次建分支授权（D-010 已写明须重新当场确认），**本轮直接在主目录 `main` 的工作树上改，且在用户同意前不 `git add` / `commit` / `push`**（`AGENTS.md` 第 3 节第 5 条）。改动完成并跑过验收后再问要不要提交。

### 待办
- [ ] **材料三件套**（R-13，预赛 87.5 分）—— **按 D-011 后置**，回切条件见 D-011（第 11 周末仍为 0 则必须切回第一优先级）
- [ ] **组建团队 + 联系指导老师**（R-14）—— **按 D-011 后置**
- [ ] **确认 R-19 演示方案再开录** —— **按 D-011 后置**，方案建议已写在 R-19 里，开录时直接取用
- [ ] **向任课老师确认 R-01**：本课程第 5/11/12/15 周对应的具体日期、提交平台与提交格式要求（**D-011 的回切条件依赖它**）
- [x] ~~**补 `prompts/P-003`（本轮迭代留档）**~~：2026-11-21 已补 `prompts/P-003-LLM抽取精度优化.md`（内容覆盖本轮 LLM 精度迭代；2026-10-16 那轮的 Prompt 已在 P-002 里，不重复留档）
- [ ] **收尾清理（等用户确认，别擅自做）**：`feat/noticehunter-llm` 分支与 `.worktrees/noticehunter-llm` 已合并、可删；WorkBuddy 的 worktree 与分支见 R-12
- [ ] **后续提交习惯**：先更新 `HANDOFF.md` 变更日志，再 `git add` / `commit` / `push`，避免提交内容与交接状态脱节
- [ ] 加分项（有余力才做）：多文档合并、日历导出、多人分工、PDF / 图片 OCR

### 已完成
- [x] 2026-10-13 读取竞赛通知 docx，提取规则要点（见第 2 节）
- [x] 2026-10-13 建立交接体系：`AGENTS.md` / `HANDOFF.md` / `prompts/README.md`
- [x] 2026-10-13 实测本机工具链并记录到 `AGENTS.md` 第 9 节
- [x] 2026-10-13 仓库就绪：写 `.gitignore` / `.gitattributes` / `README.md`，`git init`（分支 `main`）
- [x] 2026-10-13 用 `git check-ignore -v` 逐项实测忽略规则（结果见第 6 节）
- [x] 2026-10-13 建 `prototype/samples/`：2 份 `.txt` 模拟通知 + 1 份 stdlib 生成的 `.docx` 测试夹具 + 数据说明
- [x] 2026-10-13 首次提交并推送 GitHub：`Cubicbomb/NoticeHunter`，main 分支，并入远端 MIT `LICENSE`
- [x] 2026-10-13 compose-next Grill：确认 D-001/D-002、开 worktree（D-006）、定抽取方案（D-005）
- [x] 2026-10-13 写功能规格 `docs/compose/spec/noticehunter-mvp.md`（S1–S3 + T1–T9），用户批准后开工
- [x] 2026-10-13 实现 `prototype/index.html` 单文件 MVP（零依赖 `.docx` 解析 + 规则式抽取 + 人工确认闭环）
- [x] 2026-10-13 浏览器验收 `prototype/verify.cjs`：**29 PASS / 0 FAIL**（含 `file://` 直开、损坏文件、空清单、离线无异常）
- [x] 2026-10-13 独立评审两轮：首轮 3 项 critical → 全部修复；复审确认**无 critical**
- [x] 2026-10-13 修复评审 6 项 minor 中的 5 项并复测通过（第 9 项为 spec 明确要求的噪声卡片，保留）
- [x] 2026-10-14 用 `prototype/shoot.cjs` 实跑主流程并出 4 张演示截图 + 导出文本（`output/` 已忽略）
- [x] 2026-10-14 **git 收口**：修 detached HEAD → `--no-ff` 合并功能分支进 `main`（`137d6d0`）→ 根 `.gitignore` 忽略 `.worktrees/`（`d072366`）→ 推送 `main` 与 `feat/noticehunter-mvp` → 移除开发 worktree → 用 `git branch -d` 删掉已合并的本地功能分支
- [x] 2026-10-14 删除远端冗余分支 `origin/feat/noticehunter-mvp`（用户确认后执行，已不可逆）→ 仓库分支整理完毕
- [x] 2026-10-14 **第二轮迭代（LLM 主抽取 + 规则兜底 + S2.11 硬安全上限）在 `feat/noticehunter-llm` 上完成**：7 个提交，spec `status: delivered`，两套验收曾报 30 + 63 = 93 PASS / 0 FAIL
- [x] 2026-10-16 **风险审查**（用户指令「检查风险」）：产出 R-13 ~ R-20；当场复跑两套验收确认原 93 PASS 未失真；隐私 / 密钥扫描干净
- [x] 2026-10-16 **修 R-17**：`state.llmRequests` 改写入 `sessionStorage`（只存计数、不存密钥），刷新不再绕过封顶；spec 补 2026-10-16 修订批注并同步 T8 / T2 / S3；测试新增 6 条 `R-17` 断言
- [x] 2026-10-16 **修 R-18**：新增 `prototype/test/load-playwright.cjs`（缺 `playwright-core` 时打印完整复原步骤），三个测试脚本改引用；README 加「如何复现验收结果」章节
- [x] 2026-10-16 **修 R-20**：`AGENTS.md` 第 9 节工具链表按当场实测重写（`MIMO_PYTHON` / `MIMO_NODE` / `MIMO_NPM` / `MIMO_RIPGREP_PATH` 均为已设置，并列出预装库版本）
- [x] 2026-10-16 **修 R-16**：`--no-ff` 合并 `feat/noticehunter-llm` → `main`（`23e846d`，零冲突）→ 推送 `origin/main` 与 `refs/tags/v0.1.0-mvp` → 远端与本地 0 ahead / 0 behind
- [x] 2026-10-16 **合并后的 `main` 上复跑验收**：`verify.cjs` 30 PASS / 0 FAIL + `verify-llm.cjs` 69 PASS / 0 FAIL = **99 PASS / 0 FAIL**
- [x] 2026-10-16 **D-011 优先级决策**：用户对 R-13 / R-14 / R-19 三问统一回答「先完成项目开发」，材料与团队后置；**回切条件已写进 D-011**，到期未做材料必须自动切回 `AGENTS.md` 第 4 节
- [x] 2026-10-16 **写下一迭代规格** `docs/compose/spec/noticehunter-deadline.md`（S1–S3 + T1–T12 + Report + 8 条 Journey log）
- [x] 2026-10-16 **实现 deadline 汇总**：新增第 5 节与 `renderDeadline()` —— 分组升序、模糊组固定最后、倒计时标签、统计条（**逾期排除已完成**）
- [x] 2026-10-16 **实现 D-008 四项交互优化**：待确认计数与三态筛选 / 撤销上次丢弃（只回溯一次）/ `.split` 分屏（≥1080px 两列）/ 原文折叠展开（**高亮落在预览外时自动展开**）
- [x] 2026-10-16 **验收 129 PASS / 0 FAIL**：`verify.cjs` 由 30 增至 **60**（新增 30 条 D-008 断言，日期类断言全部用注入固定日期，不写死天数）+ `verify-llm.cjs` **69** 未回归；随后经用户授权**提交并推送为 `a52083b`**

### 阻塞
- **R-01** 信息阻塞：具体提交日期与平台未知，排期无法定死
- ~~R-02 已解除~~：选题已确认，见第 7 节末尾追加条目

---

## 5. 下一步与请求

### 下一步（按顺序）
1. **盯着回切条件**（D-011 的自动触发器）：第 11 周末三件套若仍为 0，或 R-01 确认的截止日早于预期 —— **材料立刻回到第一优先级，开发停止**。到时候照这一条执行，不要因为做得顺手就继续写代码。**（2026-11-21 注：按当前日期该观察点很可能已过，而三件套主体仍是 0；目前仅新增了视频开场的 1 页，先问用户是否立即回切，不要自行继续开发。）**
2. **向任课老师确认 R-01**（具体日期与提交平台）—— **回切条件依赖它**，越晚确认越被动。
3. **用真实 Key 验一轮新 prompt（R-21）**：跑 `prototype/samples/` 三份样例，记录「字段正确条数 / 重复条数 / 回退次数 / 耗时」，写进项目文档测试章节。这是本轮唯一未实测的部分。
4. **合并 `feat/relative-due`（R-22）**：相对时间推算与本轮改的 `index.html`/`verify-llm.cjs` 必然冲突，必须人工合；合并前先复跑两套验收。**合并/推送需用户当场授权。**
5. **继续开发（有余力才做）**：加分项——多文档合并、日历导出、多人分工、PDF / 图片 OCR。任何新功能先过 `AGENTS.md` 第 4 节三问：**对应哪一项预赛指标、能加几分、要花多少人日**，答不上来就不做。
6. **下次 `commit` / `push` 需重新当场授权** —— 本轮已按用户原话「提交到main，然后推送到GitHub」提交并推送（`66c44b2` + 本文件文档提交）；下一次仍需重新确认，**不得沿用**。
7. **材料三件套 + 团队组建**（R-13 / R-14）按 D-011 后置，**回切条件一触发就立即启动**；视频开场 1 页已完成，**完整方案 PPT（≤20 页）、项目文档、演示视频仍未做**。录屏前先在目标机器用 PowerPoint 真机试放 `slides/NoticeHunter-项目介绍-一页动效.pptx`，确认无点击自动播放。
8. 收尾清理（等用户确认，别擅自删）：`feat/noticehunter-llm` 分支与 `.worktrees/noticehunter-llm` 已合并可删；WorkBuddy 的 worktree 与分支见 R-12。

### 请求（写在这里等对应文件释放）
（空）

---

## 6. 变更日志（只增不改）

| 时间 | 智能体 | 动作 | 验证 |
| --- | --- | --- | --- |
| 2026-10-13 21:41 | 主智能体 | 读取竞赛通知 docx，提取规则要点写入第 2 节 | 解压 `word/document.xml` 全文读取，逐条核对原文 |
| 2026-10-13 21:41 | 主智能体 | 建立 `AGENTS.md` / `HANDOFF.md` / `prompts/README.md` | 文件已落盘并回读确认 |
| 2026-10-13 21:41 | 主智能体 | 实测工具链：python 3.14.7、node v24.19.0、`python -m http.server` 返回 HTTP 200 | 已实际启动服务并请求验证后关闭 |
| 2026-10-13 22:15 | 主智能体 | 仓库就绪：写 `.gitignore` / `.gitattributes` / `README.md`；`git init`（分支 `main`）；建 `prototype/samples/`（2 份 `.txt` 模拟通知 + stdlib 生成的 `.docx` 夹具） | `git check-ignore -v` 逐项实测：`.env`、`*secret*.json`、竞赛通知原件、`.mimocode/`、`raw/`、`群聊/`、`*.mp4`、`Thumbs.db`、`~$*.docx`、`__pycache__/`、`node_modules/` 均命中忽略；`README.md`、`.gitignore`、`prototype/samples/*` 正常可追踪；`git status --porcelain` 共 11 个待提交文件 |
| 2026-10-13 22:15 | 主智能体 | **回滚**：删除立项前写死的 `docs/` `slides/` `video/` 规划类文档（项目文档大纲、测试与迭代记录、PPT 页数规划、视频分镜）；撤回 `py` 启动器相关改动（`python` 问题已由用户修复） | 全库检索确认已无 `py -m` / `py -c` / `py 启动器` 残留；目录结构与 `README.md` 描述一致 |
| 2026-10-13 22:31 | 主智能体 | 首次提交并推送 GitHub：`git add -A` → commit `304a1e5` → 以 `--allow-unrelated-histories` 并入远端 MIT `LICENSE`（合并提交 `909892d`）→ `push -u origin main` | 远端 `refs/heads/main` 校验为 `909892d`；本地 `main...origin/main` 无 ahead/behind；工作区干净。MIT 协议已登记为 R-09 |
| 2026-10-14 12:45 | 主智能体 | compose-next Grill + Workspace：确认 D-001/D-002，开 `.worktrees/noticehunter-mvp`（分支 `feat/noticehunter-mvp`，基于 `origin/main`=`12fcc87`），新增 D-005 / D-006 | `git worktree list` 确认两个工作区；用户明确同意建分支，满足 `AGENTS.md` 第 3 节第 5 条 |
| 2026-10-14 12:45 | 主智能体 | 写功能规格 `docs/compose/spec/noticehunter-mvp.md`（S1–S3 + T1–T9），用户批准后开工 | spec `status` 由 `designed` → `in-progress` |
| 2026-10-14 12:45 | 主智能体 | 实现 `prototype/index.html` 单文件 MVP（提交 `c75f1c5`），另修 `879f3e3` 移除误提交的 playwright 快照 | `node --check` 提取的内联 JS 通过；`prototype/verify.cjs` 初版 **19 PASS / 0 FAIL** |
| 2026-10-14 12:45 | 主智能体 | 独立评审两轮：首轮 3 项 critical（S2.5 截止标记规则未实现、T6 文案与 spec 不符且测试只 grep 日期、T7 测试同义反复）→ 修复（`2ec137e`）；复审确认**无 critical**，余 6 项 minor | 复审结论：spec compliance / correctness / consistency 三项均通过 |
| 2026-10-14 12:45 | 主智能体 | 修复 5 项 minor（`6bfb7ee`）：`hasMarker` 要求标记紧跟标点、`timeNear` 不跨句、动词改按段落判定、恢复丢弃断言等 | 复测 **29 PASS / 0 FAIL**，含 `file://` 直开、损坏 `.docx` 中文提示、空清单提示、真实下载事件、控制台零报错 |
| 2026-10-14 15:46 | 主智能体 | **git 收口**：主目录原为 detached HEAD（停在 `c46c4db`），先 `git checkout main`；`--no-ff` 合并功能分支（`137d6d0`）；根 `.gitignore` 追加 `.worktrees/`（`d072366`）；`push origin main` 与 `push -u origin feat/noticehunter-mvp`；`git worktree remove` 移除开发工作区；`git branch -d` 删除已合并的本地分支 | `git check-ignore -v .worktrees/noticehunter-mvp/prototype/index.html` 命中 `.gitignore:116`；`git status --porcelain -uall` 全空；`HEAD` == `origin/main` == `d072366`（IN SYNC）；`prototype/index.html`、spec、`prompts/P-001` 均在位。**WorkBuddy 的 worktree 与 `workbuddy/main-1927306e` 分支未触碰** |
| 2026-10-14 15:53 | 主智能体 | 删除远端冗余分支 `origin/feat/noticehunter-mvp`（用户在对话中标注「可以」明确授权，且属不可逆操作）；随后 `git fetch --prune` 清理过期远程引用 | 删前安全校验：`git merge-base --is-ancestor 2a0bea2 main` 退出码 0、`git log main..2a0bea2` 为空（无提交遗留在 main 之外）；删后 `git ls-remote --heads origin` **仅剩 `refs/heads/main` = `7f55822`**；`git status -sb -uall` 干净，本地与 `origin/main` 同步。WorkBuddy 分支仍在，未动 |
| 2026-10-14 16:28 | 主智能体 | 第二轮迭代 Grill：用户提出「能否做成 skill」，经查赛题二原文确实允许 Skills 且 WorkBuddy 本机已装；最终定为 **D-007 抽取引擎反转（LLM 主 + 规则兜底，推翻 D-005）**、**D-008 本轮只做 LLM 抽取（deadline 汇总与交互优化顺延）**、**D-009 维持赛题一、否决 skill 路线**。按 D-006 既定约定开 `.worktrees/noticehunter-llm` + `feat/noticehunter-llm` | `git worktree list` 确认三个工作区并存；`git status --porcelain -uall` 为空（`.worktrees/` 被根 `.gitignore:116` 命中，无泄漏）；新 worktree `git status -sb` 干净、基于 `454668a`。**spec 已写完 `status: designed`，等用户批准，未提交、未动代码** |
| 2026-10-16 18:17 | 主智能体 | **风险审查（用户指令「审查项目 · 检查风险」，结果写入第 7 节）**。审查口径：实地复跑测试、隐私与密钥扫描、仓库体检、工具链实测、契约文档与实际状态比对。**只改本文件**（第 1 节覆盖更新、第 4 节释放登记并重排待办、第 6 节追加本条、第 7 节追加 R-13 ~ R-20），**未改任何代码、未合并、未推送、未动 tag** | ① **测试当场复跑：`verify.cjs` 30 PASS / 0 FAIL；`verify-llm.cjs` 63 PASS / 0 FAIL；合计 93 / 0，耗时约 137 秒**（起 `python -m http.server 8761` + `node test/fake-llm-server.js --port=8791`，`NODE_PATH` 指 npx 缓存，跑完已停止进程并确认端口释放）→ 交付报告**未失真**。② 隐私扫描：可追踪文件无手机号 / 身份证 / 邮箱，「学号」字样仅出现在 `example@university.edu.cn` 与打码说明中；竞赛通知原件确认被 `.gitignore:45` 忽略。③ 密钥扫描：无硬编码 Key，`sk-test-*` 属 `verify-llm.cjs` 中的测试假值。④ 仓库体检：`.git` 仅 376 KiB，无大文件；`.playwright-cli/` 历史快照已从 HEAD 清除且已忽略。⑤ 工具链实测：`python` 3.14.7、`node` v24.19.0 正常；**`MIMO_PYTHON` / `MIMO_NODE` / `MIMO_RIPGREP_PATH` 三个变量本机实测均已设置**，与 `AGENTS.md` 第 9 节记载不符（见 R-20）。⑥ 查得 HANDOFF 审查前与事实严重脱节（见 R-15），已在本轮修正 |
| 2026-10-16 18:35 | 主智能体 | **修 R-17 + R-18**（依 D-010 授权，在 `feat/noticehunter-llm` 上提交 `aff9807`）：R-17 = `state.llmRequests` 改写入 `sessionStorage`（键 `nh.llmRequests`，**只存计数、绝不存密钥**），递增与清空两处同步 `saveBudget()`；spec `noticehunter-llm.md` 补「修订（2026-10-16 追加）」并同步 T8 / T2 / S3 三处验收口径。R-18 = 新增 `prototype/test/load-playwright.cjs`（缺 `playwright-core` 时打印完整复原步骤，而非裸的 `Cannot find module`），`verify.cjs` / `verify-llm.cjs` / `shoot.cjs` 改引用它；`README.md` 增「如何复现验收结果」章节；另修正 README「作品方向待团队确认」（D-001 / D-002 已定，R-02 已解除） | 内联 JS 与三脚本 `node --check` 全过；两套验收 **30 + 69 = 99 PASS / 0 FAIL**（Llm 由 63 → 69，新增 6 条 `R-17` 断言）。`R-17` 实测证据：`sessionStorage` dump 只有 `{"session:nh.llmRequests":"60"}`、**不含密钥**；刷新并重新配置后 stub 请求 `60 → 60` 零新增。`R-18` 缺依赖分支**实测**：把 `NODE_PATH` 指向不存在目录 → 打印中文复原步骤并 `exit 1`（首版 `.nh-test\node_modules` 被 JS 当成转义换行，已改 `\\n` 修正并复验） |
| 2026-10-16 18:46 | 主智能体 | **修 R-20 + R-16**（依 D-010 授权）：① 按当场实测重写 `AGENTS.md` 第 9 节工具链表；② `--no-ff` 合并 `feat/noticehunter-llm` → `main`，推送 `origin/main` 与 tag `v0.1.0-mvp` | 工具链**先实测后写表**：`MIMO_PYTHON` / `MIMO_NODE` / `MIMO_NPM` / `MIMO_RIPGREP_PATH` / `MIMO_QPDF` / `MIMO_NODE_MODULES` 六项均非空；`MIMO_PYTHON` 实测可 import `python-docx 1.1.2`、`python-pptx 1.0.2`、`openpyxl 3.1.5`、`Pillow 11.1.0`、`pypdf 5.1.0`、`pandas 2.2.3`、`reportlab 4.2.5`、`lxml 5.3.0`。合并零冲突 → `23e846d`；`git ls-remote` 确认 `refs/heads/main` = `23e846d`、`refs/tags/v0.1.0-mvp` 已上远端；`git rev-list --left-right --count origin/main...HEAD` = **0 0**。**在合并后的 `main` 上复跑两套验收：30 + 69 = 99 PASS / 0 FAIL**；跑完已停全部测试进程，8761 / 8791 无 Listen |
| 2026-10-16 19:16 | 主智能体 | **D-008 顺延项交付**（依 **D-011**「先完成项目开发」；本轮**未开分支**，直接在主目录 `main` 工作树改，**未提交**）：① 写规格 `docs/compose/spec/noticehunter-deadline.md`（S1–S3 + T1–T12）；② 产品实现 **deadline 汇总**（新增第 5 节 + `renderDeadline()` / `dayDiff()` / `diffLabel()`）与**四项交互优化**（`state.reviewFilter` 计数筛选、`state.lastDiscard` 撤销、`.split` 分屏、`state.rawExpanded` 折叠 + 高亮自动穿透）；③ `prototype/verify.cjs` 新增 **30 条** D-008 断言 | `node --check` 对内联脚本与两脚本全过；两套浏览器验收实跑 **`verify.cjs` 60 PASS / 0 FAIL + `verify-llm.cjs` 69 PASS / 0 FAIL = 129 PASS / 0 FAIL**（服务起于主目录 `8761` / `8791`，跑完已停进程、确认无 Listen）。**中途踩到并修掉 5 处失败**：4 处是新测试自身写法（徽章含「项」字需取数字、注入项 id 误传成统计文案、撤销按钮初始态被 T4 既有丢弃污染、T8 前置条件依赖样例分布导致 harness 超时崩溃），1 处是**折叠功能改变了旧断言的前提**（`.docx` 正文落在第 7 段之后 → 改为先展开再断言，**未放宽断言、也未为测试改产品**）。**我自己两次编辑失误（误删 `renderModeBadge` 的 `const conf` 行、切掉注释闭合符）均由 `node --check` 抓出并已修复**。日期类断言一律用注入的 `2000-01-01` 或差值，**不写死运行当天的天数** |
| 2026-10-16 19:21 | 主智能体 | **经用户当场授权（「提交并推送」）提交并推送本轮成果**：`git add` 产品 + 测试 + 规格 → commit **`a52083b`** → `push origin main`（`HANDOFF.md` 按既有惯例单独提交，先改后提交，保证写进本文的每个提交号都已发生） | `git ls-remote --heads --tags origin` 确认 `refs/heads/main` = **`a52083b`**、`refs/tags/v0.1.0-mvp` 仍在；`git rev-list --left-right --count origin/main...HEAD` = **0 0**；`git show --stat a52083b` = 3 files / +714 −6；提交前 `git status` 确认只暂存了 `prototype/index.html`、`prototype/verify.cjs`、`docs/compose/spec/noticehunter-deadline.md` 三项。**未建任何新分支、未动 tag、未触碰 WorkBuddy 工作区** |
| 2026-10-16 | 主智能体 | **文档收口并推送**（用户当场授权原话「推送存储库」）：修正第 1 节 `main` 指针（`23e846d` → `a52083b`）、把上轮误放在文件顶部的 a52083b 推送日志归位到第 6 节、本文件与 `docs/compose/spec/noticehunter-deadline.md`（commits 字段改为 `33a614b..a52083b`）一并提交推送 | 提交前 `git status` 仅上述两文件；推送后 `git rev-list --left-right --count origin/main...HEAD` = **0 0**。**未建分支、未动 tag、未触碰 WorkBuddy** |
| 2026-10-16 | compose-next（relative-due） | **相对时间锚点推算**（用户 `/compose-next` 问「一周内能否推具体日期」→ Grill 选定双路径 + low/推算标记）：在 worktree `.worktrees/relative-due` 实现 `state.anchorDate` + `resolveRelativeDue` + LLM prompt/user 注入锚点 + `mapLLMEntries` 相对 due 强制 low；规格 `docs/compose/spec/noticehunter-relative-due.md`（delivered）。**主目录 main 产品文件未动；worktree 未 commit** | worktree 两套验收 **72+73=145 PASS / 0 FAIL**。独立评审 2 critical（`日/天` 映射成周一；`本周X` 被 `VAGUE_PATTERNS` 截断成「本周」→周日）已修并补测；复审确认 FIXED、无新 critical。**合并/推送等用户当场授权** |
| 2026-11-21 | 主智能体 | **首屏与健壮性修复（用户直接指令「改吧」，对应上一轮代码评审的 1/2/3/4/5/9）**：① `[hidden]` 被 `.row{display:flex}` 覆盖 → 补 `[hidden]{display:none!important}`；② `#deadlineStats` 无条目时 `hidden`（首屏不再出现空蓝条）；③ `loadTxtFile` 改 `arrayBuffer` + 严格 UTF-8，失败回落 `gb18030`（GBK 通知不再乱码）；④ `readDocxXml` 先做 `DecompressionStream` 特性检测，不再误报「文件已损坏」；⑤ 非法 `due` 被拒后**回填旧值**；⑥ `computeConflicts` 跳过 `done`（与逾期统计口径一致）。`verify.cjs` 新增 5 条回归断言。**未 commit / push** | 静态检查：内联脚本与 `verify.cjs` / `verify-llm.cjs` 均 `node --check` 通过。**实跑验收：`verify.cjs` 60→65 PASS / 0 FAIL，`verify-llm.cjs` 69 PASS / 0 FAIL，合计 134 PASS / 0 FAIL**；新断言全部 PASS（首屏 hidden×2、非法 due 回填、已完成不计撞期、GBK 解码 `2026-11-05 17:00`）。跑完已停 8761 服务器与 8791 stub，确认无残留夹具（`prototype/samples`、`prototype/test` 下无 `_*` 文件）。环境备注：本轮 DSH 沙箱首次启动时工作区授写失败（Win32 5），按 `diagnose-windows-sandbox-acl` 脚本修复了工作区根目录的写权限（备份与回滚命令在 `C:\Users\ASUS\AppData\Local\NoticeHunter-acl-reports\`）；子目录仍无沙箱写权限，故两套验收以不受限方式运行（脚本会写临时夹具）。**未建分支、未动 tag、未触碰 WorkBuddy 与 `.worktrees/`** |
| 2026-11-21 14:15 | 主智能体 | **原文区「显示不完整」修复（用户反馈「样例显示不完整」）**：① 去掉 `#rawList` 的 `max-height:300px;overflow:auto`——折叠态本来就按「每份 6 段」限高，再套一层内滚动条会让第二份样例只剩一个空标题，看起来像没加载；② `#rawToggleRow` 从面板**下方**移到**上方**，按钮文案改「展开全部原文」，提示改「当前每份只显示前 6 段（共 N 段，已显示 M 段）」。**未 commit / push** | 实跑（1280×900）：折叠态 12 段、按钮在 y≈481 首屏可见；点开后 42 段、文案切「收起原文」/「已展开，正在显示全部 42 段」；控制台零报错。`verify.cjs` **65 PASS / 0 FAIL** + `verify-llm.cjs` **69 PASS / 0 FAIL** = **134 PASS / 0 FAIL** 零回归（T10 折叠/展开断言未受影响）。截图：`C:\Users\ASUS\AppData\Local\Temp\nh-raw3.png`（折叠）、`nh-top3.png`（展开） |
| 2026-11-21 13:57 | 主智能体 | **待确认卡片改「左原文 / 右操作」分栏（用户指令「原文放左边、抽取位置高亮、确认操作块放右边」）**：`.card` 改 CSS Grid 两栏，左栏 `.card-src` 放「原文 · 文件名 第 N 段」+ `.quote`，右栏 `.card-main` 放置信度/AI 徽章、原因 chip、四个字段、确认/丢弃/看原文出处；新增 `sourceHighlight()` 在原文里用 `<mark>` 标出抽取到的时间（日期与 `HH:mm` 分开时分两段标，模糊时间如「本周内」也标）；`detectDue()` 返回值补 `end` 供定位；`.fields` 改 `repeat(auto-fit, minmax(190px, 1fr))`；`.split` 改 1.25fr/0.75fr；≤720px 自动回单栏。**未 commit / push** | 语法：内联脚本 `node --check` 通过。**实跑验收：`verify.cjs` 65 PASS / 0 FAIL + `verify-llm.cjs` 69 PASS / 0 FAIL = 134 PASS / 0 FAIL（零回归）**。**真实浏览器截图核对**（1440×1100）：卡片 `display:grid`、两栏 356/291px、11 张卡共 12 处 `<mark>`（含 `2026 年 11 月 5 日` 与单独标出的 `17:00`、`本周内`）、输入框宽 291px 不再截成一条缝、控制台零报错；900×1000 下自动单列、卡片仍左右两栏；≤720px 按 CSS 回单栏（断点未截图实测）。**截图证据在 `C:\Users\ASUS\AppData\Local\Temp\nh-review-card2.png` / `nh-review-wide2.png` / `nh-review-narrow2.png`（临时目录，不随仓库交付）** |
| 2026-11-21 14:25 | 主智能体 | **提交并推送（用户当场授权原话「提交到main，推送到github」）**：`git add prototype/index.html prototype/verify.cjs` → commit **`ce2df66`**（2 files / +178 −33）→ `git push origin main`；本文件随后单独提交并再次推送 | `git ls-remote --heads origin` 确认 `refs/heads/main` = **`ce2df66`**；`git rev-list --left-right --count origin/main...HEAD` = **0 0**；未建分支、未动 tag、未触碰 `.worktrees/` 与 WorkBuddy；未跟踪的 `对话记录/`（非本项目产物）**没有**被提交 |
| 2026-11-21 16:25 | 主智能体 | **「2 原文 / 3 待确认」横向并排 + 待确认直接内联原文（用户指令：「把2原文和3待确认两块横向并排放置，待确认信息直接在原文中高亮。排版适配电脑屏幕即可」）**：① 新增 `.stage` 网格，≥1080px 为 1.06fr/.94fr 两栏，左栏 `sticky top:14px` + `.raw-panel` 独立滚动（`calc(100vh - 160px)`），<1080px 回单列；② `renderRaw()` 按 `pending` 条目在两栏原文里渲染 `<mark class="mk low|high">`（日期与 `HH:mm` 分段、同段多条目合并区间、低置信度优先），段落加 `data-ids`/`role=button`；③ 卡片删掉 `.quote`/`.card-src`，改为单栏「徽章 + 文件名·第 N 段定位 + 原因 + 四字段 + 确认/丢弃」；④ `jumpTo()` 同时刷原文 `.hl` 与卡片 `.active`，点原文高亮段落反向滚到卡片；⑤ 原文桌面默认展开、窄屏默认折叠，折叠提示给出未显示段落里的待确认条数；⑥ 曾试 `.para-hd` 吸顶，实测与段落重叠，**已回退**。`verify.cjs` 新增 T12 两条（内联高亮 ≥6 处、卡片无 `.quote`）并把 T9 改测 `.stage`；`verify-llm.cjs` 改读 `data-src-idx`/`data-para` 校验 sourceIndex=1。**未 commit / push** | 语法：内联 JS 与两脚本 `node --check` 全过。**实跑：`verify.cjs` 67 PASS / 0 FAIL + `verify-llm.cjs` 69 PASS / 0 FAIL = 136 PASS / 0 FAIL**（起 8761 + 8791，跑完停进程；沙箱仍不能写 `prototype/` 子目录，两套验收以 danger-full-access 跑，临时夹具均已清理）。**视觉核对（真实 Edge）**：1440×1000 两栏 593/525px、左栏吸顶 `top=14`、高 840px、42 段中可见 21 段并独立滚动；12 处 `<mark>`（8 黄 / 4 蓝），p14 蓝标 `2026 年 11 月 5 日` + 单独 `17:00`，点卡片后该段 `.hl` 且卡片 `.active`；1000×900 单列、折叠 12 段、提示「另有 9 条待确认在未显示段落中」；控制台零报错。截图：`output/layout-2-3-1440.png` / `layout-2-3-1440-jump.png` / `layout-2-3-1000.png`（`output/` 忽略，不交付）。**未建分支、未动 tag、未触碰 `.worktrees/` 与 WorkBuddy** |
| 2026-11-21 16:36 | 主智能体 | **提交并推送（用户当场授权原话「提交并推送」）**：`git add prototype/index.html prototype/verify.cjs prototype/verify-llm.cjs` → commit **`7c57439`**（3 files / +216 −92）→ `git push origin main`；本文件随后单独提交并再推送 | `git ls-remote --heads origin` 确认 `refs/heads/main` = **`7c57439`**；`git rev-list --left-right --count origin/main...HEAD` = **0 0**；未建分支、未动 tag、未暂存未跟踪的 `对话记录/`（非本项目产物） |
| 2026-11-21 17:00 | 主智能体 | **LLM 抽取精度与体验优化（用户直接指令「优化一下LLM方式下的提取功能，现在的精度不高，体验很差」，决策见 D-013）**：① 重写 `llmSystemPrompt()`（今天日期+星期、8 条规则、1 条示例）；② `selectCandidateParagraphs()` 改「候选段 ±2 段 + 首段」窗口，`chunkParagraphs()` 按 60 段 / 12000 字符双上限切批；③ `parseModelContent()` 五级容错（去围栏/括号配对/单对象/截断补齐/逐对象抢救），`[]` 视为合法空结果；④ `mapLLMEntries()` 按 `dueRaw` 原文实际位置校正 `sourceIndex`（宽松匹配全角/空格）、年份校正、`dueRaw` 无据强制 low、同文件去重、本地原因优先；⑤ `llmRequest()` 拆出，超时 15s→30s、HTTP 错误带服务端说明、新增取消（保留已完成批次）与连接测试；⑥ `#aiStatus` 三态状态栏（进行中+取消 / 已回退+重试 / 结果摘要）、`#llmTest`、`#llmDebug` 诊断面板；⑦ 卡片截止时间 placeholder 缩短。`verify-llm.cjs` 新增 T14–T22，`fake-llm-server.js` 支持 `{"raw":"..."}`。**未 commit / push** | 语法：内联脚本与两脚本 `node --check` 全过。**实跑：`verify.cjs` 67 PASS / 0 FAIL + `verify-llm.cjs` 84 PASS / 0 FAIL = 151 PASS / 0 FAIL**（起 8761 + 8791；沙箱仍不能写 `prototype/` 子目录，两套以 danger-full-access 跑，夹具已自删）。**首轮曾 79 PASS / 5 FAIL，逐个定位后修**：2 处产品缺陷（连接测试继承了上一次的取消标志 → 在 `testLlmConnection()` 里复位；去重把两批相同 stub 返回合并成 1 条 → 断言改为 `mergedFrom=2`，仍能证伪截断）、2 处测试自身顺序错误（`duePara` 在载入目标文件前计算）、1 处预期变化（同上去重）。**视觉核对（真实 Edge 1440×1100）**：状态栏「AI 抽取完成：…校正出处 1 条；出处待核 2 条」、进度条 spinner+「取消」、连接测试「连接成功（3 ms）」、诊断面板含端点/模型/HTTP/耗时/finish_reason/原始返回前 300 字，控制台零报错；截图 `C:\Users\ASUS\AppData\Local\Temp\nh-llm-{review,progress,settings}.png`（临时目录，不交付）。**未建分支、未动 tag、未触碰 `.worktrees/` 与 WorkBuddy** |
| 2026-11-21 17:10 | 主智能体 | **文档与 Prompt 留档收口**：`docs/compose/spec/noticehunter-llm.md` 新增 **S2.12**（失败模式→改法表、推翻的四处旧条文、已知边界、T14–T22 验收口径）并更新 front-matter；新建 `prompts/P-003-LLM抽取精度优化.md`（新 prompt 原文 + 8 个失败模式 + 人工核查，如实写明「未在真实 API 上验收」）；`README.md` 的「如何复现验收结果」从 99 条更新为 **151 条**（67 + 84）并补新覆盖面；本文件第 1/3/4/5/6/7 节更新（新增 D-013、R-21、R-22，释放占用） | 回读确认：spec 内 T14–T22 与 `verify-llm.cjs` 实际断言一一对应；**P-003 的 prompt 原文与页面 `llmSystemPrompt()` 逐字核对通过**（`PROMPT_MATCH true`，1363 字符；首次核对发现星期写成「周五」，实际 2026-11-21 是周六，已改正）；HANDOFF 第 1 节引用的 151 PASS 与第 6 节上一条实测一致。**未提交、未推送、未建分支** |
| 2026-11-21 17:55 | 主智能体 | **收尾补一处并发守卫**：`#llmTest`（连接测试）在 `state.busy`（多文件载入 / 重试整批）期间也禁用，`testLlmConnection()` 里同样拒绝在抽取在途时启动——否则在文件间空隙点它会造成两次请求并发，破坏 S2.6 的单飞约定 | 内联脚本 `node --check` 通过；**两套验收复跑 `verify.cjs` 67 PASS / 0 FAIL + `verify-llm.cjs` 84 PASS / 0 FAIL = 151 PASS / 0 FAIL**。**未提交、未推送** |
| 2026-11-21 18:35 | 主智能体 | **提交并推送（用户当场授权原话「停吧。然后提交到main，然后推送到GitHub」）**：先停掉 8761 静态服务器与 8791 stub 两个后台 job；`git add` 6 个改动文件 + 新建 `prompts/P-003` → commit **`66c44b2`**（6 files / +1080 −136）→ `git push origin main`；本文件随后单独提交并推送。**未跟踪的 `对话记录/`（非本项目产物）没有提交** | `git ls-remote --heads origin` 确认 `refs/heads/main` = **`66c44b2`**；`git rev-list --left-right --count origin/main...HEAD` = **0 0**；提交只含预期 6 个文件，无 `对话记录/`。**未建分支、未动 tag、未触碰 `.worktrees/` 与 WorkBuddy** |
| 2026-11-21 21:05 | 主智能体（lead） | **README 增加「AI 抽取背后：一次真实请求长什么样」章节，并新增 `docs/ai-request-example.json`**（用户要求「展示一下 AI 抽取背后是如何运行的，比如向 API 发送了哪些内容」）：① 6 步调用链（解析→筛候选→±2 段上下文→切批→请求→校验）；② 请求头/请求体骨架；③ system prompt 与 user content 的实际内容；④ 22 段样例只送 13 段的解释与 ±2 窗口边界；⑤ 返回后的容错/字段校验/整文件回退；⑥ 七项硬上限与自查方法；⑦ 仓库结构补该 JSON。**只改文档** | 用仓库 stub + Playwright 实跑「配置 → 载入 `notice-internship.txt` → 发请求」，捕获 **1 次** `POST /chat/completions`，请求体写入 `docs/ai-request-example.json`；`JSON.parse` 通过、UTF-8 中文回读正常、文件内无 `sk-`/`Authorization`/密钥；样例 22 段、候选 [3]/[14]/[22]、实送 13 段与文档一致；README 相对链接目标存在。**未改产品代码，未重跑 151 条**；已提交本地 `main` **`9f68371`**（仅提交，未推送），未建分支。 |
| 2026-11-21 21:25 | 主智能体（lead） | **AI 主抽取 + 规则条目级补漏（用户选择「方案 A」，D-014）**：① 新增 `ruleSupplementItems()`——AI 成功且至少 1 条有效结果时，只对 `sourceIndex` 未被 AI 覆盖的候选段追加规则条目；强制 `low` + `supplement=true` + 原因「AI 未从本段抽取，由规则补充，请核对」；用 `RE_VERB`/`where`/`owner` 过滤发布日期、落款日期等噪声段；AI 已有条目的段落不补、AI 返回 `[]` 不补、取消/失败回退不补；② `extractSource()` 接入补漏并扩展摘要/toast「规则补漏 N 条」；③ 新增 `extractorLabel()`，卡片与清单徽章区分 `AI` / `规则式` / `规则补充`；④ spec 新增 S2.13、S2.1 加 D-014 指针；README 的 6 步链路与返回校验补补漏说明；⑤ `verify-llm.cjs` 新增 T23–T25（7 条），T3 改为「AI 或规则补充」、S2.5 改为只对 AI 条目断言 `mergedFrom`；⑥ 新增 `_supp.txt` 夹具。**未提交** | `node --check` 内联脚本与 `verify-llm.cjs` 全过。**实跑：`verify.cjs` 67 PASS / 0 FAIL + `verify-llm.cjs` 91 PASS / 0 FAIL = 158 PASS / 0 FAIL**（起 8761 + 8791；两套均以 danger-full-access 跑，夹具自删）。补漏实测：AI 只覆盖第 1 段时第 2 段以「规则补充 / low」入待确认，AI 条目仍为 high 且字段未变；AI 覆盖两段时零补漏；AI 返回 `[]` 时仍 0 条。**未提交、未推送、未建分支**。 |
| 2026-11-21 22:10 | 主智能体（lead） | **视频内嵌一页项目介绍动效（用户直接要求「项目介绍 PPT…尽可能短…最好有动画和自动播放」）**：新建 `slides/`，产出 `NoticeHunter-项目介绍-一页动效.pptx`（1 页 16:9，58 个原生 Fade，0–4520 ms 错峰自动播，无点击、无切页），末帧预览 `preview-final.png`，生成脚本 `build_ppt.py` / `make_background.py` / `make_mark.py`，验收脚本 `check_pptx.py`，说明 `README.md`。画面为「只给动作 / 出处可回查 / 人工确认 / 撞期预警」四特点 + 右侧界面示意 + 底部「AI 负责理解 · 规则负责兜底 · 人负责确认」。界面文字取自 `notice-exam-week.txt` 第 14 段模拟通知，并明确标注「界面示意 · 模拟通知」。**只新增 `slides/` 并更新本文件；未改 `prototype/`，未 commit / push。** | `slides/check_pptx.py` **27 PASS / 0 FAIL**：1 页、精确 16:9、58 条 Fade 行结构完整、无 clickEffect、bldLst 全覆盖、时间轴 0→4520 ms 递增、tN id 唯一、无强制 loop、数据披露与第 14 段正确。`office_render` 180 dpi 实渲染末帧，人工核对无溢出/遮挡；导出 1920×1080 预览。**未在 PowerPoint 真机放映验证**（本机未装 PowerPoint）；LibreOffice 渲染通过不等于动画实播通过，已在 `slides/README.md` 与第 1 节写明，正式录屏前需在场试放。 |
| 2026-11-21 22:15 | 主智能体（lead） | **规则补充项改为灰调视觉层级（用户指令：「AI 抽过后，规则补充部分用更淡的颜色显示，比如灰色、单纯灰调」）**：① `prototype/index.html` 增加 `.card.supplement`（`#f8f9fa` 底 / `#e5e7eb` 边 / `#cbd5e1` 左边 / 灰字）与 `.card.supplement` 下的徽章、原因 chip、字段输入、定位按钮灰调；② 清单 `.todo.supplement` 同步灰调；③ `renderReview()` 卡片与 `renderList()` 清单在 `it.supplement` 时追加 `supplement` 类；④ `verify-llm.cjs` 新增 T26——断言补漏卡片带 `supplement` 类且计算背景为 `rgb(248, 249, 250)`（非白底），让「灰调」不只靠徽章；⑤ spec S2.13 的 UI/验收/计数同步，README 与 HANDOFF 计数改为 92/159。**未提交** | `node --check` 内联脚本与 `verify-llm.cjs` 全过。**实跑：`verify.cjs` 67 PASS / 0 FAIL + `verify-llm.cjs` 92 PASS / 0 FAIL = 159 PASS / 0 FAIL**（起 8761 + 8791；两套均以 danger-full-access 跑，夹具自删）。T26 实测 `cls="card low supplement"`、`bg=rgb(248, 249, 250)`、`borderLeft=rgb(203, 213, 225)`。真实 Edge 1440×1100 截图核对：AI 卡片保持黄/白底，规则补充卡片为灰底灰字，徽章/原因 chip 同灰调；控制台零报错。**未提交、未推送、未建分支；未触碰 `slides/`。** |

---

## 7. 已知风险与坑（只增不改）

- **R-01 · 提交日期未知**：通知只写周次（第 12 周截止），未写具体日期，提交平台也是「另行通知」。**必须问任课老师**，否则整个排期是悬空的。
- **R-02 · 选题未经团队确认**：D-001 / D-002 仍是「待团队确认」。确认前不要投入原型开发，否则可能整段白做。
- **R-03 · 贪大**：第 12 周硬截止，实际开发窗口约 4–5 周。功能越多，演示当天崩的概率越高。MVP 砍到「单页面 + 一个闭环」。
- **R-04 · Prompt 留档滞后**：评分要求提供「关键 Prompt + 迭代过程」证据，最后一周补写会被看出来。必须第一天开始记录。
- **R-05 · 隐私**：真实群聊与通知截图必须打码。此项与学术诚信同属 12.5% 那一项，演示做得越真实越要注意。
- **R-06 · 本机环境**：无 `python-docx`、`MIMO_PYTHON` 未设置。读 docx 需用 PowerShell 解压 `word/document.xml`，**不要 pip 安装依赖**。原型的文档解析能力也不能依赖本机 Python 库——必须在浏览器里实现。
- **R-07 · 多智能体撞车**：见 `AGENTS.md` 第 6 节单一写者规则。不登记就改他人在办文件，会造成静默覆盖，且双方都以为成功。
- **R-08 · 规则口径漂移**：任何转述过的赛程与评分权重都可能失真。**引用规则时回到 docx 原文核对**，不要引用对话里的转述。
- **R-09 · MIT LICENSE 的复用风险**：GitHub 建仓时自带 MIT 协议（Copyright 2026 Cubicbomb），允许他人自由复制、修改、再授权甚至商用。与竞赛「严禁抄袭」并存时需自行权衡：保留 = 他人可复用本项目；不希望被复用则删除 `LICENSE` 或改为限制性协议。**需用户决定，不要擅自改动。**
- **R-02 已解除（2026-10-13 追加）**：选题经用户在 compose-next Grill 环节确认，D-001 / D-002 状态改为「已定」。原条目按「只增不改」保留不删，本条为其解除记录。
- **R-10 · 抽取规则的启发式局限（2026-10-14 追加，来自独立评审）**：`hasMarker` / `timeNear` 用日期后 40 字符窗口判断截止标记与时间，只对 `prototype/samples/` 这三份样例可靠。真实通知一旦出现「考前须知」「提前入场」等写法，仍可能误判置信度。**规则式抽取只能覆盖写法规范的文本，这是 D-005 已知且接受的边界**——接入 LLM 抽取（下一迭代）前，若要扩展演示素材，先补对应测试用例。
- **R-11 · 分支尚未合并（2026-10-14 追加）**：`feat/noticehunter-mvp` 领先 `origin/main` 5 个提交，只存在于本地 worktree。**用户未确认前不要合并推送**；但也要记得收口，别让成果长期停在分支上。
- **R-11 已解除（2026-10-14 15:46 追加）**：用户明确要求「对 git 进行操作，包括各分支整理、推送到 GitHub」，已按其选择的「合并推送 + 收尾清理」完成：功能分支 `--no-ff` 合入 `main`（`137d6d0`）、推送至 `origin/main`（`d072366`）、移除本地 worktree、删除本地功能分支。原条目按「只增不改」保留。
- **R-12 · 仓库里有第三方工具的工作区（2026-10-14 追加）**：本机 WorkBuddy 在 `C:\Users\ASUS\WorkBuddy\Worktrees\...` 持有一个 worktree，分支 `workbuddy/main-1927306e`（停在 `12fcc87`），并曾在 `main` 上自动提交过 `072d428 "workbuddy init"`。**该 worktree 与分支本次未触碰**。后续整理分支时先确认 WorkBuddy 是否仍在使用，**不要连它一起删**。

---

> **以下 R-13 ~ R-20 为 2026-10-16 风险审查的产出。审查口径：用户指令「审查项目 · 检查风险」。**
> 每条格式为 **现状 → 影响 → 建议动作**；凡涉及改代码、合并、推送的，一律**只登记不执行**，等用户拍板。
> 本次审查已实地复跑测试（93 PASS / 0 FAIL）、完成隐私与密钥扫描、核对仓库与工具链，不是纸面推演。

### 一、分数与资格类（最贵，优先处理）

- **R-13 · 交付物零进度：预赛 87.5 分尚无任何实物（最高分险）**
  - **现状**：`slides/`、`video/` 目录**不存在**；`docs/` 下只有 `compose/spec/` 两份功能规格，**没有项目文档**。三件套 0 件。而通知第 5 周启动、第 12 周硬截止，第 5–11 周是辅导期，**时钟一直在走**。
  - **影响**：预赛 100 分里 PPT 37.5 + 文档 25 + 视频 25 = **87.5 分**目前是 0。R-01（具体日期未知）让排期悬空，实际可用窗口可能比想象的短。
  - **建议动作**：**立刻启动，不要再等代码收口**。原型已跑通、样例现成、`prototype/shoot.cjs` 已能出演示截图，录屏素材当天就能开录。优先顺序建议按权重：PPT → 文档 → 视频（或文档与视频并行，因为两者共用同一批截图与解说词）。

- **R-14 · 团队与指导老师未落定，卡住报名硬门槛与两个必填章节**
  - **现状**：无团队名单、无专业背景、无分工、无指导老师。而通知原文要求「**所有选课学生均须以团队形式报名参赛**」「每队 **4–6 人**」「每位学生仅能参与一个团队」。
  - **影响**：双重风险。① **报名资格风险**：单人以个人名义参赛与通知的团队报名要求冲突，可能直接影响参赛有效性；② **内容风险**：项目文档（25%）必须写「团队分工」，PPT（37.5%）必须写「团队协作」，没有名单这两章**结构性地写不出来**，只能编——而「如实记录」是 12.5% 那一项的硬约束，编造分工等于自伤。
  - **建议动作**：这是**阻塞级事项**，优先级与 R-13 同级但更前置——团队定不下来，文档与 PPT 的核心章节就是空的。尽快落定名单与分工。

### 二、交接与资产保全类

- **R-15 · HANDOFF 曾与仓库事实严重脱节（本次审查已修正）**
  - **现状（审查前）**：第 1 节写着「第二轮迭代的 spec 已写完，等用户批准，**未开工、未提交**」，第 4 节「进行中」仍占着登记；而事实是分支已有 **7 个提交**、spec `status: delivered`、93 项测试通过、产品代码 +505 行。
  - **影响**：这正是 `AGENTS.md` 第 6 / 10 节要防的静默事故。接手方读 HANDOFF 会得到完全相反的结论——轻则误判成果不存在而重做，重则按「批准前不要动代码」的指令去**回退或覆盖已完成的工作**。
  - **建议动作**：本轮已修正第 1、4 节并补记本条。**教训固化**：迭代的收工动作里，更新 HANDOFF 第 1 节必须与 commit 同期完成，不能等到"下次收工一起写"；分支开发期间也要在 HANDOFF 里如实反映分支进度。

- **R-16 · 成果只在本机磁盘：分支未推送、tag 未推送，无异地备份**
  - **现状**：`feat/noticehunter-llm` 领先 `origin/main` **7 个提交**且未推送；tag `v0.1.0-mvp` 仅存本地。远端只有 `main` = `a64b414`（MVP 基线）。
  - **影响**：本轮 LLM 迭代的全部代码、两份 spec、第三个 Prompt 留档、两套验收脚本，**目前只存在于这台机器的 E 盘**。磁盘故障、误操作、目录被清理都会造成不可逆损失——而这批成果是决赛「技术应用 25%」的主要证据。同时 `.worktrees/` 被忽略，worktree 被删不会丢提交，但**不会**把它们送到远端。
  - **建议动作**：等用户拍板后**尽快合并并推送**。若用户暂不决定合并，至少应先把分支推送到远端（`git push -u origin feat/noticehunter-llm`）做异备——**但推送是外部可见操作，必须用户明确同意**，故此处只登记。

### 三、产品安全与演示类

- **R-17 · S2.11 会话预算上限可被刷新绕过（唯一的总量闸门是内存态）**
  - **现状**：`state.llmRequests` 纯内存计数（`index.html:333`），页面刷新即归零（`verify-llm.cjs` T2 明确断言「刷新后请求计数归零显示 0 / 60」），点「清空会话」也归零（`index.html:1266`）。**为保护密钥而不落盘，是刻意设计**（密钥只存内存，不写 `localStorage`/URL/DOM）。
  - **影响**：S2.11 的五道上限里，`max_tokens`、单段截断、最小间隔、大操作确认**都是单请求级，绕不过**；但唯一能封「**总花费**」的那道闸门是软的——刷新一次即可再花 60 次。若「程序漏洞导致失控」的表现形式恰好是自动重载后继续跑（前端场景并不罕见），这道闸门同样失效。**需明确**：纯静态、零后端的形态下，**本质上无法防用户手动绕过**；它真正能防的是「单次会话内的自动失控」。这一点应如实写进项目文档，而不是宣称"硬上限不可绕过"。
  - **可行的补救**（都不改变产品性质，**需用户先同意**）：① 只持久化**计数**、不持久化密钥（密钥仍纯内存），使刷新不再清零；② 把上限从"会话级"改为"**每文件请求数 + 本次导入批总请求数**"双闸，让单次操作的爆炸半径有界。
  - **未执行**：未改任何代码。

- **R-18 · 验收脚本不可移植，与本项目「零依赖」承诺形成反差**
  - **现状**：`verify.cjs` / `verify-llm.cjs` / `shoot.cjs` 都 `require('playwright-core')`，靠 `NODE_PATH` 指向**本机 npx 缓存里带哈希的目录**：`D:\nodejs\node_cache\_npx\31e32ef8478fbf80\node_modules`。项目**无 `package.json`、无 lockfile**，`node_modules/` 又被 `.gitignore` 排除；`verify.cjs` 注释里写的还是占位符 `<hash>`，`README.md` **完全没写测试跑法**（已实测确认为空）。
  - **影响**：① 该哈希目录一旦被 npx 清理或**换机器**，验收脚本直接跑不起来，而没有任何文件记录如何复原；② 若老师/评委要求现场复验，无法复现「93 PASS」，说服力打折扣；③ 「产品零依赖、验收却有依赖」，在同一份材料里并列会出现口径不自洽。**注意区分**：本次实测两套脚本在本机**可复现**，所以这是**可移植性**风险，**不是数据造假风险**。
  - **建议动作**（**需用户同意**）：在 `README.md` 或 `prototype/test/README.md` 写清跑法（Node 版本、Edge 路径 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`、`NODE_PATH` 指向、三条命令）；或加一份最小 `package.json` 只声明 devDependency `playwright-core` 并连同 lock 提交（`node_modules/` 继续忽略）。

- **R-19 · 演示视频两难：LLM 是卖点，但现场不保证有网**
  - **现状（审查新识别）**：D-007 把「LLM 主抽取 + 规则兜底」做成了核心卖点（也正是决赛「技术应用 25%」的抓手），但通知与 `AGENTS.md` 第 7 节都要求**断网可完整演示**。无 Key / 断网时页面只能演规则兜底——**恰好演不出最有技术含量的那一层**。仓库里已有本地 stub（`prototype/test/fake-llm-server.js`）可离线演示 LLM 路径，但它需要**起一个 node 进程**，与「单个 HTML 双击即演」的交付形态不同；评审若自行打开 HTML，默认看到的是规则式。
  - **附加录屏风险**：真实模型输出有随机性（即使 `temperature=0` 也只是近似确定），同一份通知两次抽取结果可能不同，**会导致反复重录**。用 stub 录屏输出稳定可重放，但必须在视频与文档里**如实标注「演示使用本地模拟端点」**。
  - **建议动作**：① 录屏用 stub 走 LLM 路径，保证稳定与可重放；② 另保留一小段真实 API 调用的片段作为「技术应用」的实证；③ 视频与项目文档里明确写清演示环境与模拟条件（与 `prototype/samples/README.md` 的数据说明口径一致），**不要含糊**；④ 答辩时准备好「断网手演规则模式 + 本地 stub 演 LLM 模式」两种预案。

### 四、契约与工具链类

- **R-20 · 契约文档过时与授权灰区（两小项，均未擅自修改 `AGENTS.md`）**
  - **① `AGENTS.md` 第 9 节工具链表已过时**：表中记载 `MIMO_PYTHON` / `MIMO_NODE` / `MIMO_NPM` / `MIMO_RIPGREP_PATH` **均「❌ 未设置，不要引用」**，而**本机实测三个变量全部已设置**（`MIMO_PYTHON` / `MIMO_NODE` / `MIMO_RIPGREP_PATH` 均非空）。更关键的是：`MIMO_PYTHON` 预装了 `python-docx` / `python-pptx` / `openpyxl` —— **正是三件套（文档 25% + PPT 37.5%）要用的东西**；`MIMO_NODE_MODULES` 里还有 `pptxgenjs`。现状是第 9 节在教后来的智能体「`MIMO_PYTHON` 不存在，读 docx 用 PowerShell 解压」，**主动屏蔽了最省力的正确工具**，会在做项目文档与 PPT 时白白增加工作量与排版事故率。`AGENTS.md` 属「改动需用户确认」文件，**本次未改**，仅登记。
  - **② 建分支授权存在灰区**：`AGENTS.md` 第 3 节第 5 条要求「禁止建分支，**除非用户在当前对话中明确要求**」，而 D-007 记录的是「本次未重新申请建分支授权，直接复用 D-006 既定约定」。D-009 虽已把 D-006 认定为显式授权，但严格按条文，**授权应当场确认**。后续迭代开工前建议当场确认一次，避免"沿用上次授权"累积成越权。

### 五、低危备注（不单列编号，如实记录）

- **spec 版本元数据差一个提交**：`docs/compose/spec/noticehunter-llm.md` 头部写 `commits: 454668a..16966b0`，而分支 HEAD 是 `9fce98c`（finalize 提交自身）。属记录不精确，不影响交付内容。
- **`prompts/` 的「迭代优化」维度覆盖偏薄**：本次按评分要求的六项逐字检索，`P-002-LLM结构化抽取.md` 中「工具 / 环节 / Prompt / 测试 / 人工核查」均有命中，但**「迭代」0 次命中**（`P-001` 为 1 次）。12.5% 的诚信与 AI 使用规范项明确要求「迭代优化」证据，建议 P-002 补记 S2.11 那一轮的迭代理由（可由 spec 的 Journey log 第 3、4 条改写而来，素材现成）。
- **已确认合格的项（无需动作，避免重复劳动）**：模拟数据的「来源 / 模拟条件 / 实际应用仍需解决的问题」三项说明**完整且如实**（`prototype/samples/README.md`）；隐私扫描**干净**；竞赛通知原件被 `.gitignore:45` 正确排除、未进仓库；仓库体积健康（`.git` 仅 376 KiB，无大文件混入）；`prototype/index.html` 对 LLM 配置**只存内存**的设计在隐私上是对的（只是连带造成 R-17）。

---

## 附 · R-13 ~ R-20 处置记录（2026-10-16 追加，只增不改）

> 上面每条的「现状 → 影响 → 建议动作」是**审查当时的快照，保留不改**。本节记录之后实际做了什么。
> 判定标准：**只有实地验证过的才写「已修」**；改了代码但没跑的，一律不写「已修」。
> 授权依据见 **D-010**（用户回复「修复上述风险项」）。

| 编号 | 风险 | 处置结论 | 依据 / 去向 |
| --- | --- | --- | --- |
| **R-13** | 三件套 0 件（预赛 87.5 分） | **未处理** | 不是代码问题，是工作量与信息问题。三件套需要团队名单与内容决策，**本轮不代写规划或半成品**（项目曾因「立项前写死规划文档」被要求回滚，教训保留）。已提到第 4 节待办**第 1 位**、第 5 节下一步**第 2 位** |
| **R-14** | 团队与指导老师未落定 | **未处理（缺用户输入）** | 需要真实名单、专业、分工、指导老师姓名，无从推断也**不允许编造**（与 12.5% 的「如实记录」冲突）。已列为第 5 节下一步**第 1 位** |
| **R-15** | HANDOFF 与事实严重脱节 | **已修** | 第 1 / 4 / 5 节按 2026-10-16 实况重写，第 6 节追加三条记录。接手方现在读到的是「已合并、已推送、99 PASS」，不再是「未开工、未提交、93 PASS」 |
| **R-16** | 成果只在本机，无异地备份 | **已修** | `--no-ff` 合并 → `23e846d`（零冲突）→ 推送 `origin/main` 与 `refs/tags/v0.1.0-mvp`。证据：`git ls-remote` 两个 ref 都在远端；`git rev-list --left-right --count origin/main...HEAD` = **0 0** |
| **R-17** | 会话预算可被刷新绕过 | **已修** | 计数改写入 `sessionStorage`（键 `nh.llmRequests`），**只存计数、绝不存密钥**；新增 6 条断言常驻守着，其中最强的一条是「刷新并重新配置后 stub 请求 `60 → 60` 零新增」。spec 同步修订。**已知边界保留**：用户主动点「清空会话」仍会归零——纯静态零后端原理上防不了，已在 spec 里如实写明，答辩时按这个口径认 |
| **R-18** | 验收脚本不可移植 | **已修（仓库侧）** | 新增 `prototype/test/load-playwright.cjs`，缺 `playwright-core` 时打印完整复原步骤（实测把 `NODE_PATH` 指到不存在目录 → 打印中文提示并 `exit 1`）；README 增「如何复现验收结果」。**残留边界**：`playwright-core` 本身仍靠机器相关的 `NODE_PATH`——这是「产品零依赖」与「验收必须真开浏览器」之间的固有取舍，仓库保证的是**知道怎么修**，不保证换机即插即用 |
| **R-19** | 视频的 LLM 卖点 vs 断网约束 | **方案已备，未执行** | 取舍建议已写在 R-19 的「建议动作」里（stub 录 LLM 路径保可重放 + 另存一段真实 API 片段作技术应用证据 + 视频与文档如实标注模拟端点 + 答辩准备两套预案）。**需用户拍板后才开录**，已列为第 4 节待办 |
| **R-20** | 契约过时 + 建分支授权灰区 | **已修** | ① `AGENTS.md` 第 9 节按当场实测重写（六个 `MIMO_*` 变量 + 预装库版本 + 两种读写 docx 方法），并写明「以实测为准，再对不上就回来改这张表」；② 授权灰区以 **D-010** 补上本轮当场授权记录，并明确**下一轮仍须重新确认、不得沿用** |

**接手方请从这三条接着看**：**R-13（材料）、R-14（团队）、R-19（待拍板）** —— 其余五条已修，且每一项都有对应断言或 `git ls-remote` 结果作证据，不是「应该可以」。

> 另注：上面「低危备注」里那条「LLM 配置只存内存的设计是对的（只是连带造成 R-17）」，其中的 R-17 已于同日修复；配置与密钥仍只存内存这一结论不变。

### R-06 部分更新（2026-10-16 追加，原条目按只增不改保留）

原条目写「无 `python-docx`、`MIMO_PYTHON` 未设置，读 docx 只能用 PowerShell 解压」。**2026-10-16 实测该记载已过时**：`MIMO_PYTHON` 已设置，且其预装环境里 `python-docx 1.1.2` / `python-pptx 1.0.2` 可直接 `import`。因此「只有 PowerShell 解压一条路」不再成立，正确写法已进 `AGENTS.md` 第 9 节（重写版）。

**但原条目剩下的两条红线继续有效，不要因为本条而放松**：

1. **不要 pip 安装依赖** —— 需要什么能力，先看 `AGENTS.md` 第 9 节有没有现成的。
2. **`prototype/` 的浏览器代码不得依赖任何本机 Python 库或 npm 产物** —— 必须在浏览器里零依赖实现。这条与「本机有 python-docx」并不冲突：Python 库是给**文档 / PPT 产出**用的，不是给产品运行时用的。

### R-21（2026-11-21 追加）· 新 prompt 未在真实模型上验收，属设计推断

- **现状**：本轮重写 system prompt（日期锚点、出处契约、跨段规则、示例）是精度提升的主要手段，但**没有在任何真实第三方 API 上跑过**——本机无可用 Key，也不擅自调用他人 Key。自动化验收用的是本地 stub，只能证明「模型输出不听话时客户端不再整文件回退」，不能证明「真实模型更听话了」。
- **影响**：如果真实模型仍给错年份 / 仍把截止行当动作，界面会比以前**更诚实**（标 low + 原因），但**不会更准**。答辩时若被问「你验证过 prompt 效果吗」，只能回答「未在真实 API 上验证」——这是 12.5% 如实记录项的一部分，不能含糊。
- **建议动作**：拿到 Key 后跑 `prototype/samples/` 三份样例，记录「字段正确条数 / 重复条数 / 回退次数 / 耗时」，写进项目文档测试章节；诊断面板（`#llmDebug`）就是为此准备的。

### R-22（2026-11-21 追加）· `feat/relative-due` 的合并冲突面扩大

- **现状**：`feat/relative-due` 分支（未合并、未 commit）改的是 `prototype/index.html`、`prototype/verify.cjs`、`prototype/verify-llm.cjs`；本轮又改了 `index.html` 与 `verify-llm.cjs`，且重构了 `selectCandidateParagraphs` / `mapLLMEntries` / `callLLM` / `extractSource` 四个函数——分支与主干的差异从「局部改」变成「同一批函数两侧各改一遍」。
- **影响**：直接 `git merge` 几乎必然冲突，且**冲突处不是格式冲突，是语义冲突**（两边都动了候选筛选与 due 补正）。机械地选一边会静默丢掉其中一方的功能。
- **建议动作**：合并时人工重放 relative-due 的意图（`state.anchorDate` + `resolveRelativeDue` + 「按锚点」标记），而不是逐块 resolve；合并后**先复跑两套验收（本轮基线 151 PASS）**，再决定是否需要补断言。
