---
name: Campthink
description: Campthink 既有品牌规则、Apple 聊天及登录后共享外壳、获准公开首页与全屏认证扩展，依据源码分域提取。
colors:
  ct-paper: "#f7f6f2"
  ct-white: "#fffefa"
  ct-ink: "#252e42"
  ct-muted: "#72766e"
  ct-line: "#dedfd7"
  ct-blue: "#334bdb"
  ct-blue-soft: "#e9edfc"
  ct-apricot: "#edb98e"
  work-blue: "#3544dc"
  assistant-bg: "#eef2f8"
  assistant-panel: "#f2f5fa"
  assistant-surface: "#ffffff"
  assistant-ink: "#29323c"
  assistant-muted: "#5d6876"
  assistant-accent: "#0b62db"
  assistant-accent-hover: "#084db0"
  assistant-soft: "#eaf2ff"
  assistant-success: "#187248"
  assistant-success-soft: "#e8f7ef"
  assistant-warning: "#9a5400"
  assistant-warning-soft: "#fff3d9"
  assistant-danger: "#bf303d"
  assistant-danger-soft: "#fff0f1"
  assistant-line: "#e2e7ec"
  assistant-hover: "#e8edf2"
  home-paper: "#f5f6fa"
  home-surface: "#ffffff"
  home-ink: "#151925"
  home-muted: "#606775"
  home-accent: "#0066cc"
  home-accent-hover: "#004f9e"
  home-soft: "#e9f0fb"
  home-line: "#dce1eb"
  home-night: "#11141e"
  home-night-muted: "#b7bed0"
  home-night-ink: "#f5f7ff"
  home-life-paper: "#f3e4d8"
  home-life-stage: "#f3dfc4"
  home-life-action: "#754124"
  home-life-action-hover: "#54301c"
  auth-surface: "#fbfcff"
  auth-field: "#f3f5f9"
  auth-ink: "#151925"
  auth-muted: "#606775"
  auth-accent: "#0066cc"
  auth-accent-hover: "#004f9e"
  auth-brand: "#edf2fc"
typography:
  title:
    fontSize: "30px"
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'PingFang SC', sans-serif"
    fontSize: "16px"
    lineHeight: 1.7
  label:
    fontSize: "14px"
  answer:
    fontSize: "16px"
    lineHeight: 1.85
  assistant-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "16px"
    lineHeight: 1.85
  assistant-compose:
    fontSize: "16px"
    lineHeight: 1.7
  assistant-heading:
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.6
  home-display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'PingFang SC', sans-serif"
    fontSize: "clamp(44px, 5.3vw, 84px)"
    fontWeight: 650
    lineHeight: 1.17
    letterSpacing: "-0.035em"
  home-action:
    fontSize: "16px"
    fontWeight: 500
  auth-input:
    fontSize: "16px"
  auth-heading:
    fontSize: "34px"
    lineHeight: 1.25
    letterSpacing: "-0.025em"
rounded:
  ct-radius-control: "16px"
  ct-radius-panel: "24px"
  pill: "999px"
  work-field: "14px"
  workspace-frame: "22px"
  assistant-radius-md: "16px"
  assistant-radius-lg: "32px"
  assistant-radius-lg-mobile: "30px"
  assistant-frame-radius: "24px"
  assistant-control-radius: "14px"
  home-cta: "999px"
  home-example: "16px"
  home-example-mode: "10px"
  auth-control: "12px"
spacing:
  inline-gap: "8px"
  action-gap: "10px"
  field-gap: "18px"
  panel-inset: "24px"
  assistant-desktop-inset: "14px"
  assistant-composer-inset: "10px"
  assistant-composer-inset-mobile: "8px"
  home-gutter: "clamp(24px, 5vw, 88px)"
components:
  work-button-primary:
    backgroundColor: "{colors.work-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  work-button-secondary:
    backgroundColor: "{colors.ct-white}"
    textColor: "#354333"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  work-field:
    backgroundColor: "#f8f9f5"
    textColor: "#283344"
    rounded: "{rounded.work-field}"
    padding: "12px 14px"
    width: "100%"
  work-panel:
    backgroundColor: "{colors.ct-white}"
    rounded: "{rounded.ct-radius-panel}"
    padding: "{spacing.panel-inset}"
  workspace-nav:
    backgroundColor: "transparent"
    textColor: "#5f6a60"
    rounded: "{rounded.ct-radius-control}"
    padding: "0 12px"
    height: "42px"
  workspace-nav-active:
    backgroundColor: "#dce2f1"
    textColor: "#334bcb"
    rounded: "{rounded.ct-radius-control}"
  work-filter:
    backgroundColor: "transparent"
    textColor: "#55604d"
    rounded: "{rounded.pill}"
    padding: "10px 17px"
  work-filter-active:
    backgroundColor: "{colors.ct-white}"
    textColor: "#303fd0"
    rounded: "{rounded.pill}"
  assistant-composer:
    backgroundColor: "{colors.assistant-surface}"
    textColor: "{colors.assistant-ink}"
    typography: "{typography.assistant-compose}"
    rounded: "{rounded.assistant-radius-lg}"
    padding: "{spacing.assistant-composer-inset}"
    width: "min(760px, 100%)"
  assistant-composer-mobile:
    rounded: "{rounded.assistant-radius-lg-mobile}"
    padding: "{spacing.assistant-composer-inset-mobile}"
  assistant-tools-disclosure:
    backgroundColor: "{colors.assistant-panel}"
    textColor: "{colors.assistant-muted}"
    rounded: "50%"
    padding: "0"
    width: "44px"
    height: "44px"
  assistant-send:
    backgroundColor: "{colors.assistant-accent}"
    textColor: "#fff"
    rounded: "50%"
    width: "44px"
    height: "44px"
  assistant-send-hover:
    backgroundColor: "{colors.assistant-accent-hover}"
  assistant-send-disabled:
    backgroundColor: "{colors.assistant-panel}"
    textColor: "{colors.assistant-muted}"
  assistant-nav:
    backgroundColor: "transparent"
    textColor: "{colors.assistant-muted}"
    rounded: "{rounded.assistant-radius-md}"
    padding: "10px 14px"
    height: "48px"
  assistant-nav-active:
    backgroundColor: "{colors.assistant-soft}"
    textColor: "{colors.assistant-accent-hover}"
    rounded: "{rounded.assistant-radius-md}"
  assistant-shell-pane:
    backgroundColor: "{colors.assistant-surface}"
    rounded: "{rounded.assistant-frame-radius}"
    height: "100%"
  assistant-new-chat:
    backgroundColor: "{colors.assistant-surface}"
    textColor: "{colors.assistant-ink}"
    rounded: "{rounded.assistant-control-radius}"
    padding: "0 14px"
    height: "44px"
  assistant-answer:
    backgroundColor: "transparent"
    textColor: "{colors.assistant-ink}"
    typography: "{typography.assistant-body}"
    rounded: "0"
    padding: "0"
  assistant-user-message:
    backgroundColor: "{colors.assistant-soft}"
    textColor: "{colors.assistant-ink}"
    rounded: "20px 20px 8px 20px"
    padding: "14px 18px"
  assistant-avatar-header:
    backgroundColor: "{colors.assistant-soft}"
    textColor: "{colors.assistant-accent}"
    rounded: "14px"
    width: "40px"
    height: "40px"
  assistant-avatar-answer:
    backgroundColor: "{colors.assistant-soft}"
    textColor: "{colors.assistant-accent}"
    rounded: "13px"
    width: "36px"
    height: "36px"
  assistant-sources:
    backgroundColor: "{colors.assistant-panel}"
    textColor: "{colors.assistant-muted}"
    rounded: "{rounded.assistant-radius-md}"
    padding: "12px 14px"
  assistant-compound-search:
    backgroundColor: "{colors.assistant-surface}"
    rounded: "12px"
    width: "100%"
  assistant-rating-search-input:
    backgroundColor: "transparent"
    width: "100%"
    height: "44px"
  assistant-segment:
    backgroundColor: "{colors.assistant-panel}"
    rounded: "{rounded.assistant-control-radius}"
    padding: "4px"
  assistant-segment-item:
    backgroundColor: "transparent"
    textColor: "{colors.assistant-muted}"
    rounded: "10px"
  assistant-history-selected-mobile:
    backgroundColor: "{colors.assistant-soft}"
    textColor: "{colors.assistant-accent-hover}"
    rounded: "12px"
    padding: "8px 12px"
    height: "44px"
  assistant-history-delete-mobile:
    backgroundColor: "transparent"
    rounded: "8px"
    width: "44px"
    height: "44px"
  home-cta:
    backgroundColor: "{colors.home-accent}"
    textColor: "{colors.home-surface}"
    typography: "{typography.home-action}"
    rounded: "{rounded.home-cta}"
    padding: "14px 24px"
  home-example-dock:
    backgroundColor: "{colors.home-surface}"
    textColor: "{colors.home-ink}"
    rounded: "{rounded.home-example}"
    padding: "22px"
    width: "min(440px, 94%)"
  home-example-mode:
    backgroundColor: "transparent"
    textColor: "{colors.home-muted}"
    rounded: "{rounded.home-example-mode}"
    padding: "8px 12px"
  home-example-mode-active:
    backgroundColor: "{colors.home-soft}"
    textColor: "{colors.home-accent-hover}"
    rounded: "{rounded.home-example-mode}"
  home-life-cta:
    backgroundColor: "{colors.home-life-action}"
    textColor: "{colors.home-surface}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  auth-field:
    backgroundColor: "{colors.auth-field}"
    typography: "{typography.auth-input}"
    rounded: "{rounded.auth-control}"
  auth-submit:
    backgroundColor: "{colors.auth-accent}"
    textColor: "#fff"
    typography: "{typography.auth-input}"
    rounded: "{rounded.auth-control}"
  auth-submit-hover:
    backgroundColor: "{colors.auth-accent-hover}"
