// Keep in sync with PrivacyPolicyVersion.CURRENT; checked by the release tests.
export const PRIVACY_POLICY_VERSION = '2026-10-04'
export const PRIVACY_CONTACT = 'contact@campthinkhub.cn'
export const serviceProviders = [
  { name: '腾讯云', purpose: '拟部署的北京服务器与数据库；承载你主动保存的数据', state: '部署地区由运营确认；云账号、合同及备份目的地仍须核实', url: 'https://cloud.tencent.com/document/product/301/11470' },
  { name: 'DeepSeek / 杭州深度求索人工智能基础技术研究有限公司及关联公司', purpose: '启用问答时处理必要的提问、对话上下文及选用的资料', state: '仅点击发送后调用；服务条款不能被本站的承诺替代', url: 'https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html' },
  { name: 'Kimi、GLM', purpose: '分别为论文、代码模式的候选模型服务', state: '须配置密钥、核实价格及处理条款后开放；未配置不调用', url: null },
  { name: '邮件服务商', purpose: '处理你申请验证或找回时的收件地址及一次性操作链接', state: '实际服务商尚待确认；域名邮箱地址不等于发信服务已经开通', url: null },
]
