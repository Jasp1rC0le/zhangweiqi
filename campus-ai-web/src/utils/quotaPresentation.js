// Quota rights come only from the authenticated quota response, not local profile data.
export function quotaPresentation(quota) {
  if (!quota) return null
  if (quota.unit !== 'tokens') return { label: '额度系统待更新', hint: '后端仍是旧版次数额度，请同步更新服务端' }
  const format = (value) => Number(value).toLocaleString('zh-CN')
  if (quota.unlimited === true) {
    return {
      label: '管理员测试不限额',
      hint: `不设每日 Token 上限，今日已用 ${format(quota.used)} Token（含进行中的预留）；仍遵循已配置的限流、并发与全站费用保护规则`,
    }
  }
  if (!Number.isFinite(quota.limit) || !Number.isFinite(quota.remaining)) {
    return { label: '额度暂不可用', hint: '额度数据不完整，请刷新后重试' }
  }
  return { label: `今日剩余 ${format(quota.remaining)} / ${format(quota.limit)} Token`, hint: '每日 00:00（北京时间）恢复' }
}
