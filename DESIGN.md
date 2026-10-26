---
name: Campthink
description: Campthink 既有品牌规则、Apple 聊天及登录后共享外壳与获准的公开首页扩展，依据源码分域提取。
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
  home-paper: "#fbfbfd"
  home-surface: "#ffffff"
  home-ink: "#29323c"
  home-muted: "#5d6876"
  home-accent: "#536f90"
  home-accent-hover: "#405b7b"
  home-soft: "#eaf0f6"
  home-line: "#e2e7ec"
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
    fontSize: "clamp(38px, 4.35vw, 68px)"
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: "-0.035em"
  home-action:
    fontSize: "16px"
    fontWeight: 500
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
  home-cta: "20px"
  home-example: "16px"
spacing:
  inline-gap: "8px"
  action-gap: "10px"
  field-gap: "18px"
  panel-inset: "24px"
  assistant-desktop-inset: "14px"
  assistant-composer-inset: "10px"
  assistant-composer-inset-mobile: "8px"
  home-gutter: "clamp(24px, 5vw, 80px)"
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
    padding: "14px 26px"
  home-example-choice:
    backgroundColor: "{colors.home-surface}"
    textColor: "{colors.home-ink}"
    rounded: "{rounded.home-example}"
    padding: "16px 20px"
---

# Design System: Campthink

<!-- Source scan: 2026-10-11. Evidence: PRODUCT.md; campus-ai-web/src/App.vue; campus-ai-web/src/main.js; campus-ai-web/src/styles/campthink.css (shared colors 1–11, workspace 133–191, soft surfaces 491–518); workspace-shell.css; readability.css; views/ChatView.vue; views/TimetableView.vue; components/TimetableTeaser.vue; docs/design/timetable-surface.md. This is a source-backed system record, not a browser visual acceptance or shipping verdict. -->
<!-- Chat-only additive scan: 2026-10-12. Evidence: .impeccable/surfaces/chat-assistant.md; campus-ai-web/src/styles/chat-assistant.css; views/ChatView.vue; components/AssistantAvatar.vue; components/CampMark.vue; components/ChatAttachmentPreview.vue. .impeccable/review/chat-assistant/{desktop.jpg,mobile.jpg,user-1280.jpg,mobile-tools.jpg,desktop-empty.jpg} are synthetic development fixtures for review, not shipping raster assets or real user content. This pass inspects source and does not assert browser acceptance. No new shipping raster assets. -->
<!-- Approved scoped merge: 2026-10-13. User selected C / Apple; source authority is the last imported apple-workspace.css over chat-assistant.css and workspace-calm.css in views/ChatView.vue. Current scope is .workspace:is(.chat-focused,.calm-workspace): chat presentation and shared authenticated shell, not every feature layout. Fresh finish disposition ship and supplied acceptance evidence are in .impeccable/review/apple-2026-10-13/finish-review.md and .impeccable/surfaces/chat-assistant.md. Historic acceptance above and below remains dated evidence, not a current whole-product verdict. -->
<!-- Scoped functional-source merge: 2026-10-14, for the Apple pages batch dated 2026-10-13. Final sources: workspace-calm.css and apple-workspace.css; finish/verdict/verification evidence: .impeccable/review/apple-pages-2026-10-13/. Palette and primitive scales unchanged. Existing dated acceptance counts remain history; this merge records current canvas, focus, segmented-control and bounded responsive rules, not a new whole-product acceptance. -->

<!-- Approved public-home merge: 2026-10-14. Final source: campus-ai-web/src/styles/landing-apple.css, imported after landing-polish.css in views/LoginView.vue; scope .landing.apple-home only. Fresh FULL centered finish review: .impeccable/review/apple-home-centered-2026-10-14/finish-review.md (ship). User-reference.png overrides asynchronous option-letter mapping; generated compositions are critique references, not shipping raster. No comp, plate or pixel pass. -->

## Overview

**Creative North Star: "Campthink"**