---

# Design System: Campthink

<!-- Source scan: 2026-10-11. Evidence: PRODUCT.md; campus-ai-web/src/App.vue; campus-ai-web/src/main.js; campus-ai-web/src/styles/campthink.css (shared colors 1–11, workspace 133–191, soft surfaces 491–518); workspace-shell.css; readability.css; views/ChatView.vue; views/TimetableView.vue; components/TimetableTeaser.vue; docs/design/timetable-surface.md. This is a source-backed system record, not a browser visual acceptance or shipping verdict. -->
<!-- Chat-only additive scan: 2026-10-12. Evidence: .impeccable/surfaces/chat-assistant.md; campus-ai-web/src/styles/chat-assistant.css; views/ChatView.vue; components/AssistantAvatar.vue; components/CampMark.vue; components/ChatAttachmentPreview.vue. .impeccable/review/chat-assistant/{desktop.jpg,mobile.jpg,user-1280.jpg,mobile-tools.jpg,desktop-empty.jpg} are synthetic development fixtures for review, not shipping raster assets or real user content. This pass inspects source and does not assert browser acceptance. No new shipping raster assets. -->
<!-- Approved scoped merge: 2026-10-13. User selected C / Apple; source authority is the last imported apple-workspace.css over chat-assistant.css and workspace-calm.css in views/ChatView.vue. Current scope is .workspace:is(.chat-focused,.calm-workspace): chat presentation and shared authenticated shell, not every feature layout. Fresh finish disposition ship and supplied acceptance evidence are in .impeccable/review/apple-2026-10-13/finish-review.md and .impeccable/surfaces/chat-assistant.md. Historic acceptance above and below remains dated evidence, not a current whole-product verdict. -->
<!-- Scoped functional-source merge: 2026-10-14, for the Apple pages batch dated 2026-10-13. Final sources: workspace-calm.css and apple-workspace.css; finish/verdict/verification evidence: .impeccable/review/apple-pages-2026-10-13/. Palette and primitive scales unchanged. Existing dated acceptance counts remain history; this merge records current canvas, focus, segmented-control and bounded responsive rules, not a new whole-product acceptance. -->

<!-- Approved public-home merge: 2026-10-14. Final source: campus-ai-web/src/styles/landing-apple.css, imported after landing-polish.css in views/LoginView.vue; scope .landing.apple-home only. Fresh FULL centered finish review: .impeccable/review/apple-home-centered-2026-10-14/finish-review.md (ship). User-reference.png overrides asynchronous option-letter mapping; generated compositions are critique references, not shipping raster. No comp, plate or pixel pass. -->

<!-- Approved public-home scoped refresh: 2026-10-28, documenting the user's 2026-10-27 authorization. Current sources: LoginView.vue landing before Teleport, landing-apple.css, HomeLifeScene.vue. Surface authority: .impeccable/surfaces/homepage-renewal-20261027.md. Supersedes October14 centered/88px-orb composition and its home controls only; app/auth domains remain separate. Source documentation only; current finish disposition is owned by .impeccable/review/homepage-renewal-20261027/finish-review.md. -->

<!-- Approved auth/viewport scoped merge: 2026-10-30, for the user's fullscreen-auth-keyboard-20261028 batch. Sources: LoginView.vue authentication helpers and Teleport only; ChatView.vue visible-viewport hookup; utils/visualViewport.js; styles/auth-fullscreen.css and chat-viewport.css. Earlier dated statements that auth remained unchanged are historical scope boundaries, superseded only by this separately authorized auth/viewport exception. This source documentation is not a fresh finish verdict, physical iOS/WeChat keyboard certification or deployment claim. -->

<!-- Approved voice/admin scoped merge: 2026-10-30. Sources: HoldToTalk.vue and holdToTalk/voiceConsent; AdminView.vue and TeachingIdentityPanel; admin-workbench.css, admin API/workbench helper and AdminBackgroundJobController. Local gesture/preview/consent, identity-module discovery and runtime-state expression only. Finish ship is file-based synthetic evidence, not physical ASR, reminder, production-release or identity-approval certification. -->

<!-- Approved canteen/community scoped merge: 2026-10-31. Sources: CanteenView, AdminCanteenPanel, MerchantPublisher and merchantPublishing; WallView/AdminWallPanel; canteen/wall services and CommunityTextPolicy. Preserve the incumbent Apple work area. Immediate locally checked social publication supersedes prior pre-moderation only for new reviews, wall posts and replies; it does not change identity or knowledge approval. Source documentation and synthetic finish evidence are not a public-release, physical-device or comprehensive-compliance verdict. -->

## Overview

**Creative North Star: "Campthink"**

沿用用户确认的 Campthink 品牌：明亮的阅读面、深色正文、明确动作、柔和圆角和既有彩球。2026-10-27 获准更新的公开首页沿用独立 Apple 覆盖，以珍珠白、深墨色正文、明确蓝色动作、实体彩球、墨黑能力画廊与暖色校园生活形成节奏；这是用户确认的首页品牌扩展。登录弹窗、注册与 Pro 保留各自既有设计边界。登录后的聊天和共享外壳采用用户于 2026-10-13 选定的 C / Apple 方向，以珍珠白、深灰和低饱和灰蓝形成层次。色彩与形状来自当前实现，不另起视觉命名。

