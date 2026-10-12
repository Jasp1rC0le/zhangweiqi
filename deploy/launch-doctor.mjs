// Read-only public diagnostics. No login, DNS mutation, certificate issuance, mail sending or scanning.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const site = process.argv[2] || 'campthink.cn'
const mailDomain = process.argv[3] || 'campthinkhub.cn'
for (const host of [site, mailDomain]) {
  if (!/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(host)) throw new Error('请填写域名，不含协议、路径、端口或凭据')
}
const checks = []
async function query(host, type) {
  try {
    const { stdout } = await exec('curl', ['--fail', '--silent', '--show-error', '--connect-timeout', '5', '--max-time', '12',
      `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${type}`], { timeout: 15000, maxBuffer: 200000 })
    const data = JSON.parse(stdout)
    if (![0, 3].includes(data.Status)) return null
    return (data.Answer || []).filter(item => item.type === { A: 1, AAAA: 28, MX: 15, TXT: 16 }[type]).map(item => item.data)
  } catch { return null }
}
const [a, aaaa, mx, txt, dmarc] = await Promise.all([query(site, 'A'), query(site, 'AAAA'), query(mailDomain, 'MX'), query(mailDomain, 'TXT'), query(`_dmarc.${mailDomain}`, 'TXT')])
checks.push({ check: '域名地址', state: a === null || aaaa === null ? 'UNKNOWN' : a.length || aaaa.length ? 'PASS' : 'BLOCKED', a, aaaa,
  note: '公共递归解析器的当前观测；需与腾讯云控制台和实际服务器 IP 再核对，不能据此证明备案或域名所有权' })
checks.push({ check: '邮件接收 MX', state: mx === null ? 'UNKNOWN' : mx.length ? 'PASS' : 'BLOCKED', records: mx, note: 'MX 存在不证明邮箱已开通或已收发成功' })
checks.push({ check: '邮件 SPF', state: txt === null ? 'UNKNOWN' : txt.some(value => /v=spf1/i.test(value)) ? 'PRESENT_REVIEW' : 'MISSING', note: '这里只检测是否存在，不验证授权范围；由实际发信服务商给出唯一 SPF 策略' })
checks.push({ check: '邮件 DMARC', state: dmarc === null ? 'UNKNOWN' : dmarc.some(value => /v=DMARC1/i.test(value)) ? 'PRESENT_REVIEW' : 'MISSING', note: '应先核对 SPF/DKIM 对齐，再决定策略；不猜测 DKIM selector' })
try {
  const { stdout } = await exec('curl', ['--head', '--silent', '--show-error', '--fail', '--connect-timeout', '5', '--max-time', '12', `https://${site}/`], { timeout: 15000, maxBuffer: 100000 })
  const statuses = [...stdout.matchAll(/^HTTP\/\S+\s+(\d+)/gm)].map(match => Number(match[1]))
  const status = statuses.at(-1)
  checks.push({ check: 'HTTPS 首页', state: status >= 200 && status < 400 ? 'PASS' : 'REVIEW', status,
    hsts: /strict-transport-security:/i.test(stdout), csp: /content-security-policy:/i.test(stdout),
    note: '未绕过证书校验；成功响应仍不等于业务、证书续期和备案均通过' })
} catch { checks.push({ check: 'HTTPS 首页', state: 'UNVERIFIED', note: '未取得可信成功响应，可能涉及 DNS、代理、网络、证书或源站；不能单凭此结果定位根因' }) }
checks.push({ check: '真实账号、邮件、账单、异地恢复与备案', state: 'MANUAL_REQUIRED', note: '该只读工具不拥有业务账户、云控制台或异地存储授权，不能代替这些验收' })
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), site, mailDomain, checks, publicLaunchApproved: false }, null, 2))
if (checks.some(check => ['BLOCKED', 'UNKNOWN', 'MISSING', 'UNVERIFIED'].includes(check.state))) process.exitCode = 1