沿用用户确认的 Campthink 品牌：明亮的阅读面、深色正文、明确动作、柔和圆角和既有彩球。2026-10-14 获准的公开首页采用独立 Apple 覆盖，保留品牌蓝标题和原有动态彩球；登录弹窗、注册与 Pro 保留原有视觉和动画。登录后的聊天和共享外壳采用用户于 2026-10-13 选定的 C / Apple 方向，以珍珠白、深灰和低饱和灰蓝形成层次。色彩与形状来自当前实现，不另起视觉命名。

桌面工作区保持同一个左侧导航，在右侧内容容器切换页面；手机将内容变为单列并使用抽屉导航。本文件只提取可重复使用的规则；课表的首次导入构图、私有图片、独有配色与尺寸仍归其页面说明。2026-10-11 课表记录取得空态和合成已保存态的桌面/手机两轮截图，审阅结论为fix。首次表单和手机信息区已按结论修改，首次表单通过真实应用DOM复核；该记录的最新手机修改未重复截图，因此不声明课表最终视觉验收通过。

聊天页先作为用户确认的局部试点，2026-10-12 获准扩展到功能工作区。当前 Apple 覆盖以 `apple-workspace.css` 为最终来源，作用域仅为 `.workspace:is(.chat-focused,.calm-workspace)`：聊天采用开放回答、统一几何头像和单行浮动输入框，共享外壳采用同一配色与柔和桌面内框。其他模块的数据、内容语义、布局和交互沿用现有实现；首页不受工作区覆盖，而由下述独立批准范围约束，登录弹窗、注册和 Pro 继续受保护。

### Approved Apple chat and shared shell — 2026-10-13

- 最终优先级：Apple 覆盖高于下列历史试点与功能扩展记录；frontmatter 的 `assistant-*` 是此作用域当前消费的值，保留的 `ct-*`、`work-*` 是作用域外的既有默认值。
- 桌面外壳：保留 244px 可收起侧栏，外侧留 14px，右侧白色阅读／工作容器使用 24px 曲线；手机取消外留白、内框曲线与内框阴影，继续使用覆盖抽屉。
- 聊天：760px 阅读上限，开放回答，圆形 44px 附件和发送／停止控件，紧凑三列输入器。按钮按下以 140ms 响应缩至 0.96；减少动态效果时取消动画、过渡与缩放。
- 证据：独立 finish review disposition 为 `ship`，覆盖当前聊天及共享外壳；1440、870、390px 开发截图用于审阅。540/540 前端测试、定向 ESLint/Oxlint 与构建通过属于本轮提供的验证记录，文档合并不重复执行。后端、真实认证、模型计费、物理键盘和屏幕阅读器未在本轮重新验收。

### Approved Apple public-home scope exception — 2026-10-14

- 用户明确授权公开首页扩展，取代早先“首页排除”规则的这一局部范围；最终选择以用户附图为准，不以异步生成文件的 A/B 名称为准。
- 当前来源为最后导入的 `landing-apple.css`，只约束 `.landing.apple-home`。登录弹窗、注册、Pro、角色／管理员发现、路由与后端契约保持原有边界。
- `home-*` 记录此范围实际消费的材料和控件；首页构图、阅读顺序与 Persuade 模式归 `.impeccable/surfaces/apple-home.md`，不推广为任务页布局。
- 新的 FULL finish review 为 `ship`。本轮提供的 26 项定向／565 项完整前端测试、严格局部 lint 和构建均通过；本次文档合并仅核对既有证据与源码，不重跑应用验证。两轮居中核验与原生图像尺寸差异已披露，真机、物理键盘、屏幕阅读器、FPS 和 10% 动画回放未验。
- 使用示例明确标注非实时；没有新增能力、机构、指标或上线事实。生成图仅作审阅参考，没有新增上线位图。旧 comp gate 失败仍为失败，已披露为被本次代码实现取代。

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

- 品牌页面保留浅色阅读面、品牌蓝与既有彩球；获准首页采用灰蓝主要动作。
- 登录后共享外壳采用珍珠白、深灰与低饱和灰蓝。
- 按用途区分柔和内框、控件与圆形聊天动作。
- 固定左侧导航与右侧切页，手机单列与抽屉导航。
- 保留现有彩球与已确认的动画表达。
- 聊天采用无框回答、浅色用户气泡、统一助手头像与单行浮动输入框。