桌面工作区保持同一个左侧导航，在右侧内容容器切换页面；手机将内容变为单列并使用抽屉导航。本文件只提取可重复使用的规则；课表的首次导入构图、私有图片、独有配色与尺寸仍归其页面说明。2026-10-11 课表记录取得空态和合成已保存态的桌面/手机两轮截图，审阅结论为fix。首次表单和手机信息区已按结论修改，首次表单通过真实应用DOM复核；该记录的最新手机修改未重复截图，因此不声明课表最终视觉验收通过。

聊天页先作为用户确认的局部试点，2026-10-12 获准扩展到功能工作区。当前 Apple 覆盖以 `apple-workspace.css` 为最终来源，作用域仅为 `.workspace:is(.chat-focused,.calm-workspace)`：聊天采用开放回答、统一几何头像和单行浮动输入框，共享外壳采用同一配色与柔和桌面内框。其他模块的数据、内容语义、布局和交互沿用现有实现；首页不受工作区覆盖，而由下述独立批准范围约束，登录弹窗、注册和 Pro 继续受保护。

后续独立获准的全屏认证以完整窗口呈现品牌和表单，手机将品牌压缩为一行；手机聊天由当前可见视口约束输入区域。以下较早记录中的“登录／注册视觉不变”保留为当时的历史边界，由 2026-10-28 全屏认证／键盘批次的局部授权取代。它不扩展到首页、联系、Pro、角色、法律或产品能力定义。

2026-10-30 的语音与管理操作增量沿用上述工作区视觉，只修正持按目标、转写预览、首次同意记忆、身份审核入口和任务状态表达。录音中不使用会移动持按目标的缩放或内容折叠；暂停、未知、已排队和成功分别表达。它不更新首页、认证面或 Pro，也不把界面复审当成生产启用或真机语音证明。

2026-10-31 的商家与社区增量继续沿用当前工作区：商家图片和文字分区，横图／竖图完整显示；直接录入与批量发布替代主路径的OCR／草稿链，已有高级编辑保留。评价以明确按钮、时间和即时公开状态表达，规则拦截与举报后处理分开。旧的社区先人工审核文案保留为历史边界，仅被本次明确授权的评价／校园墙发布规则取代；身份审核、知识发布、首页和认证面不在此变更中。

### Approved Apple chat and shared shell — 2026-10-13

- 最终优先级：Apple 覆盖高于下列历史试点与功能扩展记录；frontmatter 的 `assistant-*` 是此作用域当前消费的值，保留的 `ct-*`、`work-*` 是作用域外的既有默认值。
- 桌面外壳：保留 244px 可收起侧栏，外侧留 14px，右侧白色阅读／工作容器使用 24px 曲线；手机取消外留白、内框曲线与内框阴影，继续使用覆盖抽屉。
- 聊天：760px 阅读上限，开放回答，圆形 44px 附件和发送／停止控件，紧凑三列输入器。按钮按下以 140ms 响应缩至 0.96；减少动态效果时取消动画、过渡与缩放。
- 证据：独立 finish review disposition 为 `ship`，覆盖当前聊天及共享外壳；1440、870、390px 开发截图用于审阅。540/540 前端测试、定向 ESLint/Oxlint 与构建通过属于本轮提供的验证记录，文档合并不重复执行。后端、真实认证、模型计费、物理键盘和屏幕阅读器未在本轮重新验收。

### Historical Apple public-home scope exception — 2026-10-14

- 用户明确授权公开首页扩展，取代早先“首页排除”规则的这一局部范围；最终选择以用户附图为准，不以异步生成文件的 A/B 名称为准。
- 当时来源为最后导入的 `landing-apple.css`，只约束 `.landing.apple-home`。登录弹窗、注册、Pro、角色／管理员发现、路由与后端契约保持原有边界。
- 当时的构图、阅读顺序与 Persuade 模式归 `.impeccable/surfaces/apple-home.md`。居中、小彩球及原生选择器构图已被下述 2026-10-27 首页更新取代；此处验收仅是历史记录。
- 新的 FULL finish review 为 `ship`。本轮提供的 26 项定向／565 项完整前端测试、严格局部 lint 和构建均通过；本次文档合并仅核对既有证据与源码，不重跑应用验证。两轮居中核验与原生图像尺寸差异已披露，真机、物理键盘、屏幕阅读器、FPS 和 10% 动画回放未验。
- 使用示例明确标注非实时；没有新增能力、机构、指标或上线事实。生成图仅作审阅参考，没有新增上线位图。旧 comp gate 失败仍为失败，已披露为被本次代码实现取代。

### Approved public-home renewal — 2026-10-27; documented 2026-10-28

- 用户授权参考 Nanfu.global、Apple 和九月版本，恢复有视觉主体、功能实物与明暗节奏的公开介绍。它取代 2026-10-14 的居中／88px 彩球规则；不改变登录后应用系统。
- 当前权威为 `.impeccable/surfaces/homepage-renewal-20261027.md`。源码为 `LoginView.vue` 中 Teleport 之前的 landing、最后导入的 `landing-apple.css` 和 `HomeLifeScene.vue`；`home-*` 仅约束 `.landing.apple-home`。
- 实现材料为原有 CSS 动态彩球、原生问答／提纲／代码视觉示意与 SVG 校园工具；保持非实时示例声明，没有新增上线位图或第三方品牌资产。
- 本次仅合并源码设计记录。当前 finish 结论归 `.impeccable/review/homepage-renewal-20261027/finish-review.md`，不把旧 `ship` 或源码提取当作本轮验收。全屏认证、真实键盘与新批次认证改造未记录为已交付。

### Approved fullscreen authentication and mobile visible viewport — 2026-10-28; documented 2026-10-30

- 用户在首页批次之后独立要求全屏登录、平滑进入退出，并修正所给 iPhone／微信截图中的聊天输入位置。范围仅为认证 Teleport、共享视口几何及手机聊天输入容器；首页批次当时未交付认证的记录继续保留为历史证据。
- `auth-fullscreen.css` 在认证域覆盖旧弹窗几何，保留原品牌／彩球；`chat-viewport.css` 仅为聊天补充输入高度和手机视口所有权。它们不改变联系窗口、Pro、认证载荷、同意／重试／关闭锁、账户角色与审核、管理员发现、私有草稿、路由／API／后端及法律定义。
- 桌面认证保留品牌与表单两栏，手机改为紧凑品牌行与内部滚动表单；手机打开认证后将焦点放在关闭控件，不自动唤起输入键盘。当前键盘几何按可见高度和相对布局的顶部偏移共同更新，原生捏合缩放继续由浏览器处理。
- 本次只合并源码文档。父任务提供的当前验证为 1229 项前端 JS 测试、严格检查与构建通过，文档代理未重跑。首次 finish 的 `fix` 保留为历史记录；两项修复后的独立续审为 `ship`，依据为 `.impeccable/review/fullscreen-auth-keyboard-20261028/finish-review-resumed-20261030.md`，只覆盖该认证与手机输入批次。
- 桌面 1440×900／1280×800、手机 390×844／393×852、短视口、顶部偏移、布局缩短及输入高度证据为开发几何夹具。它们不能证明物理 iOS／微信键盘、真实账户提交、动画帧率、屏幕阅读器或部署验收。

### Historical functional workspace extension — 2026-10-12

