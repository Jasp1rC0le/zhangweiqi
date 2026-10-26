// Only opaque request metadata is persisted, never source documents or credentials.
const KEY = 'campthink.material-pending.v1'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const kinds = ['KNOWLEDGE_SUBMISSION', 'MERCHANT_DRAFT', 'MERCHANT_APPLICATION']
export function createMaterialReceiptStore(storage, namespace = KEY) {
  function read() {
    const raw = storage.getItem(namespace)
    if (!raw) return []
    const rows = JSON.parse(raw)
    if (
      !Array.isArray(rows) ||
      rows.length > 40 ||
      rows.some(
        (r) =>
          !uuid.test(r.id) ||
          !kinds.includes(r.kind) ||
          !/^\d+:\d+$/.test(r.owner) ||
          !Number.isFinite(r.at) ||
          (r.payloadHash !== undefined && !/^[a-f0-9]{64}$/.test(r.payloadHash)),
      )
    )
      throw new Error('本机待确认请求记录异常，请先核对原审核/商家列表。')
    return rows
  }
  return {
    list: (owner) => read().filter((r) => r.owner === owner),
    save(row) {
      const rows = read().filter((r) => !(r.id === row.id && r.owner === row.owner))
      if (rows.length >= 40) throw new Error('待确认请求过多，请先核对之前的提交；没有发送新请求。')
      storage.setItem(namespace, JSON.stringify([...rows, row]))
    },
    remove(owner, id) {
      storage.setItem(
        namespace,
        JSON.stringify(read().filter((r) => !(r.owner === owner && r.id === id))),
      )
    },
  }
}
