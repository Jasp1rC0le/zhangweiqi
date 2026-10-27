<script setup>
import CampMark from '@/components/CampMark.vue'
import LegalNotice from '@/components/LegalNotice.vue'
import { PRIVACY_POLICY_VERSION, PRIVACY_CONTACT, serviceProviders } from '@/utils/privacyPolicy'
const operator=String(import.meta.env.VITE_PUBLIC_OPERATOR||'河北从简科技有限公司').trim()
</script>
<template>
 <main class="privacy-page"><header><RouterLink to="/login"><CampMark/> Campthink.</RouterLink><span>透明 · 安全 · 自主</span></header><article>
 <h1>隐私与使用规则</h1><p class="lead">版本 {{PRIVACY_POLICY_VERSION}} · 2026年10月27日生效</p>
 <aside class="policy-status"><strong>{{operator}}</strong><p>运营与隐私联系：<a :href="`mailto:${PRIVACY_CONTACT}`">{{PRIVACY_CONTACT}}</a></p></aside>
 <nav class="policy-nav" aria-label="隐私说明目录"><a href="#providers">第三方服务</a><a href="#retention">保存与删除</a><a href="#rights">行使权利</a><a href="#service-terms">使用规则</a></nav>
 <section><h2>适用范围</h2><p>本说明适用于 campthink.cn。Campthink 是独立运营的校园学习辅助工具，不代表天津中德应用技术大学官方，不提供学校身份或教务认证。公开校园资料按来源展示，不能替代学校最新通知。</p></section>
 <section><h2>账号、对话与可选资料</h2><p>为提供登录、私有对话、资料管理和安全保护，我们处理用户名、密码的单向哈希、学校分类、昵称、你主动提交的内容及模型用量。专业、年级、技能等可选资料可留空或修改。密码不以明文保存。申请绑定邮箱或找回账号时处理邮箱和限时验证记录；登录使用必要的会话与安全 Cookie。访问和安全日志可能记录网络地址、时间、请求路径和响应状态，不记录聊天正文或登录凭据。使用语音输入时，还可能适用浏览器或系统语音服务的处理规则，你可以改用键盘输入。</p></section>
 <section><h2>AI 与课表</h2><p>点击发送或主动启动 AI 功能后，必要的提问、当前对话上下文、选用资料及可选个性化字段会交给所选服务商处理。已授权课表查询可传递必要的课程名、任课教师、日期、时间和地点，不自动传递学号、学生名单、成绩或考勤。AI 不获得数据库任意查询或授予角色的权限。</p><p>选择课表截图即由本站后台本地 OCR 识别并自动保存课程，按已配置作息对应钟点和节次，不向大模型发送截图。只保存明确周次，识别不完整或版本冲突时拒绝写入；同周更新保留其他周。文字可能识别错误，可在个人安排中修改。临时图片及识别输出在任务结束时清除，已有旧原件的保存/下载为独立功能。不会代存教务密码或自动登录学校系统。</p></section>
 <section><h2>文件、项目与定向审阅</h2><p>浏览器本地提取文件内容不等于将其发送给 AI。主动保存项目时上传选用的材料和文本；选择保留原件时，原文件保存在账号私有库。只有你明确选用为本次问答的内容才会进入相应 AI 请求。项目不自动公开或加入知识库，最近最多保留50个保存版本。</p><p>发起定向审阅会向指定同校账号提供选定版本和勾选内容的7天只读快照，不分享私人备注及其他版本。到期立即停止接口访问，清理任务恢复运行后删除过期副本；撤销无法收回对方已经复制的内容。请勿上传未经授权的试题、名单或他人材料。</p></section>
 <section><h2>校园墙、评分与身份</h2><p>校园墙主题、回复、点赞与举报关联账号及学校分类；内容审核后同校可见，学校分类不等于真实学籍验证。页面不公开作者账号，但不是无法追溯的匿名服务。可撤回内容或举报不当信息，内容不自动进入 AI 知识库。商家评分按已核实商家展示，评论可审核；点赞不改变星级。教师及管理权限由服务器按批准范围核验，不按姓名认领身份，也不因为注册选择角色就开通学校数据权限。</p></section>
 <section id="providers"><h2>第三方服务与传输</h2><dl class="provider-list"><template v-for="provider in serviceProviders" :key="provider.name"><dt>{{provider.name}}</dt><dd>{{provider.purpose}}。{{provider.state}}<a v-if="provider.url" :href="provider.url" target="_blank" rel="noopener noreferrer">服务商说明</a></dd></template></dl><p>本站业务服务与数据库部署于腾讯云北京地区。各 AI 服务商的处理、存储和留存适用其官方条款，不承诺第三方零留存或永不用于训练。当前没有自行启用境外模型、联网搜索、向量检索或重排；改变供应商、处理目的或涉及适用的跨境处理时，另行告知并履行相应程序。</p></section>
 <section id="retention"><h2>保存、删除与备份</h2><ul><li>账号、对话、项目、课表及主动保存的材料在提供服务期间保存，可使用相应删除/注销入口；原件删除还涉及文件清理任务。</li><li>项目最多50个版本，定向审阅快照7天。邮件验证链接30分钟、找回链接20分钟；到期即失效。</li><li>限流记录超过2天、过期验证记录超过2天、到期或撤销会话超过7天由安全清理任务处理，停机可能延后。</li><li>安全访问日志按6个月保留并轮转清理；应用运行日志30天。日志不用于营销，涉及调查或法定保留要求时仅在必要范围延长。</li><li>常规加密数据库备份保留最近7天。发布前的回滚快照单独保留30天。备份不是日常可访问业务库，删除不会立即擦除所有备份；恢复时先保持隔离并核对删除请求，不直接公开旧数据。</li></ul></section>
 <section id="rights"><h2>你的选择与权利</h2><p>可在个人信息中查阅、导出、修改资料、管理会话或申请注销，在对应页面删除对话、项目、原件、课表、评分或墙内容。可以不填写可选字段、不绑定邮箱或不启用分享；不绑定邮箱会影响邮件找回。共享材料、已被他人复制的信息和适用保留记录不能保证立即全部收回。</p><p>无法自助处理时，通过站内“提交意见”或上述隐私邮箱提出查阅、复制、更正、删除、撤回授权或投诉请求。运营方在核验必要信息后7个工作日内首次响应，复杂请求说明所需时间。不要发送密码、完整身份证或银行卡。</p><p>临时草稿默认关闭。开启后在本标签页非加密会话存储中保留最多30分钟文字，不包含附件或登录凭据；公共设备勿开，不应依赖关闭标签页自动清理。</p></section>
 <section><h2>未成年人及安全事件</h2><p>服务面向高校学习场景，不提供面向未满14周岁用户的专门服务。发现儿童个人信息或无权处理的材料时停止相关处理，并依法通过监护人等适当渠道处理。发生可能影响权益的安全事件时，由运营方采取处置并按适用要求通知与报告。</p></section>
 <section id="service-terms"><h2>免费版使用规则</h2><p>AI 仅辅助理解和整理，可能错误、过时或遗漏；学校事务以正式通知为准，仪器操作以原厂说明和现场规程为准。禁止上传无权处理的试题或个人材料，禁止骚扰、侵权、诈骗、危险指导、刷分或绕过安全措施。明显隐私过滤不能覆盖所有情况，发布前应自行检查。</p><p>使用受账号额度及平台预算限制；失败请求也可能产生供应商用量。当前不向用户扣款，Pro未开放购买或自动续费。服务重要变更会发布更新说明，涉及额外处理时取得所需同意；拒绝可选处理不影响不依赖它的基本功能。法律要求留存的信息仅在对应目的和期限内处理。</p></section>
 <RouterLink to="/login" class="back">返回网站</RouterLink></article><LegalNotice/></main>