- 范围：校园墙、实验与作业、课表、食堂、项目、仪器、协作审阅、意见反馈、个人信息和管理后台。通过同一父工作区路由切换，不改 API、账户角色和权限契约。
- 配色：复用 `assistant-*`；仅在 `.calm-workspace` 内重映射 `ct-*` 和 `work-blue`。评分星级、风险提示、危险操作和课表语义颜色保持独立，不全局改为灰蓝。
- 布局：244px 可收起桌面侧栏；右侧去掉厚外框。页头 80px，手机 68px。通常内容最大 1120px，账户 1040px，所有显式宽度含内边距；桌面边距 40px，1100px 以下 28px，760px 以下 20px。后台桌面模块导航横向滚动，手机保留原生选择器。
- 字体：系统无衬线；主要页标题 28px/600、手机 25px，正文与输入 16px。统计数字也用系统字体。减少装饰性眉题和编号，不删功能说明。
- 形状：普通按钮和输入 12px，导航 10px，面板 16px；不把所有控件做成胶囊。白色面板、1px 浅边线，无厚阴影。手机主要操作至少 44px。
- 动效：侧栏 200ms，右侧进场 180ms 淡入和 4px 位移，退场 120ms 淡出；按键以 160ms 色彩反馈，不漂浮。`prefers-reduced-motion` 在该工作区取消动画和过渡。Pro 位于此作用域之外。
- 验收和已知限制见 `.impeccable/surfaces/workspace-calm.md`；截图使用开发模拟资料，不是生产数据或新校园事实。

### Four-destination navigation — 2026-10-13

- 主导航固定为「校园助手、校园墙、课表、评分」，聊天和功能页一致；保留新对话、历史搜索和最近对话。
- 页头右侧常驻文字入口「工具」，收纳实验与作业、我的项目、仪器资料、收到的审阅；在这些页面高亮工具入口。助手的附件与模型菜单仍独立位于输入框。
- 左下角账户菜单收纳个人信息、管理后台（仅现有 ADMIN 权限）、提交意见、原 Pro 弹窗和退出。管理员副标题为「账户与管理」，普通用户为「账户与设置」。不改变授权与路由契约。
- 同一个 244px 侧栏在页面切换时保留收起状态。菜单 180ms 淡入/4px 位移，侧栏 200ms；手机遮罩不做模糊。减少动效优先。
- 菜单与账户入口采用已有灰蓝、轻阴影或单层细边框，统一 18–20px 线性图标；工具菜单宽度 300px、窄屏两侧至少 12px。
- 设计参考与本轮证据见 `.impeccable/surfaces/workspace-navigation.md`。本节覆盖旧导航入口数量与跨页重置行为，不影响首页、登录和 Pro。

**Key Characteristics:**

- 品牌页面保留浅色阅读面、明确动作与既有彩球；获准首页以蓝色 CTA、实体彩球、深色能力画廊和暖色生活场景形成节奏。
- 登录后共享外壳采用珍珠白、深灰与低饱和灰蓝。
- 按用途区分柔和内框、控件与圆形聊天动作。
- 固定左侧导航与右侧切页，手机单列与抽屉导航。
- 保留现有彩球与已确认的动画表达。
- 聊天采用无框回答、浅色用户气泡、统一助手头像与单行浮动输入框。
- 全屏认证保留品牌与内部表单滚动，手机聊天以可见视口保留多行输入空间。

## Colors

既有品牌页面保留纸白和品牌蓝；获准公开首页采用珍珠白、墨黑和暖杏色的章节材料，主要动作为蓝色；当前聊天、共享外壳仍保留各自系统。既有杏色继续用于彩球暖色部分。frontmatter 保留源码的 CSS 色值，并按作用域应用。

sidecar 的八级色阶由这些颜色生成，供面板展示明暗变化；它们不是源码色板或新增 CSS token。

### Primary

- **Campthink 蓝**（`ct-blue`）：作用域外的既有品牌标点、共享链接与焦点提示；当前首页标题使用 `home-ink`；`.calm-workspace` 内已映射到 `assistant-accent`。
- **工作页蓝**（`work-blue`）：保留既有工作按钮的默认值；已批准的 `.calm-workspace` 内由 `workspace-calm.css` 映射到 `assistant-accent`。
- **浅蓝**（`ct-blue-soft`）：历史首页内容分区及作用域外与蓝色动作相关的浅色表面；当前首页使用独立 `home-*` 材料。
- **助手动作蓝**（`assistant-accent`）：2026-10-15用户获准加强登录后动作层级，应用于主要动作、头像、图标与键盘焦点；**助手深蓝**（`assistant-accent-hover`）用于悬停发送、链接与选中文字。
- **助手浅蓝**（`assistant-soft`）：聊天用户气泡、助手头像底色及聊天／共享外壳的当前导航状态。作用域为登录后的Apple外壳，不覆盖公开首页蓝色动作。
- **正常绿、核对琥珀和异常红**（`assistant-success`／`assistant-warning`／`assistant-danger`）：考勤的按时、待点名/迟到、已记录旷课状态；底色分别使用相应`-soft`值。始终同时显示状态文字和单位，不靠颜色单独判断。绿不用于推断未点名者已经到场。
- **首页动作蓝**（`home-accent`／`home-accent-hover`）：独立公开首页的主要动作、链接、图标与浅底可见焦点；**首页浅蓝**（`home-soft`）用于示例模式的悬停和选中。深色能力区使用浅蓝焦点。
- **认证动作蓝**（`auth-accent`／`auth-accent-hover`）：仅供全屏认证主要提交动作及悬停，值按认证源码独立记录，不将首页胶囊轮廓或工作区交互跨域带入。

### Tertiary

- **杏色**（`ct-apricot`）：既有首页与登录彩球中的暖色。延续原有装饰，不扩展为数据状态；首页生活章节另有下述局部暖色材料。

- **首页暖纸／生活场景**（`home-life-paper`／`home-life-stage`）：校园生活的并置材料；**生活棕**（`home-life-action`／`home-life-action-hover`）用于该章节主要入口及次级文字入口，不转为应用语义色。

### Neutral

- **纸白**（`ct-paper`）：作用域外的既有页面底色；`.calm-workspace` 内映射到 `assistant-bg`。
- **暖白**（`ct-white`）：面板、表单、弹窗及次要按钮。
- **深墨**（`ct-ink`）：品牌及现有共享界面的主要文字。
- **柔灰**（`ct-muted`）：现有次级文字；正文按具体阅读组件使用已建立的深色值，不将淡色装饰文字提升为正文规则。
- **浅灰边线**（`ct-line`）：页面、区域与导航的轻分隔。
- **助手珍珠白**（`assistant-bg`）：聊天与共享外壳的外层底色；**助手白面**（`assistant-surface`）用于右侧容器、聊天页头、输入器及新对话按钮。
- **助手浅层**（`assistant-panel`）：来源、附件、建议入口和附件圆形控件；**助手悬停层**（`assistant-hover`）用于共享导航、会话与账户悬停。
- **助手深灰**（`assistant-ink`）与**助手次级灰**（`assistant-muted`）：当前聊天与共享外壳的正文和辅助文字；**助手浅边线**（`assistant-line`）用于聊天页头与次级工具分隔。
- **首页珍珠白**（`home-paper`）与**首页白面**（`home-surface`）：公开首页背景与示例表面；**首页深灰**／**首页次级灰**（`home-ink`／`home-muted`）区分正文与说明，**首页浅边线**（`home-line`）用于示例分隔。
- **首页墨夜**（`home-night`）、**夜间正文**（`home-night-ink`）与**夜间次级灰**（`home-night-muted`）：仅供能力画廊和校园工具区形成深色阅读面。
- **认证白面／字段面**（`auth-surface`／`auth-field`）：全屏认证背景与表单控件；**认证深灰／次级灰**（`auth-ink`／`auth-muted`）用于标题、说明和启用字段占位文字。输入与 Element Plus 选择器的占位色只在认证作用域生效，联系与全局占位规则沿用。**认证品牌浅层**（`auth-brand`）用于手机品牌行。

