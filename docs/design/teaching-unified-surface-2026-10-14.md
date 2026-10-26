# Unified timetable and attendance surface · 2026-10-14

## Overview

Mode: Operate. This is an ordinary extension of Campthink's established Apple workspace, with **no-new-system-decision**. The 2026-10-14 contract in `.impeccable/surfaces/campus-ai-web-src-views-timetableview-vue.md` owns its composition and task sequence. `DESIGN.md` and `.impeccable/design.json` remain the incumbent system record; this note records actual local/source rules without adding global tokens or a new visual identity.

One course page presents the next useful action selected by the server, then the selected day's readable arrangements. A course or station notice continues into the correctly authorized lesson. Import/update and provenance remain secondary disclosure tasks. The page inherits the same four navigation destinations, administrator entry, desktop sidebar and mobile drawer. No new bitmap ships.

| Checked source | Authority in this surface |
| --- | --- |
| `campus-ai-web/src/views/TimetableView.vue` | Scope title, unified calendar, collapsed import management and old-original download |
| `campus-ai-web/src/components/UnifiedWeekCalendar.vue` | Week/range controls, notice/focus action, scoped totals, date rows and optional grid |
| `campus-ai-web/src/components/CourseSchedulePanel.vue` | Existing local file parsing, comparison, confirmation and personal timetable fallback |
| `campus-ai-web/src/views/TeachingView.vue` | Focused lesson continuation, manual roster, save/finish and audited correction UI |
| `campus-ai-web/src/styles/workspace-calm.css` and `apple-workspace.css` | Consumed shared palette, page/field overrides, shell, focus and reduced motion |
| `campus-ai-web/src/utils/unifiedTimetable.js` | Response validation, account/query ownership, stale refresh and privacy reset |
| `UnifiedTimetableService.java` and the scoped summary/mark methods in `TeachingService.java` | Read model, joining, scope, clock, counts and write permission; not normative visual tokens |

`ChatView.vue` imports `apple-workspace.css` after `workspace-calm.css`; the suggested `src/styles/assistant-workspace.css` file is absent. Use the implemented import/cascade authority. This note is based on source and existing synthetic captures, not newly measured browser styles.

## Colors

The surface consumes the incumbent `assistant-*` values: white pane, pearl outer background, deep-grey text, secondary-grey explanations, grey-blue actions/focus, soft grey-blue selection and light dividers. `workspace-calm.css` maps older `ct-*` references into those same values, so the retained import panel stays in the approved workspace.

The primary course action uses `assistant-accent`, white text and `assistant-accent-hover`. Notices and selected dates use `assistant-soft`. Regular course rows remain open white content separated by light lines. Local error/absence text and late text keep their actual semantic colors; they are not new global palette primitives. Meaning is also written in text, never conveyed by color alone.

## Typography

Keep the implemented system sans with Chinese fallbacks and no new font asset. Calendar body text is (16px / 1.65); personal import text remains (16px / 1.7). Shared higher-specificity rules resolve the timetable page title to (28px / 600 / 1.35), then (25px) below 761px; the view's earlier (32px / 28px) declarations are not the current Apple workspace title rule. The focused teaching heading uses its own observed (30px / 600 / 1.25), then (26px) on mobile.

The focused course title is (26px / 600), then (24px) on mobile. Daily course names are (17px / 500); room/teacher and summary copy are (14px), and source/date hints are smaller secondary text. Dates, times and totals use tabular numerals. Product roster fields consume the shared (16px) field override; fixture-only small selectors do not establish a product text standard.

## Layout

The existing white workspace pane owns the canvas and its desktop (24px) curve. It retains the shared (244px) collapsible sidebar and (14px) desktop outer inset. At 760px and below, outer inset, pane radius and pane shadow are removed; navigation stays in the existing overlay drawer. The shared `work-page` rule currently caps content at (1120px), including padding; it overrides local timetable/teaching max-width declarations. Padding is (20px 40px 64px), becomes (20px 28px 48px) below 1101px, and (16px 20px calc(40px + safe-area inset)) on mobile.

The reading/action order is page title and hint → compact week/range controls → unread notice if present → one current/next course and its action → plain scoped totals → seven date buttons → chronological selected-day rows → optional whole-week view and source checking → collapsed import/update and original recovery. Titles resolve to 我的课表, 课表与点名, 班级考勤 or 学院考勤 from the returned authorized view. No metric-card dashboard is introduced.

Desktop controls wrap naturally, with range/week navigation on the trailing side. Mobile uses two equal min-width-zero columns: range and week buttons first, then available view/class selectors. The focused course action fills the mobile width. Daily rows move time to its own line, retain readable name/room/teacher, and keep their record action separate. Totals wrap, with provenance details on their own line when needed. Existing 390px evidence reports no document horizontal overflow; this note does not claim every intermediate viewport was tested.

The full-week grid is a secondary, initially collapsed view. Its own scroll region contains a minimum (850px) grid instead of widening the document. The server's `gridSafe` is decisive: simultaneous arrangements cannot cover one another in a shared cell, even when two different classes are legitimate concurrent arrangements in a leadership scope. Unsafe or unconfigured grids use the dated list. Out-of-period clock courses remain in that list. The fallback personal panel retains its existing desktop grid/mobile list threshold at (1100px).