## Colors

既有品牌页面保留纸白和品牌蓝；获准公开首页与当前聊天、共享外壳分别以各自珍珠白和灰蓝形成阅读层次。已有杏色只延续彩球的暖色部分。frontmatter 保留源码的 CSS 色值，并按作用域应用。

sidecar 的八级色阶由这些颜色生成，供面板展示明暗变化；它们不是源码色板或新增 CSS token。

### Primary

- **Campthink 蓝**（`ct-blue`）：获准首页标题的实色强调，以及作用域外的既有品牌标点、共享链接与焦点提示；`.calm-workspace` 内已映射到 `assistant-accent`。
- **工作页蓝**（`work-blue`）：保留既有工作按钮的默认值；已批准的 `.calm-workspace` 内由 `workspace-calm.css` 映射到 `assistant-accent`。
- **浅蓝**（`ct-blue-soft`）：现有首页内容分区及与蓝色动作相关的浅色表面。
- **助手动作蓝**（`assistant-accent`）：2026-10-15用户获准加强登录后动作层级，应用于主要动作、头像、图标与键盘焦点；**助手深蓝**（`assistant-accent-hover`）用于悬停发送、链接与选中文字。
- **助手浅蓝**（`assistant-soft`）：聊天用户气泡、助手头像底色及聊天／共享外壳的当前导航状态。作用域为登录后的Apple外壳，不覆盖公开首页灰蓝。
- **正常绿、核对琥珀和异常红**（`assistant-success`／`assistant-warning`／`assistant-danger`）：考勤的按时、待点名/迟到、已记录旷课状态；底色分别使用相应`-soft`值。始终同时显示状态文字和单位，不靠颜色单独判断。绿不用于推断未点名者已经到场。
- **首页灰蓝**（`home-accent`／`home-accent-hover`）：独立公开首页的主要动作、链接、图标与可见焦点；**首页浅灰蓝**（`home-soft`）用于其导航动作悬停。

### Tertiary

- **杏色**（`ct-apricot`）：既有首页与登录彩球中的暖色。延续原有装饰，不扩展为数据状态或新页面主色。

### Neutral

- **纸白**（`ct-paper`）：作用域外的既有页面底色；`.calm-workspace` 内映射到 `assistant-bg`。
- **暖白**（`ct-white`）：面板、表单、弹窗及次要按钮。
- **深墨**（`ct-ink`）：品牌及现有共享界面的主要文字。
- **柔灰**（`ct-muted`）：现有次级文字；正文按具体阅读组件使用已建立的深色值，不将淡色装饰文字提升为正文规则。
- **浅灰边线**（`ct-line`）：页面、区域与导航的轻分隔。
- **助手珍珠白**（`assistant-bg`）：聊天与共享外壳的外层底色；**助手白面**（`assistant-surface`）用于右侧容器、聊天页头、输入器及新对话按钮。
- **助手浅层**（`assistant-panel`）：来源、附件、建议入口和附件圆形控件；**助手悬停层**（`assistant-hover`）用于共享导航、会话与账户悬停。
- **助手深灰**（`assistant-ink`）与**助手次级灰**（`assistant-muted`）：当前聊天与共享外壳的正文和辅助文字；**助手浅边线**（`assistant-line`）用于聊天页头与次级工具分隔。
- **首页珍珠白**（`home-paper`）与**首页白面**（`home-surface`）：公开首页背景与示例表面；**首页深灰**／**首页次级灰**（`home-ink`／`home-muted`）区分正文与说明，**首页浅边线**（`home-line`）用于轻分隔。

左栏和工作表单已有偏灰绿的中性色层次，侧栏选中项使用浅蓝底。组件中列出的这些源码值属于各自共享组件，不能据此把整个产品改成另一套主色。