左栏和工作表单已有偏灰绿的中性色层次，侧栏选中项使用浅蓝底。组件中列出的这些源码值属于各自共享组件，不能据此把整个产品改成另一套主色。

**The Quiet Workspace Scope Rule.** 工作区 Apple 配色和外壳规则只约束 `.workspace:is(.chat-focused,.calm-workspace)`；2026-10-27 另行批准更新的首页系统只约束 `.landing.apple-home`，保留原有彩球动态及独立明暗章节材料。登录弹窗、注册和 Pro 继续保留原有视觉与动画。旧共享组件默认值在 `.calm-workspace` 中受现有映射与覆盖约束，聊天气泡和输入器不推广到其他模块。

## Typography

**Body Font:** 现有 macOS／中文无衬线回退栈，见 frontmatter 的 `body`。

正文、表单和导航沿用现有系统无衬线栈。层级主要通过尺寸、字重、行距及空间区分。公开首页的 Apple 系统字体由用户明确选定，仅在获准的 `home-display` 范围记录，不建立其他新页面的展示字体规则，也不新增字体资源。

### Hierarchy

- **Title**：共享工作页标题（30px，行高 1.25，字距 -0.03em）；手机降为 26px。课表自身的标题尺寸不替换这条共享规则。
- **Body**：工作页说明、表单正文和内容（16px，行高 1.7）。已有工作页说明的最大行长为 55ch，按具体内容使用。
- **Label**：桌面导航与常规动作文本（14px）；表单标签保持现有 15px、600 字重。辅助说明使用 14px 和 1.7 行高。
- **Answer / Assistant Body**：聊天回答在桌面与手机均使用 16px、1.85 行高；`answer` 保留原有桌面尺寸记录，`assistant-body` 记录试点字体栈与双端规则。旧手机 14px、1.8 行高不再适用于聊天试点。
- **Assistant Compose / Heading**：聊天输入为 16px、1.7 行高；回答内部标题为 18px、600 字重、1.6 行高。用户消息为 16px、1.75 行高；它与助手正文共同保持可读尺寸。
- **Home Display / Action**：使用源码中的 Apple 系统栈和实色深墨色标题；桌面标题为 `home-display`，1100px 以下为 `clamp(44px, 5.3vw, 64px)`，760px 以下为 `clamp(39px, 10.5vw, 64px)`，行高均为 1.17。主要动作桌面为 `home-action`，手机为 15px；副标题为 18px／1.85，1100px 以下 16px，760px 以下 15px／1.8。示例问题与结果为 14px，模式为 14px，非实时说明为 11px；原生代码示意为 12px／1.9 等宽栈，详情见 sidecar。
- **Auth Input / Heading**：认证输入与提交文字使用 `auth-input`，手机也保持相同输入字号；标题使用 `auth-heading`，手机降为 30px。标签为 14px，说明为 15px／1.7；沿用既有系统栈，不新增字体。选择器由其实际内嵌输入继承认证字号。

桌面阅读尺寸由后加载的可读性样式调整（起于 1024px），不能把前面样式中的更小字号当作桌面当前值。装饰性的微小文字、kicker 和 eyebrow 不纳入可复用文字层级。

聊天试点由独立样式覆盖上述旧阅读密度，使用 `assistant-body` 的系统无衬线栈，不新增字体资源。页头名称为桌面 16px、手机 15px；导航 14px，次级操作 12–13px。这些辅助文字不替代双端正文尺寸。

## Layout

获准公开首页的独立容器上限为 1400px，边距使用 `home-gutter`，760px 以下为 24px；它不继承工作区侧栏或 pane。桌面采用文案与彩球并置，手机依次阅读标题／动作和完整视觉舞台；深色能力区与暖色生活区保留不同材料。首屏、章节与示例的具体编排由 `.impeccable/surfaces/homepage-renewal-20261027.md` 拥有，不能据此替换任务页布局。

以下两段是作用域外的既有默认记录；当前 `.chat-focused` 与 `.calm-workspace` 采用下文 244px／24px 的 Apple 外壳。既有桌面工作区采用左导航与右内容的两列框架；默认导航列为 254px，宽屏（起于 1500px）为 275px。导航内部可滚动，切换右侧页面时继续保留侧栏。已有“展开工作区”动作可隐藏侧栏，返回后恢复。

作用域外的既有右侧内容放在圆角容器中，工具栏保持在滚动内容之外。默认共享工作页居中，最大宽度为 1120px，桌面内边距为 36px 40px 64px；在 1100px 以下采用 28px 24px 48px，在 760px 以下采用 24px 18px 44px。手机容器占满视口，并取消外框的圆角、边线和外边距。

共享布局中，行内图标与文字间隔为 8px，动作组间隔为 10px，表单行间隔为 18px，表单面板内边距为 24px。动作组允许换行，筛选组可横向滚动。数值是这些现有组件的尺寸，不构成全站强制等距网格。

右侧切页采用短暂淡入和轻微纵向移动；进入 220ms、离开 110ms，工作区出现为 260ms。遵守现有减少动态效果媒体查询。首页、登录和 Pro 的动画保留各自实现，不用右侧切页参数覆盖它们。

当前聊天和共享外壳保留 244px 侧栏，可收起至 0；桌面外侧留白使用 `assistant-desktop-inset`，右侧白色容器使用 `assistant-frame-radius`。聊天回答与输入区最大宽度均为 760px，阅读区桌面左右留 32px。页头为 80px，手机为 68px，包含助手身份与新对话动作。760px 以下取消外侧留白、内框曲线与内框阴影，侧栏为覆盖式抽屉（`min(290px, 84vw)`），阅读区左右留 20px，输入区左右留 12px并考虑底部安全区与可见视口高度。用户消息最大占阅读区的 85%，手机为 92%。

全屏认证独占可见窗口，桌面两栏比例为 `.95fr 1.05fr`，表单宽度上限为 560px；自身无外边距、外框曲线、边线或投影。表单占满可用高度并在内部纵向滚动，长注册不推动外部文档。760px 以下变为品牌行与表单单列，品牌行常态 80px、键盘打开时 60px，隐藏装饰彩球和大文案；表单宽度上限为 480px，并保留安全区内边距。关闭控件始终位于独立上层。

可见视口观察器把高度、相对布局顶部偏移与键盘状态合并到每帧一次的更新，只有几何／状态变化才通知。失焦和宽度变化重建高度基线；捏合缩放时不把缩放几何解释为键盘，也不接管原生缩放。认证与聊天卸载时停止观察器并移除监听、取消待执行帧。认证进出及焦点恢复使用自身生命周期，不借用工作区切页动画。

手机聊天根固定在可见高度与顶部偏移构成的窗口内，不对键盘驱动的根高度／位置更新添加动画；消息区独立滚动。仅在手机聊天路由存在时限制 html／body 文档平移，切到课表等其他页面后作用域自动失效，恢复文档滚动。输入框采用 `flex: 0 0 auto`，使既有实测高度生效；高度至少 44px，最高为 138px 与可见视口四分之一取小值且不低于 44px，超过上限后在输入框内部滚动，不裁掉最后输入行。

**The Visible Viewport Ownership Rule.** 认证与手机聊天分别拥有自身可见视口；高度与顶部偏移必须成对更新，输入框必须遵守实测高度和内部滚动上限，监听与文档滚动约束必须随所属页面释放。合成几何通过不替代物理手机键盘验收。