Opening a course from the unified page passes the lesson, view, date and return context. The focused continuation shows 返回课表, course identity, date/time, room/teacher, current counts and one roster. It hides general filters, lesson list and configuration panel, using a local maximum (820px) content measure. The broader teaching page retains its existing two-column list/detail layout, becoming one column below 761px; that broader composition is not promoted into the unified first viewport.

## Elevation & Depth

The extension uses inherited white/soft tones, whitespace and thin dividers. Focused course and daily rows have no raised card shell or heavy shadow. The collapsed import's opened form keeps the existing white (1px) bordered, shadow-free panel. The shared desktop pane keeps its existing fine-line depth and loses it on mobile. No new glow, decorative image or nested card system is added.

## Shapes

Independent calendar buttons/selects and roster fields/actions use observed (12px) curves with a minimum (44px) height. Date buttons own their soft selected state. The shared import form consumes the existing (16px) panel curve; it does not borrow the shell curve. Native select behavior remains native. Mobile roster save/finish buttons share the available row and stretch; unsaved-selection text wraps below.

The existing high-specificity workspace rules own visible focus for buttons, links, summaries and fields: one (2px) grey-blue outline with (3px) offset. Fields also change border color without an added shadow. Their inner contents do not gain a second focus surface. The outer pane owns its own geometry; a row or disclosure control owns its own selection/focus geometry. Existing compound-search and inward scrolling-group focus rules stay with those incumbent controls.

Buttons inherit the workspace's short color transitions; lesson detail keeps the source's (180ms) fade/(4px) movement. Shared and local reduced-motion rules cancel those transitions/movements. This documentation pass adds no animation or motion token and does not claim a frame-rate or physical-keyboard measurement.

## Components

### Unified reading and scoped totals

The server joins private imports with authorized teaching arrangements without writing/deleting the originals or changing membership. Only exact, unambiguous date/time/course/room matches merge; provenance is retained. Conflicts remain visible. Unknown clock times cannot produce a current-class claim or timing reminder. A teacher's current actionable unfinished roster takes priority over an earlier ended unfinished roster when available. The client displays the returned focus rather than inventing another schedule organization layer.

Totals name their grain and recording state: 本周 N节, 待点名 N人次 (student view: N次), 已记录旷课 N人 for non-student scopes, and 已记录迟到 N人次. Recorded absence counts distinct students within the authorized queried lessons; pending and late counts are attendance instances. They are not interchangeable people counts. UNKNOWN is an unrecorded state, never an inferred absence. Zero recorded absence/late with pending rows does not imply complete attendance.

Seven date buttons use `aria-pressed` inside a labelled group, rather than claiming an ARIA tab interface. Course names, room and teacher are real text. Grid course controls include date, course, time and room in their accessible name; the scroll region has its own label and keyboard target. Source warnings remain inspectable in a disclosure. Empty copy says there are no saved arrangements, not that school is closed.

### Notices and state ownership

Unread student/teacher notices are actionable text buttons. In the calendar, opening a notice explicitly marks it read before routing; a failed receipt reports failure rather than pretending success. The focused lesson is still re-authorized by the backend. Notices use configured due times and the persisted station inbox: they are not WeChat push, live school synchronization or guaranteed delivery while the OS is offline.

The transport resource validates the response and its target membership. Account/session changes abort old reads and clear prior data. A changed query clears prior scope; same-account/same-query refresh can retain the last successful read with visible stale status and disabled record actions. Authorization or unsupported-service responses clear that read. The active unified page refreshes the light inbox at (60s) and full calendar at (5min); hidden tabs do not poll. The teaching continuation has its own existing notice read interval, not a new global polling rule.

### Progressive personal import

`TimetableView` shows collapsed 导入或更新个人课表 when unified reading is available. `manage-only` removes the panel's duplicate course calendar while retaining semester, source, inspection and private-data actions. If the unified service is unavailable, the established personal panel remains usable. Previously saved originals stay behind 取回以前保存的原件; opening that disclosure loads a private download, not a displayed screenshot timetable.

File selection starts local parsing and presents adjacent filename/status feedback. Supported explicit-column data keeps the established file limits, comparison and cancellation behavior. Users inspect additions, removals, actual field changes, metadata/date changes and overlaps, then explicitly confirm before save. Optional pasted/edited data stays collapsed. Version conflicts preserve the draft and require a new comparison. This is the retained import contract, not new evidence that arbitrary school exports or authenticated school integration work.

### Manual attendance continuation

Each teacher roster row pairs identity text with an independently labelled native select. Initial UNKNOWN displays 待点名. Selections remain local drafts until save succeeds; 保存点名 can retain unknown rows, while 完成点名 is disabled with any unknown row. The backend never fills unknown with absence. Only the authorized teacher can write, beginning at the configured five-minute pre-class boundary; absence remains unavailable before class starts. Cancelled lessons retain records and disable marking.