**The Quiet Workspace Scope Rule.** 工作区 Apple 配色和外壳规则只约束 `.workspace:is(.chat-focused,.calm-workspace)`；2026-10-14 另行批准的首页扩展只约束 `.landing.apple-home`，保留原有彩球动态。登录弹窗、注册和 Pro 继续保留原有视觉与动画。旧共享组件默认值在 `.calm-workspace` 中受现有映射与覆盖约束，聊天气泡和输入器不推广到其他模块。

## Typography

**Body Font:** 现有 macOS／中文无衬线回退栈，见 frontmatter 的 `body`。

正文、表单和导航沿用现有系统无衬线栈。层级主要通过尺寸、字重、行距及空间区分。公开首页的 Apple 系统字体由用户明确选定，仅在获准的 `home-display` 范围记录，不建立其他新页面的展示字体规则，也不新增字体资源。

### Hierarchy

- **Title**：共享工作页标题（30px，行高 1.25，字距 -0.03em）；手机降为 26px。课表自身的标题尺寸不替换这条共享规则。
- **Body**：工作页说明、表单正文和内容（16px，行高 1.7）。已有工作页说明的最大行长为 55ch，按具体内容使用。
- **Label**：桌面导航与常规动作文本（14px）；表单标签保持现有 15px、600 字重。辅助说明使用 14px 和 1.7 行高。
- **Answer / Assistant Body**：聊天回答在桌面与手机均使用 16px、1.85 行高；`answer` 保留原有桌面尺寸记录，`assistant-body` 记录试点字体栈与双端规则。旧手机 14px、1.8 行高不再适用于聊天试点。
- **Assistant Compose / Heading**：聊天输入为 16px、1.7 行高；回答内部标题为 18px、600 字重、1.6 行高。用户消息为 16px、1.75 行高；它与助手正文共同保持可读尺寸。
- **Home Display / Action**：使用源码中的 Apple 系统栈和实色品牌蓝强调；桌面标题为 `home-display`，1100px 以下改为 `clamp(34px, 4.1vw, 48px)`，760px 以下为 `clamp(31px, 8.2vw, 52px)`／1.28 行高。主要动作桌面为 `home-action`，手机为 15px；正文及原生示例选择器保持源码的双端可读尺寸，详情见 sidecar。

桌面阅读尺寸由后加载的可读性样式调整（起于 1024px），不能把前面样式中的更小字号当作桌面当前值。装饰性的微小文字、kicker 和 eyebrow 不纳入可复用文字层级。

聊天试点由独立样式覆盖上述旧阅读密度，使用 `assistant-body` 的系统无衬线栈，不新增字体资源。页头名称为桌面 16px、手机 15px；导航 14px，次级操作 12–13px。这些辅助文字不替代双端正文尺寸。

## Layout

获准公开首页的独立容器上限为 1240px，边距使用 `home-gutter`，760px 以下为 24px；它不继承工作区侧栏或 pane。首页构图与前景示例的响应式编排仅在 surface brief 记录，不能据此替换任务页布局。

以下两段是作用域外的既有默认记录；当前 `.chat-focused` 与 `.calm-workspace` 采用下文 244px／24px 的 Apple 外壳。既有桌面工作区采用左导航与右内容的两列框架；默认导航列为 254px，宽屏（起于 1500px）为 275px。导航内部可滚动，切换右侧页面时继续保留侧栏。已有“展开工作区”动作可隐藏侧栏，返回后恢复。

作用域外的既有右侧内容放在圆角容器中，工具栏保持在滚动内容之外。默认共享工作页居中，最大宽度为 1120px，桌面内边距为 36px 40px 64px；在 1100px 以下采用 28px 24px 48px，在 760px 以下采用 24px 18px 44px。手机容器占满视口，并取消外框的圆角、边线和外边距。

共享布局中，行内图标与文字间隔为 8px，动作组间隔为 10px，表单行间隔为 18px，表单面板内边距为 24px。动作组允许换行，筛选组可横向滚动。数值是这些现有组件的尺寸，不构成全站强制等距网格。