聊天消息组间距为桌面 32px、手机 28px；头像与回答相隔 14px、手机 10px。聊天消息出现与输入高度变化使用 180ms、侧栏使用 200ms；缓动为 `assistant-ease`，见 sidecar。新对话、页头小动作与发送按钮使用 140ms 色彩及缩放过渡，按下为 0.96；不把按下缩放应用到每个导航行。减少动态效果时取消聊天和功能工作区动画、过渡与按下缩放，并使用即时滚动。仅在读者停留底部时跟随流式回答，上翻后保留阅读位置；“回到最新回答”位于整个输入停靠区上方（`bottom: calc(100% + 12px)`），包含附件预览造成的高度变化。

当前功能页让白色 pane 拥有画布：课表、评分、项目与后台页面根透明，内容面板仍可用白色、细线或语义表面分组。1100px 以下仪器布局改为单块内容，目录成为可横向滚动的条带，目录按钮固定基准宽度 175px；项目下一步区域使用 `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`，文字列最小宽度为 0，按钮允许换行且不超出区域。760px 以下项目目录采用 `minmax(0, 1fr) auto` 的紧凑两列，间距 8px 12px、内边距 16px 20px；标题、项目选择器和空态跨整行，归档过滤与刷新各有位置。

手机历史行把选择和删除分开：`minmax(0, 1fr) 44px` 两列、4px 间距，选择控件高 44px，删除为静态定位的 44px 方形触区。父行在普通、悬停与选中时均透明且无阴影；选中与悬停只由既有 12px 圆角子按钮承载。

## Elevation & Depth

主要深度来自纸白、暖白与浅色底层之间的色调变化及细边线。工作表单、常规内容面板和导航没有统一的重阴影。弹窗使用扩散阴影；历史首页卡片曾保留轻微上移反馈；当前获准首页的主要动作与开放能力项不沿用该反馈。聊天建议入口只改变浅色背景，不再上移。彩球中的渐变、内阴影和光感属于现有品牌材料，不能把它们误写为全站禁止项。

### Shadow Vocabulary

- **弹窗**：扩散阴影（`0 25px 90px #25324624`），用于现有联系、会员与删除等对话容器。
- **选中筛选**：轻微分离（`0 2px 6px #2833440c`），仅用于共享工作筛选组中的选中项。
- **复合字段焦点**：外层字段获得一个完整焦点面（`0 0 0 2px var(--ct-blue) inset, 0 0 0 3px #334bdb12`）；内嵌文字输入不重复绘制第二个焦点框。
- **Apple 输入器**：低对比扩散阴影（`0 1px 2px rgb(27 42 60 / 4%), 0 8px 28px rgb(27 42 60 / 5%)`）；该 `assistant-shadow` 已由输入器消费。焦点组合为 `0 0 0 2px var(--assistant-accent), var(--assistant-shadow)`。
- **聊天工具浮层**：两层扩散阴影（`0 4px 8px rgb(27 42 60 / 6%), 0 16px 40px rgb(27 42 60 / 10%)`）；回答、用户气泡与发送按钮保持无阴影。
- **新对话动作**：轻分离（`0 1px 3px rgb(27 42 60 / 4%)`）；**桌面内框**使用单层细线效果（`0 0 0 1px rgb(27 42 60 / 4%)`），手机取消。
- **首页示例停靠面**：扩散阴影（`0 26px 65px -20px #29385540`），用于彩球前景的单个白色示例面；首页背景、主要动作和能力卡外层无阴影。
- **首页彩球**：内光与扩散光（`inset -26px -24px 54px #3453992e, 0 36px 64px -28px #3c4f7d4d`），只属于实体彩球。
- **首页生活应用图形**：下方柔影（`0 26px 40px -16px #5d3c2f38`），仅用于暖色生活场景里的三个倾斜图形。

管理员登录的硬偏移阴影是现有页面的待审实现，未纳入共享阴影词汇。

**The Open Answer Rule.** 聊天回答直接排在白色阅读面，不加回答容器边线、圆角、填充或阴影；来源与附件按各自浅色容器区分层次。

## Shapes

以下两段保留作用域外的既有默认记录。共享控件圆润（`ct-radius-control`），面板更柔和（`ct-radius-panel`）；当前 `.calm-workspace` 的内容组件仍受其已有覆盖约束，聊天与共享外壳使用下面独立的最终覆盖规则。

作用域外的默认共享按钮与筛选项采用胶囊形（`pill`），表单字段采用独立的柔和圆角（`work-field`），右侧工作框使用已有 22px 曲线。圆形图标和移动端铺满屏幕的容器保留其已有轮廓；当前 Apple 内框为 24px。

当前聊天建议入口、来源区和共享主导航使用 `assistant-radius-md`；输入器使用 `assistant-radius-lg`，手机使用 `assistant-radius-lg-mobile`。共享内框使用 `assistant-frame-radius`，新对话使用 `assistant-control-radius`。用户气泡保留右下角收紧的轮廓（20px 20px 8px 20px）；附件披露与发送／停止均为 44px 圆形，模式选项保留 10px 曲线。页头助手头像为 40px、14px 圆角；回答头像为 36px、13px 圆角，手机为 32px、11px 圆角。360px 以下隐藏页头头像以保留文字空间。既有标志通过内联 SVG 复用，无新增位图。

当前功能页的分段筛选采用 14px 外层（`assistant-control-radius`）与 10px 内项，外层内边距和项间距均为 4px；不套用旧胶囊筛选的轮廓。复合搜索外层为 12px 曲线，内部输入透明；手机历史删除保留原有 8px 曲线和小图标，只扩大独立触区。

获准公开首页的主 CTA 与收尾按钮采用 `home-cta` 胶囊，前景示例与能力预览使用 `home-example` 曲线，示例模式按钮使用 `home-example-mode`。能力入口为 44px 圆形触区，能力卡外层无框；生活场景的三个图形使用 29% 曲线与局部倾斜。不能把这些首页轮廓推广到工作区。

全屏认证的字段与主提交动作采用 `auth-control` 曲线，包装和主动作最小高 50px；外层认证面铺满窗口且无圆角。它们是认证域的独立轮廓，不替换联系或 Pro 容器。

## Components

以下 Buttons、Chips、Cards / Containers、Inputs / Fields 与 Navigation 保留既有共享组件的默认记录；`.calm-workspace` 的内容组件继续受其已有覆盖约束。当前共享外壳和聊天以本节末尾的 Apple 规则为准；功能页保留原有模块结构，窄屏目录和下一步区域采用 Layout 中已实现的局部规则。

### Buttons

动作清楚、圆润，沿用现有胶囊工作按钮。

- **Shape:** 胶囊形，使用 `pill`。
- **Primary:** 工作页蓝、白色文字，内边距 11px 20px，图标间隔 8px。
- **Secondary:** 暖白表面、深色文字及细灰绿边线，与主按钮共享轮廓与内边距。
- **Hover / Focus:** 现有工作按钮悬停使用 `brightness(.96)`；键盘焦点为 2px 蓝色外框、3px 偏移。按钮禁用态使用 0.55 不透明度与不可点击光标。
- **Compatibility:** 首页与登录的按钮沿用其既有形状和反馈，不套用工作页按钮改造它们。

### Chips

轻量的胶囊筛选组，在已有工作页表达选择。

- **Style:** 灰绿组底色，透明默认项；组内留 5px，项内边距 10px 17px。
- **State:** 选中项为暖白底、蓝色文字和轻微阴影；使用 `aria-pressed`。手机内边距为 9px 14px，组可横向滚动。