The correction reason appears only when a changed row already had a recorded status or the lesson was finalized. It is required in that case, with the original record and reason retained. Initial manual marking does not show a premature correction field. Saved/draft feedback uses explicit text and status semantics. Leaving or refreshing a dirty roster uses the existing unsaved-change flow; stale drafts are not silently resubmitted.

Students receive only their own attendance row. Counselors and secretaries read records only within their configured class/college scope and do not acquire teacher write controls. The fixture's separate identities are synthetic; its unsupported advanced configuration methods reject rather than simulate success. Real backend configuration and transactions belong to separate supplied HTTP/H2 evidence.

## Do's and Don'ts

- **Do** inherit the current Apple workspace and its actual CSS cascade; keep this surface's task composition local.
- **Do** retain readable course/room/teacher text, explicit provenance, separate pending and recorded counts, and one direct authorized lesson continuation.
- **Do** keep all concurrent arrangements visible in dated rows, with the grid conditional on safe placement.
- **Do** use native manual roster controls, explicit saving and audited correction, with existing privacy/reset/unsaved-change behavior.
- **Don't** turn local course counts, breakpoints, grid measurements, titles, semantic colors or focused roster composition into new global system decisions.
- **Don't** infer absence, semester coverage, school closure, live synchronization, school integration or deployed teaching access from a missing row or a synthetic capture.
- **Don't** retain real roster identities, credentials, school-private schedules or their screenshots in design evidence.

### Checked finish evidence and limits

The documenter inspected `.impeccable/review/teaching-unified-2026-10-14/evidence.md`, the finished sources above, and all nine existing final JPEGs. Image metadata confirms the five desktop files at 1440×1050 and four mobile files at 390×844:

| Final synthetic capture | Documented state |
| --- | --- |
| `round2-student-desktop.jpg` / `round2-student-mobile-top.jpg` | Own imported/teaching arrangements, next course, student pending count |
| `round2-teacher-desktop.jpg` / `round2-teacher-mobile-top.jpg` | Current actionable roster, compact mobile controls, pending versus recorded totals |
| `round2-teacher-roster-desktop.jpg` / `round2-teacher-roster-mobile.jpg` | Focused manual roster with UNKNOWN rows, native selects and save/finish |
| `round2-counselor-desktop.jpg` | Responsible-class read scope and pending/recorded totals |
| `round2-secretary-desktop.jpg` / `round2-secretary-mobile-top.jpg` | Responsible-college overview and class filter |

The supplied workflow evidence covers a synthetic student notice opening its own row, a teacher notice opening the matching roster, three manual marks, completion, a reasoned late correction and counselor scope feedback. Fixture reset between captures means the final roster screenshots intentionally show fresh UNKNOWN rows rather than the prior saved case.

Two main visual rounds and one main correction batch preceded one reviewer-directed P2 correction: unknown totals had been ambiguous alongside zero recorded absence/late. All nine final captures were recaptured after that correction, per the supplied handoff. The fresh independent final disposition is **ship, limited strictly to that one finding**. It is not a new complete all-state verdict. The rejected clipped viewport file remains rejected. These screenshots are synthetic viewport fragments and verification artifacts, not production data or shipping imagery. No every-error-state screenshot coverage, physical device, real screen reader or full-page acceptance is claimed.

Latest verification supplied to this documenter: frontend (588 passing), strict ESLint/Oxlint (zero warnings), Vite (1911 modules / 446ms); backend (476 total / 475 passing / one real-MySQL integration skipped). Tests, capture tools, the browser and detector were not rerun for this documentation. The evidence note's older (475 / 474) backend counts, (449ms) build and old-8081 statement remain historical snapshots; the newer handoff supersedes them.

Latest runtime supplied to this documenter: agent-owned local 8081 (PID98154, JAR prefix `865f860f0f274501`), teaching disabled, no actual schema migration or real teaching grants; original user-owned 8080 (PID44559) preserved. This does not establish production deployment, actual MySQL migration/backups, real course-account mapping, school authorization policy, scheduler acceptance or 10000-user load capacity. Runtime and application test facts are attributed handoff evidence, not checks performed by this documenter.

### Incumbent comparison, drift and file preservation

The implementation fits the incumbent palette, system typography, white pane, four-entry navigation, soft controls, native fields, visible focus and reduced-motion scope. It adds local continuation/read-model composition but no shared token or component standard. `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` therefore remain byte-identical in this handoff; only the timetable surface brief append and this local note are written. No application code, progress document or memory is changed by this pass.

Pre-existing narrative drift is reported without repair. Current `DESIGN.md` Overview and sidecar `narrative.overview` both retain the dated 2026-10-11 fix/pending-mobile-recapture account and historical private-image wording, without this unified flow's later bounded evidence. The surface brief's older consistency paragraph says the sidecar had no browser screenshots; that description no longer matches the current sidecar and is itself historical drift. The current 2026-10-14 contract and scoped evidence govern this extension. This local documentation check is neither a full global drift audit nor a whole-system launch verdict.