右侧切页采用短暂淡入和轻微纵向移动；进入 220ms、离开 110ms，工作区出现为 260ms。遵守现有减少动态效果媒体查询。首页、登录和 Pro 的动画保留各自实现，不用右侧切页参数覆盖它们。

当前聊天和共享外壳保留 244px 侧栏，可收起至 0；桌面外侧留白使用 `assistant-desktop-inset`，右侧白色容器使用 `assistant-frame-radius`。聊天回答与输入区最大宽度均为 760px，阅读区桌面左右留 32px。页头为 80px，手机为 68px，包含助手身份与新对话动作。760px 以下取消外侧留白、内框曲线与内框阴影，侧栏为覆盖式抽屉（`min(290px, 84vw)`），阅读区左右留 20px，输入区左右留 12px并考虑底部安全区与可见视口高度。用户消息最大占阅读区的 85%，手机为 92%。

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
- **首页示例表面**：低对比扩散阴影（`0 4px 20px rgb(27 42 60 / 5%)`），只用于已存在的两个白色示例表面；首页背景、主要动作和能力区无外框阴影。彩球保留源码的内光和扩散光感。

管理员登录的硬偏移阴影是现有页面的待审实现，未纳入共享阴影词汇。

**The Open Answer Rule.** 聊天回答直接排在白色阅读面，不加回答容器边线、圆角、填充或阴影；来源与附件按各自浅色容器区分层次。

## Shapes

以下两段保留作用域外的既有默认记录。共享控件圆润（`ct-radius-control`），面板更柔和（`ct-radius-panel`）；当前 `.calm-workspace` 的内容组件仍受其已有覆盖约束，聊天与共享外壳使用下面独立的最终覆盖规则。

作用域外的默认共享按钮与筛选项采用胶囊形（`pill`），表单字段采用独立的柔和圆角（`work-field`），右侧工作框使用已有 22px 曲线。圆形图标和移动端铺满屏幕的容器保留其已有轮廓；当前 Apple 内框为 24px。

当前聊天建议入口、来源区和共享主导航使用 `assistant-radius-md`；输入器使用 `assistant-radius-lg`，手机使用 `assistant-radius-lg-mobile`。共享内框使用 `assistant-frame-radius`，新对话使用 `assistant-control-radius`。用户气泡保留右下角收紧的轮廓（20px 20px 8px 20px）；附件披露与发送／停止均为 44px 圆形，模式选项保留 10px 曲线。页头助手头像为 40px、14px 圆角；回答头像为 36px、13px 圆角，手机为 32px、11px 圆角。360px 以下隐藏页头头像以保留文字空间。既有标志通过内联 SVG 复用，无新增位图。

当前功能页的分段筛选采用 14px 外层（`assistant-control-radius`）与 10px 内项，外层内边距和项间距均为 4px；不套用旧胶囊筛选的轮廓。复合搜索外层为 12px 曲线，内部输入透明；手机历史删除保留原有 8px 曲线和小图标，只扩大独立触区。

获准公开首页的主要 CTA 使用 `home-cta` 曲线，前景示例使用 `home-example` 曲线；原生选择器保留自身 8px 曲线，收尾按钮仍为源码的 28px 曲线。不能把该局部轮廓推广到工作区。

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

### Apple Functional Controls

- **Canvas / Fields:** 页面根透明，白色 pane 是画布；评分搜索外层为白色、1px 浅边线与 12px 圆角，内层输入透明、高 44px。历史搜索保留原有输入密度。历史与评分复合搜索由外层 `:focus-within` 绘制 2px 灰蓝焦点、向外偏移 2px；内层 `input:focus-visible` 无 outline 和 box-shadow，不再套独立字段的背景规则。
- **Scrolling Focus:** 历史选择、仪器目录、项目列表、项目页签、工作页签、评分筛选与后台模块导航的键盘焦点保持 2px 灰蓝线，`outline-offset: -2px`，让焦点留在滚动目标内部。
- **Segments:** 工作页签与评分筛选采用 `assistant-segment`／`assistant-segment-item` 轮廓；选中项使用助手浅灰蓝底、深灰蓝文字、透明边线和无阴影。手机工作／评分／项目页签最小高度为 44px。
- **Mobile History:** 独立选择与删除的几何规则见 Layout；删除仍用原有内联小图标、标签、危险悬停色与确认流程，禁用不透明度为 0.45，不把删除控件叠放在选择触区内。

