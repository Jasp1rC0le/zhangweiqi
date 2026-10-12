<script setup>
import CampMark from '@/components/CampMark.vue'
import LegalNotice from '@/components/LegalNotice.vue'
import { PRIVACY_POLICY_VERSION, PRIVACY_CONTACT, serviceProviders } from '@/utils/privacyPolicy'
const operator = String(import.meta.env.VITE_PUBLIC_OPERATOR || '').trim()
</script>

<template>
  <main class="privacy-page">
    <header><RouterLink to="/login"><CampMark /> Campthink.</RouterLink><span>透明 · 安全 · 自主</span></header>
    <article>
      <h1>信任，<br /><em>从透明开始</em></h1>
      <p class="lead">隐私说明与使用规则 · 版本 {{ PRIVACY_POLICY_VERSION }}<br />下面说明真实的数据处理方式、控制入口及尚未完成的上线条件</p>
      <aside class="policy-status" role="note"><strong>公开发布前待确认</strong><p>运营主体：{{ operator || '新个体工商户尚未确认，不能使用旧公司的名称' }}。当前文本用于内部测试，不代表已完成正式政策审核或备案。实际供应商、日志及备份期限确定后，须更新文本并重新核对同意版本。</p></aside>
      <nav class="policy-nav" aria-label="隐私说明目录"><a href="#providers">第三方服务</a><a href="#retention">保存与删除</a><a href="#rights">行使权利</a><a href="#service-terms">使用规则</a></nav>
      <section><h2>适用范围与运营身份</h2><p>本说明适用于 campthink.cn 的 Campthink 网站。Campthink 是独立开发的学习辅助工具，不代表天津中德应用技术大学官方，不以学校名义提供教务认证。学校官网公开信息仅作为注明来源的参考资料。隐私联系邮箱为 <a :href="`mailto:${PRIVACY_CONTACT}`">{{ PRIVACY_CONTACT }}</a>；该邮箱的真实收发联调仍是上线验收条件。</p></section>
      <section><h2>我们处理什么</h2><p>注册与使用时，我们保存用户名、密码的单向哈希、学校、昵称、聊天记录、反馈、用户提交的资料和模型使用记录。你可自愿填写专业、年级、技能、发展方向和补充说明，也可留空或随时修改。你主动申请绑定邮箱时，待验证邮箱会暂存于限时验证记录；验证成功后保存为找回邮箱。登录安全记录还会保存账号和 IP 生成的摘要及时间。</p></section>
      <section><h2>用于什么</h2><p>这些信息用于登录、找回密码、提供校园问答、改进资料质量、防止滥用和统计模型成本。自愿填写的个性化资料只用于调整解释深度、例子和建议，不会作为校园事实来源。回答时，必要的提问内容和个性化字段可能发送给所选模型服务；需要联网检索时，检索问题可能发送给搜索服务。请勿输入身份证号、银行卡号等不必要的敏感信息。</p></section>
      <section><h2>选择与控制</h2><p>在“个人信息”中可下载当前系统保存的个人资料，或通过密码申请注销账户。已发布的校园公共资料可能继续保留；其中如含个人信息，请通过站内“提交意见”提出处理请求。正式上线前还需核定数据导出范围、服务器日志与备份清理期限。</p></section>
      <section><h2>私有项目材料</h2><p>项目工作台保存你主动提交的任务要求、材料文本、CSV数据、清单、证据、本人备注和最近50个保存版本。附件导入先在浏览器读取，点击保存才会上传提取文字至项目服务；数据检查、版本对比和答辩提纲不向模型发送材料，也不加入公共知识库。你可以导出当前草稿，载入保留版本或删除项目。删除项目或注销账户会移除数据库中的项目和版本，服务器备份的清理周期仍需在正式上线前明确。教师的未公开试题、学生名单、评审材料等也不应在未获授权时上传。</p></section>
      <section><h2>附件解析与定向审阅</h2><p>PDF、DOCX、XLSX和纯文本在浏览器本地限时解析，原始附件不上传；你确认提取结果并保存项目后才上传相应文字。我们不运行附件宏或脚本，不自动发送内容给模型。你主动发起定向审阅时，所选已保存版本中的任务要求和清单，以及你另行勾选的正文/证据、数据表，会保存为7天只读快照，仅项目所有者和指定的同校账号可访问。个人备注、本人复核理由和其他版本不分享。对方的审阅意见会返回给你。</p><p>到期即停止接口访问，后台每小时清除已到期的共享材料副本与意见；服务停机时顺延到恢复后的清理任务。撤销会立即清除该邀请保存的快照与意见。邀请标题、参与账号及时间等记录随项目删除或相关账号注销清理，原项目不受快照到期影响。已经被接收者阅读、复制的内容无法收回，备份删除仍按待确认的保留期限处理。请勿分享未经授权的试题、名单和他人私有材料。</p></section>
      <section><h2>反馈与安全记录</h2><p>登录后提交意见会关联本人账号及学校，可随个人资料导出和注销处理，只有该校授权管理员可查看。访客意见仅在运营配置接收学校后开放，不会自动关联账号；如需查阅或删除，请通过官方邮箱核验提交信息。旧版未关联账号的反馈也需通过该渠道处理，不会按昵称猜测归属。</p><p>登录、找回、注册与反馈的限流记录保存账号或网络地址的摘要及计数，摘要不等于匿名信息。每天清理超过2天的限流记录、到期超过2天的验证记录，以及到期或撤销超过7天的会话。后台停机期间清理会延后；这些期限不代表服务器日志、备份或第三方服务的期限，后者仍待运营核定。</p></section>
      <section><h2>会话与访问权限</h2><p>普通使用和后台管理共用登录会话，后台仍由服务器核验管理员权限。你可在“个人信息”查看有效会话的创建时间与到期时间，并退出其他会话。系统不为了该功能采集设备指纹，也不显示推测的地点。后台管理员身份不自动赋予读取其他用户私有项目的权限。</p></section>
      <section><h2>外部页面与图片</h2><p>聊天回答中的外部图片和媒体不会自动加载，避免仅查看回答就向第三方发出访问请求。你主动点击来源链接后，将进入对方网站并适用其数据处理规则。我们不会把你的论文自动上传到查重网站，也不会代存学校预约系统的密码。</p></section>
      <section><h2>校园墙</h2><p>主题、回复、点赞与举报关联账号，按账号绑定学校隔离；这不等同于已验证真实学籍。主题和回复先审核后显示，未通过的内容只对作者及授权管理员可见。页面不显示作者真实姓名或账号编号，但不是无法追溯的匿名服务。手机号、邮箱和明显证件号会被基础规则拦截，这不能覆盖所有隐私。请勿公开他人身份、联系方式、未经授权的试题或危险操作指导。</p><p>内容不自动成为 AI 知识、不用于训练。作者可以撤回主题及其回复，或单独撤回自己的回复；可取消点赞、举报内容，导出自己的发布、点赞与举报记录。注销账号会级联删除相关数据库记录；他人已经看到或复制的内容无法收回，备份期限仍待正式确认。写入限流短暂保存账号编号和一分钟计数，不采集设备指纹。</p></section>
      <section><h2>实验与作业辅导</h2><p>点击“帮我理清下一步”并确认后，本页课程、题目、卡点与尝试过程会发送至服务器和当前 AI 服务，形成私有对话并计入用量。材料不会自动进入校园墙或公共知识库。保存为项目是另一项主动操作。仪器目录仅为原厂资料索引及学习提示，实际操作以具体型号说明书和现场教师规程为准，不自动上传你的设备记录。</p></section>
      <section><h2>服务原则</h2><p>当前测试版未接入广告，也不出售用户数据；未来如引入广告或付费能力，应先公布相应规则和隐私变更，广告不得混入评分或 AI 事实回答。联系邮箱：<a href="mailto:contact@campthinkhub.cn">contact@campthinkhub.cn</a>。站内“提交意见”会进入管理员后台。</p></section>
      <section><h2>食堂评分与短评</h2><p>评分、短评和点赞与账号关联，用于一账号一票和内容审核；公开列表不展示用户名、账号ID或点赞者名单。短评审核通过后公开，修改文字后重新审核并清除原点赞。神评依据公开短评的点赞数选取，不由模型生成。评分和点赞不发送给模型。手机号、邮箱等明显敏感信息会被规则拦截，但这不能识别所有隐私，请勿填写他人个人信息。</p><p>你可修改评分、清空短评后保存以删除自己的短评、取消点赞，也可在个人资料导出中下载自己的评价及点赞记录。注销账户会级联删除这些记录；备份清理期限仍待正式上线前明确。食堂写入频率控制仅临时保留账号ID和一分钟计数，不为此采集IP或设备指纹。</p></section>
      <section id="providers"><h2>第三方服务与对外传输</h2><p>下表是本次免费首发的配置范围，不是所有服务已经启用的声明。启用其他供应商、联网搜索或改变处理用途前，应补充披露并依法取得所需同意。我们不承诺第三方永不留存或永不用于训练；以核实后的适用合同、政策及账号设置为准。</p><dl class="provider-list"><template v-for="provider in serviceProviders" :key="provider.name"><dt>{{ provider.name }}</dt><dd>{{ provider.purpose }}。{{ provider.state }}<a v-if="provider.url" :href="provider.url" target="_blank" rel="noopener noreferrer">查看服务商说明</a></dd></template></dl><p>免费配置关闭联网检索、向量检索和重排。原始项目附件在浏览器解析，只有主动保存的提取文本进入项目服务；私有项目不是自动训练数据。当前未确认境外处理安排，不以“国内服务器”推导所有第三方都不会跨境处理；若需跨境处理，应先完成适用程序及告知。</p></section>
      <section id="retention"><h2>保存、删除与恢复边界</h2><ul><li>账号资料、对话和私有项目为持续使用而保存；可在对应页面删除，或通过注销移除相关业务数据库记录</li><li>项目最多保留最近 50 个保存版本；定向审阅快照有效期 7 天，到期不可访问并由定时任务清理</li><li>邮箱验证链接 30 分钟、找回密码链接 20 分钟有效；安全记录的清理周期见上文，服务停机可能延后执行</li><li>平台预算账本不含提问正文、账号编号、邮箱或 IP，仅含供应商、模型、时间及成本数据</li><li>生产日志和加密备份的实际保留期限尚未确定，不能声称注销立即擦除全部历史备份。恢复备份后须重放删除记录或核对删除请求，未核对前不得开放恢复库</li></ul><p>法律要求留存的记录仅在对应目的和期限内处理，不用于营销；具体生产保留规则确认后将明确公布。</p></section>
      <section id="rights"><h2>查阅、更正与投诉</h2><p>个人资料和有效会话在“个人信息”管理；资料导出与注销在同页；对话、项目、评价和校园墙内容可通过各自入口删除或撤回。你可以不填写个性化资料、不绑定邮箱、不分享项目。未绑定邮箱将无法使用邮件找回，但不影响不依赖邮箱的功能。</p><p>无法自助处理时，通过站内“提交意见”或上述邮箱提出查阅、复制、更正、删除、撤回授权或投诉请求。请说明账号及请求，不要发送密码、完整身份证或银行卡。运营方应采用必要范围的身份核验；实际响应时限和责任人须在公开运营前落实。主体变更时应告知接收方及处理规则，不能把个转企视作无需通知的数据转移。</p></section>
      <section><h2>未成年人和安全事件</h2><p>本产品面向高校学习场景，暂不提供面向未满 14 周岁用户的专门服务。发现涉及儿童个人信息时应停止相关处理，并通过监护人依法处理删除等请求；不为此额外收集身份证照片。发生可能影响个人权益的信息泄露等事件时，应采取处置措施，并按适用要求通知受影响用户、报告主管部门。公开运营前须落实值守与响应流程。</p></section>
      <section id="service-terms"><h2>免费版使用规则</h2><p>问答、实验和项目工具仅辅助理解与整理，不替代教师指导、设备安全规程或独立学术判断。不得上传无权处理的试题、个人名单或侵权材料，不得利用服务骚扰、违法传播、刷分或绕过安全措施。仪器操作必须核对具体型号并遵守现场教师要求。</p><p>AI 内容可能错误、过时或遗漏，应核对来源和计算，遵守课程及竞赛对 AI 使用的要求。额度依账号及平台预算共同限制；失败请求可能产生供应商费用，但当前不会向你扣款。Pro 尚未开放购买，不提供自动扣款，不将会员身份与食堂评分排序绑定。校园墙内容先审核后公开，不因发表即成为官方事实。</p><p>使用规则和隐私处理有重要变化时，应发布新版说明；涉及处理目的、方式或数据种类变更的，应依法重新征得同意。拒绝额外可选处理不应影响不依赖该处理的基本功能。</p></section>
      <RouterLink to="/login" class="back">← 返回网站</RouterLink>
    </article>
    <LegalNotice />
  </main>
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