### Cards / Containers

内容优先，暖白表面、柔和轮廓和细边线。

- **Corner Style:** 共享面板圆角；右侧工作框保留独立 22px 曲线。
- **Background:** 暖白或页面已有浅色层。
- **Shadow Strategy:** 常规工作表单没有额外阴影；弹窗和选中筛选按 Elevation & Depth 使用。
- **Border:** 1px 的现有灰绿细边线。
- **Internal Padding:** 共享工作表单使用 24px；手机降为 18px。

### Inputs / Fields

浅色字段，文字保持清楚，焦点只绘制一层。

- **Style:** 共享工作字段使用浅灰绿底、深色文字、1px 边线、14px 圆角和 12px 14px 内边距；正文为 16px。
- **Focus:** 原生工作字段使用外框提示；登录与联系复合字段把焦点放在外层包装，内部输入不重复描边。
- **Error / Disabled:** 工作页错误与状态文本使用现有独立状态面。字段的禁用和错误行为沿用其实际组件，不从课表导入表单推广新的全站状态。

### Navigation

导航持续在左侧，当前页用浅蓝底和蓝色文字标识，普通悬停为更深一层的灰绿底。导航项高度为 42px、左右内边距 12px，使用共享控件圆角；桌面文字为 14px。图标采用现有 18px 线性 SVG，来自当前导航图标组件。

在 760px 以下，左栏使用已有抽屉与遮罩；桌面保持常驻。右侧页面通过现有内容过渡切换，不能再套一层全页左栏。

### Apple Chat and Shared Shell

正文居中、身份轻量、工具按需展开；复用当前 Campthink 标志和功能行为。

2026-10-13文字渲染勘误：聊天使用私有Marked实例，为含汉字、以标点结尾的成对双星号提供有限加粗支持；沿用原生代码、转义、表格及链接解析，仍先经过现有DOMPurify和安全链接处理。不是更换主题、字体或Markdown引擎，也不是全CJK方言支持。真实公开问答的桌面/手机模拟证据见 `.impeccable/review/noon-2026-10-13/chat-emphasis-*-final.jpg`；两轮视觉核验已结束，原始HTML行为边界由回归测试另核，不宣称真机或整个聊天流程重新验收。

- **Identity / Navigation:** 同一个 `AssistantAvatar` 用于页头、空态与回答；回答中的 Campthink 身份标签视觉裁切但保留可访问文本。共享侧栏可收起，主导航使用 14px 文字、16px 圆角、10px 14px 内边距和至少 48px 高度；当前项为助手浅灰蓝底、深灰蓝文字，悬停使用 `assistant-hover`。
- **Messages:** 助手回答无框；用户消息使用 `assistant-user-message` 的浅色气泡。来源折叠在回答下方，采用浅层底色与 16px 圆角；复制、重试和反馈为轻量次级动作，手机按钮最小高度为 44px。
- **Composer:** 紧凑三列（`44px minmax(0, 1fr) 44px`）将附件披露、多行文字和发送／停止放在同一行；桌面内边距与列间距均 10px，手机均 8px。白色无边线输入器与阅读区等宽，使用已消费的 `assistant-shadow`。输入正文 16px、1.7 行高、44px 最小高度和 8px 2px 内边距；键盘帮助视觉裁切，并由 `aria-describedby` 连接输入框。发送／停止双端均为 44px 灰蓝圆形按钮；悬停加深，禁用态为浅层背景、次级灰和不透明状态。
- **Secondary Tools:** 附件、模型模式、草稿设置与额度收纳在工具菜单；菜单宽 340px，24px 圆角、12px 内边距，左对齐附件披露并位于其上方 56px，按视口限制宽高并可滚动。模式以 `aria-pressed` 标识选中状态。附件先呈现可编辑的本地文字预览，确认后才加入输入框；发送仍由用户另行触发。
- **Focus / Motion:** 普通独立控件键盘焦点为 2px 助手灰蓝外框、3px 偏移；输入器用外层 2px 焦点阴影与原有扩散阴影组合，内嵌输入不重复描边。搜索包装与滚动组采用下节的单一焦点归属和向内偏移。菜单和消息保持短促淡入与 3px 纵移；小动作的 140ms 按下响应和减少动态效果规则见 Layout 与 sidecar。

### Fullscreen Authentication and Visible Typing — 2026-10-28 batch

- **Surface / Fields:** 认证 Teleport 使用全屏两栏／手机品牌行，内部表单滚动，字段与提交动作使用 `auth-field`／`auth-submit`。启用的输入和选择器占位文字使用认证次级灰；该局部修复不改变联系字段。标题、输入与动作层级见 Typography。
- **Focus / Retention:** 桌面进入后聚焦当前认证模式首个输入；手机进入后只聚焦关闭按钮并阻止由聚焦引起的文档滚动。保留 Tab 约束、标签页键盘操作、关闭时返回入口焦点、忙碌关闭锁、失败草稿与原有认证行为。手机聚焦输入越出可见区域时仅滚动内部表单；提交动作能与输入同时容纳时才尝试一并露出。
- **Entry / Exit:** Vue 认证生命周期等待进入 520ms、退出 260ms；CSS 容器位移分别为 480ms、240ms，进入从下移 28px 到原位，退出下移 16px。外层与透明度过渡按 sidecar 独立记录，不套用联系窗口的时长。减少动态效果使 Vue 等待为 0，取消此认证过渡与位移。
- **Chat Textarea:** 保留现有多行测高、可见高度上限、超限内部滚动和草稿语义；只在聊天作用域解除继承的 flex 拉伸／压缩，让输入实测高度生效。手机聊天的固定根与独立消息滚动遵守 Layout 中的视口所有权；后续语音、身份或后台工作不由本记录声明已交付。

### Voice and Administrative Operation State — 2026-10-30

- **Stable Hold / Preview:** `HoldToTalk` 沿用 `assistant-*`、原有麦克风图标与正常／取消语义色。录音目标不随 hover／active 缩放；固定读出区及始终保留的次级动作行避免开始录音时的几何跳动。预览保存定稿与临时文字并在内层滚动，发送仍只取浏览器定稿文字；浏览器未返回临时结果时不伪造文字。
- **Consent / Cancellation:** 首次明确同意后，只在当前浏览器按账号／学校保存版本化布尔选择；无音频、转写正文、凭据或令牌。再次点击语音仅展开待录音控件，持按或键盘手势才启动识别。语音设置可撤销选择；存储不可用／损坏不当作同意。上滑、失焦、页面隐藏、身份／作用域变化及录入上限仍结束本次录入，不自动重启。
- **Identity Review:** 管理后台桌面提供直接“身份审核”模块，手机复用原模块选择器；`/admin?tool=identity-review` 只表达定位意图，仍经过正常管理身份核验。已打开的审核面在切换模块时保留核验说明与忙碌状态，并提供返回入口；既有离开确认、逐项复核与权限边界保留。
- **Task Runtime / Attempts:** 失败任务保留记录和原因，用“已尝试 N 次／自动重试已用尽”表达次数。配置明确启用后才允许手动重新排队；暂停或读取未知均禁用动作，后端在暂停时先拒绝再避免队列写入。启用配置不是执行器心跳，重新入队也不代表成功；失败回执不删除记录或自动重试。手机任务动作沿用至少 44px 高度。

### Merchant Publication and Community Feedback — 2026-10-31