### Apple Public-Home Controls — 2026-10-14

- **CTA:** 灰蓝实色、白字、无边线或阴影；`home-cta` 记录实际主入口，最小高度桌面 56px、手机 48px，手机内边距 12px 22px。悬停加深，按下以 180ms 缩至 0.96；可见焦点为 2px 灰蓝外框、4px 偏移，减少动态效果时取消过渡与缩放。
- **Native Example:** 原生 `select` 保留真实选择行为、`aria-label` 与非实时说明的 `aria-describedby`；白色包装使用 `home-example-choice`，内部选择器透明、最小高 44px、桌面 16px／手机 15px。相邻解释使用同一白面、示例曲线与低对比阴影，`aria-live="polite"` 呈现已选示例。sidecar 的独立快照只展示原生控件，不模拟实时回答。
- **Motion Ownership:** 原始 `landing-polish.css` 保留彩球内部 `auth-orb-current 16s linear infinite`，非当前章节、页面隐藏或弹窗打开时暂停；减少动态效果时取消。入场、滚动、示例过渡与登录弹窗继续由原有实现拥有，首页覆盖只添加自身动作反馈。

## Do's and Don'ts

### Do:

- **Do** 继承 Campthink 的明亮配色、圆润控件、既有彩球与深色正文。
- **Do** 在桌面保留同一个左侧导航，在右侧工作容器切换新增页面。
- **Do** 复用共享工作页按钮、字段、面板和筛选状态，读取后置圆角及可读性覆盖。
- **Do** 保留可见键盘焦点、窄屏换行与现有减少动态效果处理。
- **Do** 在已批准的聊天与共享外壳作用域复用 `assistant-*` 的已消费规则，聊天保持双端 16px 正文、760px 阅读上限和单行三列输入器。
- **Do** 仅在 2026-10-14 获准公开首页消费 `home-*`，保留动态彩球、实色标题和非实时示例说明；构图权威见该 surface brief。

### Don't:

- **Don't** 在普通扩展中改造已确认的登录弹窗、注册或 Pro 视觉与动画。2026-10-15用户明确要求的注册身份选择允许新增字段与必要滚动修复，不扩展为视觉重做；首页另有2026-10-14批准的局部例外。
- **Don't** 将课表独有的配色、标题、图片尺寸或导入构图提升为全站规则。
- **Don't** 将源码扫描记录或未取得截图的页面写成视觉验收通过。
- **Don't** 将现有 kicker、eyebrow、未经用户选定的系统展示字体或硬偏移阴影的待审实现提升为后续页面的共享规范；首页明确选定的 Apple 字体仅约束该局部范围。
- **Don't** 把工作区 Apple 覆盖与独立首页覆盖跨域混用，或扩大到登录弹窗、注册和 Pro；也不将聊天气泡、无框回答与输入器搬到其他模块。
- **Don't** 将合成开发截图和所选预览当作真实用户内容或上线位图；未消费的 `assistant-space-*` 与 `assistant-radius-sm` 声明不构成已落实的组件规则。

### 教学身份扩展

2026-10-15沿用Apple工作区和现有语义色。注册四身份选择只提交申请；账户页直接显示本人状态，后台顶部折叠审核，课程/班级/学院绑定仍分开。审核列表采用细分隔，不新增指标卡或角色装饰；主审核操作蓝色，待审琥珀、通过绿色、拒绝/撤销红色，均保留文字。教学身份动作采用独立`.teaching-identity-actions`，不复用会被旧账户按钮覆盖的`.identity-actions`。仅较长注册表单内部滚动，关闭按钮与原动态彩球留在弹窗边界内，原入场和切换动画保留。双端截图与验证范围见docs/overnight-acceptance-2026-10-15.md，不将其视为真实账号或生产启用证明。