</template>
<style scoped>
.privacy-page { min-height: 100svh; background: #fafbfc; color: #20242a; }
header { height: 74px; border-bottom: 1px solid #e8eaed; display: flex; justify-content: space-between; align-items: center; padding: 0 max(24px, calc((100vw - 880px)/2)); font-size: 14px; color: #747b85; }
header a { color: #20242a; font-size: 18px; font-weight: 700; text-decoration: none; }
article { max-width: 760px; margin: auto; padding: 72px 24px 110px; }
h1 { font-size: clamp(40px, 7vw, 68px); letter-spacing: -.04em; margin: 16px 0; }
.lead { color: #69727e; font-size: 18px; line-height: 1.7; margin-bottom: 52px; }
section { border-top: 1px solid #e5e9ee; padding: 24px 0 30px; }
h2 { font-size: 23px; margin: 0 0 12px; letter-spacing: -.04em; }
section p { color: #515a67; line-height: 1.9; margin: 0; }
section p + p { margin-top: 16px; }
section { scroll-margin-top: 24px; }
.policy-status { padding: 20px; border: 1px solid #dce2d8; border-radius: 22px; background: #f0f3ed; color: #364435; line-height: 1.8; margin-bottom: 24px; }
.policy-status p { margin: 8px 0 0; }
.policy-nav { display: flex; gap: 12px 24px; flex-wrap: wrap; margin-bottom: 36px; }
.policy-nav a { padding-block: 10px; }
.provider-list dt { margin-top: 24px; font-weight: 650; }
.provider-list dd { margin: 8px 0; color: #515a67; line-height: 1.9; }
.provider-list a { display: block; width: fit-content; }
li { line-height: 1.9; margin-block: 10px; color: #515a67; }
article { overflow-wrap: anywhere; font-size: 16px; }
a { text-underline-offset: 4px; }
a:focus-visible { outline: 2px solid #3348de; outline-offset: 4px; border-radius: 4px; }
@media (max-width: 600px) { header { padding: 16px 20px; height: auto; gap: 12px; flex-wrap: wrap; } article { padding: 36px 20px 70px; } }
a { color: #356db8; }
.back { display: inline-block; margin-top: 28px; text-decoration: none; }
</style>