- **Media / Scan:** 图片、名称／位置与评分各有独立区域；横竖照片使用 `contain` 保留完整内容，并提供完整照片链接。桌面商家列表采用双列扫描，手机单列；继承现有系统字体、暖色评分动作与蓝色管理动作，不增加全局视觉世界或图标家族。
- **Direct Publication:** 主入口为选照片、填名称和位置、明确点击发布；每张照片对应一家，1–10家一次提交。单一已发布食堂可默认，多食堂必须明确归属。照片、资料与可见状态同一事务提交；失败／不确定回执保留填写，不自动重复提交。可选文档整理和详细编辑继续保留原草稿与离开保护。
- **Stable Controls:** 列表刷新保持内容挂载，操作状态在固定工具栏内变化；未保存提示保留固定槽位。星级按钮是非提交动作，只有明确发布才写入。管理资料列和操作组按可用容器换行，单个操作不缩成逐字列；手机重置列基准，触区至少44px，录入字段16px。
- **Immediate Social State:** 已登录同校账户可评价；新安全评价、动态和回复经本地有限规则检查后直接公开，显示时间。普通差评可保留，公开文本不展示账户名。举报与后续隐藏独立于首次发布；历史待审／隐藏内容不批量重新公开。有限规则不等于全面合规认证，不将社区内容自动加入知识库或交给模型。
- **Scope:** 上述立即发布只覆盖社区内容。教学身份仍须核验，知识资料仍按原审核发布；正式教学／名单／任务执行开关的边界不变。源码／合成证据与真实发布、学校权限和物理微信键盘验收分开记录。

### Apple Functional Controls

- **Canvas / Fields:** 页面根透明，白色 pane 是画布；评分搜索外层为白色、1px 浅边线与 12px 圆角，内层输入透明、高 44px。历史搜索保留原有输入密度。历史与评分复合搜索由外层 `:focus-within` 绘制 2px 灰蓝焦点、向外偏移 2px；内层 `input:focus-visible` 无 outline 和 box-shadow，不再套独立字段的背景规则。
- **Scrolling Focus:** 历史选择、仪器目录、项目列表、项目页签、工作页签、评分筛选与后台模块导航的键盘焦点保持 2px 灰蓝线，`outline-offset: -2px`，让焦点留在滚动目标内部。
- **Segments:** 工作页签与评分筛选采用 `assistant-segment`／`assistant-segment-item` 轮廓；选中项使用助手浅灰蓝底、深灰蓝文字、透明边线和无阴影。手机工作／评分／项目页签最小高度为 44px。
- **Mobile History:** 独立选择与删除的几何规则见 Layout；删除仍用原有内联小图标、标签、危险悬停色与确认流程，禁用不透明度为 0.45，不把删除控件叠放在选择触区内。

### Apple Public-Home Controls — 2026-10-27

- **CTA:** 蓝色实面、白字、无边线或阴影；`home-cta` 记录胶囊主入口和收尾动作。主入口最小高度桌面 54px、手机 48px；手机内边距 12px 22px。悬停加深，按下以 180ms 缩至 0.97；浅底可见焦点为 2px 蓝色外框、5px 偏移，深色能力区改为浅蓝焦点。减少动态效果时取消过渡与缩放。
- **Example Dock:** 一个白色前景面承载问答／论文／代码三个原生按钮，以 `aria-pressed` 表示选中，group 通过 `aria-describedby` 关联“使用示例 · 非实时回答”。模式最小高 44px，问句与结果分层，中间用浅线分隔；已移除旧原生 select。手动切换使用 `aria-live="polite"`，播放时关闭播报。面板快照不模拟模型、路由或自动回答。
- **Demonstration Playback:** 播放由用户触发，每步 4500ms，三步结束；可暂停，手选模式停止播放。页面隐藏、示例离屏、非首章节、开弹窗或减少动态效果时停止；减少动态效果隐藏播放按钮。进度和问句切换使用当前局部规则，不推广为全站轮播。
- **Capability / Life Media:** 三个能力项使用原生代码绘制问答来源、提纲和代码示意，统一注明“功能示意 · 不会自动发送问题”；入口通过既有登录流程选择功能。生活章节使用 `HomeLifeScene` 的原生 SVG 图形、轨道和暖色材料，图像角色提供简明标签；图形不是可点击应用、真实截图或实时校园数据。
- **Navigation / Motion Ownership:** 顶部导航、章节定位与正常文档滚动共存；章节索引在 1100px 以下隐藏，不截获滚轮。`landing-polish.css` 拥有原有入场和 `auth-orb-current 16s linear infinite` 内部动态；首页根据隐藏、示例离屏、非当前章节或弹窗打开暂停彩球，减少动态效果取消。认证弹窗及全屏认证后续需求仍是独立范围。

## Do's and Don'ts

### Do:

- **Do** 继承 Campthink 的明亮配色、圆润控件、既有彩球与深色正文。
- **Do** 在桌面保留同一个左侧导航，在右侧工作容器切换新增页面。
- **Do** 复用共享工作页按钮、字段、面板和筛选状态，读取后置圆角及可读性覆盖。
- **Do** 保留可见键盘焦点、窄屏换行与现有减少动态效果处理。
- **Do** 在已批准的聊天与共享外壳作用域复用 `assistant-*` 的已消费规则，聊天保持双端 16px 正文、760px 阅读上限和单行三列输入器。
- **Do** 仅在获准公开首页消费 `home-*`，保留实体彩球、蓝色动作、深色能力画廊、暖色生活场景与非实时示例说明；当前构图权威见 `.impeccable/surfaces/homepage-renewal-20261027.md`。
- **Do** 仅在独立获准的全屏认证域消费 `auth-*`；手机认证保持输入字号、内部滚动和关闭控件焦点，手机聊天同时跟踪可见高度与顶部偏移。

### Don't:

- **Don't** 在普通扩展中改造已确认的登录弹窗、注册或 Pro 视觉与动画。2026-10-15用户明确要求的注册身份选择允许新增字段与必要滚动修复，不扩展为视觉重做；首页另有 2026-10-27 更新授权的局部例外；全屏认证及后续键盘批次不由该例外视为已交付。
- **Don't** 将课表独有的配色、标题、图片尺寸或导入构图提升为全站规则。
- **Don't** 将源码扫描记录或未取得截图的页面写成视觉验收通过。
- **Don't** 将现有 kicker、eyebrow、未经用户选定的系统展示字体或硬偏移阴影的待审实现提升为后续页面的共享规范；首页明确选定的 Apple 字体仅约束该局部范围。
- **Don't** 把工作区 Apple 覆盖与独立首页覆盖跨域混用，或扩大到登录弹窗、注册和 Pro；也不将聊天气泡、无框回答与输入器搬到其他模块。
- **Don't** 将合成开发截图和所选预览当作真实用户内容或上线位图；未消费的 `assistant-space-*` 与 `assistant-radius-sm` 声明不构成已落实的组件规则。
- **Don't** 将本批合成视口证据或局部 `ship` 结论写成物理 iOS／微信键盘、全站或部署验收。

### 教学身份扩展

2026-10-15沿用Apple工作区和现有语义色。注册四身份选择只提交申请；账户页直接显示本人状态，后台顶部折叠审核，课程/班级/学院绑定仍分开。审核列表采用细分隔，不新增指标卡或角色装饰；主审核操作蓝色，待审琥珀、通过绿色、拒绝/撤销红色，均保留文字。教学身份动作采用独立`.teaching-identity-actions`，不复用会被旧账户按钮覆盖的`.identity-actions`。仅较长注册表单内部滚动，关闭按钮与原动态彩球留在弹窗边界内，原入场和切换动画保留。双端截图与验证范围见docs/overnight-acceptance-2026-10-15.md，不将其视为真实账号或生产启用证明。
