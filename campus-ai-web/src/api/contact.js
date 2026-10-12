import http from './http'

export async function submitContactMessage(payload, {signal}={}) {
  if (payload.requestId) {
    const {data} = await http.get('/api/contact-messages/capabilities',{signal})
    if (!(data?.requestIdVersion >= 1)) throw Object.assign(new Error('服务端尚未支持反馈防重复提交，请更新后重试；当前内容未发送'),{code:'COMPAT_REQUIRED'})
  }
  const response = await http.post('/api/contact-messages', payload,{signal})
  return response.data
}
