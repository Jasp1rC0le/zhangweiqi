/** Development-only in-memory examples, never imported by the production app. */
export function createCanteenFixture() {
  const canteens = [
    { id: 1, name: '第一食堂', status: 'PUBLISHED' },
    { id: 2, name: '第二食堂', status: 'PUBLISHED' },
  ]
  const shops = [
    {
      id: 1,
      canteenId: 1,
      name: '一碗热面',
      location: '一层 · 08 窗口',
      description: '热汤手擀面 · 清淡与重口都照顾',
      demoArt: 'noodle',
      scores: [5, 5, 5, 5, 4, 4, 5, 4, 5, 5],
    },
    {
      id: 2,
      canteenId: 1,
      name: '好好吃饭',
      location: '一层 · 12 窗口',
      description: '家常小炒 · 每天换着花样吃',
      demoArt: 'rice',
      scores: [5, 4, 4, 5, 4, 4, 5, 4],
    },
    {
      id: 3,
      canteenId: 2,
      name: '饺子有约',
      location: '二层 · 03 窗口',
      description: '现包水饺 · 一口一个小满足',
      demoArt: 'dumpling',
      scores: [4, 5, 4, 5, 5],
    },
    {
      id: 4,
      canteenId: 2,
      name: '晚课后的那碗面',
      location: '一层 · 06 窗口',
      description: '番茄鸡蛋面 · 热乎、管饱',
      demoArt: 'noodle',
      scores: [4, 3, 4, 4, 5],
      operatingStatus: 'CLOSED',
    },
    {
      id: 5,
      canteenId: 2,
      name: '新开的煲仔饭',
      location: '二层 · 09 窗口',
      description: '新店样例 · 等你留下第一份体验',
      demoArt: 'rice',
      scores: [],
    },
  ]
  const reviews = [
    {
      id: 11,
      merchantId: 1,
      comment: '这碗面没有早八，但它能把我从床上叫起来',
      score: 5,
      likes: 18,
    },
    { id: 12, merchantId: 1, comment: '汤喝完了，才想起来本来是来吃面的', score: 4, likes: 7 },
    { id: 21, merchantId: 2, comment: '阿姨的手不抖，我的筷子停不了', score: 5, likes: 15 },
    { id: 31, merchantId: 3, comment: '本来只想吃六个，后来决定六六大顺', score: 5, likes: 12 },
    { id: 41, merchantId: 4, comment: '一天可以没有灵感，但不能没有这口热汤', score: 4, likes: 4 },
  ].map((item) => ({ ...item, mine: false, status: 'PUBLISHED', liked: false }))
  let nextId = 100
  const error = (message) => {
    throw Object.assign(new Error(message), { response: { data: { message } } })
  }
  function list() {
    return shops
      .map((shop) => {
        const scores = [...shop.scores, ...(shop.myScore ? [shop.myScore] : [])]
        const published = reviews
          .filter((r) => r.merchantId === shop.id && r.status === 'PUBLISHED')
          .sort((a, b) => b.likes - a.likes || b.id - a.id)
        const { scores: _scores, ...publicShop } = shop
        return {
          ...publicShop,
          canteenName: canteens.find((c) => c.id === shop.canteenId).name,
          hasPhoto: false,
          operatingStatus: shop.operatingStatus || 'UNKNOWN',
          ratingCount: scores.length,
          averageScore: scores.length
            ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
            : null,
          myScore: shop.myScore || null,
          reviewCount: published.length,
          featuredReview: published[0] ? { ...published[0] } : null,
          weight: scores.length
            ? (scores.reduce((a, b) => a + b, 0) + 17.5) / (scores.length + 5)
            : 0,
        }
      })
      .sort((a, b) => b.weight - a.weight || b.ratingCount - a.ratingCount || a.id - b.id)
  }
  const reviewList = (id) =>
    reviews
      .filter((r) => r.merchantId === id && (r.status === 'PUBLISHED' || r.mine))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || b.likes - a.likes || b.id - a.id)
      .slice(0, 20)
      .map((r) => ({ ...r }))
  return {
    approveMine() {
      for (const review of reviews) if (review.mine) review.status = 'PUBLISHED'
    },
    async adapter(config) {
      let data
      const method = (config.method || 'get').toLowerCase()
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {}
      const match = config.url.match(
        /^\/api\/canteens\/merchants\/(\d+)\/(rating|reviews)(?:\/(\d+)\/like)?$/,
      )
      if (method === 'get' && config.url === '/api/canteens') data = canteens
      else if (method === 'get' && config.url === '/api/canteens/merchants') data = list()
      else if (match) {
        const id = Number(match[1])
        const shop = shops.find((s) => s.id === id)
        if (!shop) error('商家不存在')
        if (method === 'get' && match[2] === 'reviews' && !match[3]) data = reviewList(id)
        else if (method === 'put' && match[2] === 'rating') {
          if (!Number.isInteger(body.score) || body.score < 1 || body.score > 5)
            error('评分须为1到5分')
          const comment =
            body.comment == null
              ? null
              : body.comment
                  .replace(/[\p{Cf}]/gu, '')
                  .replace(/\s+/g, ' ')
                  .trim()
          if (comment?.length > 500) error('短评不能超过500字')
          if (
            comment &&
            /(?<!\d)1[3-9]\d{9}(?!\d)|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?<!\d)\d{17}[\dXx](?!\d)/.test(
              comment.normalize('NFKC'),
            )
          )
            error('请移除手机号、邮箱或身份证号后再提交短评')
          shop.myScore = body.score
          const existing = reviews.find((r) => r.merchantId === id && r.mine)
          if (existing) existing.score = body.score
          if (comment !== null) {
            if (!comment && existing) reviews.splice(reviews.indexOf(existing), 1)
            else if (comment && existing && comment !== existing.comment)
              Object.assign(existing, { comment, status: 'PENDING', likes: 0, liked: false })
            else if (comment && !existing)
              reviews.push({
                id: nextId++,
                merchantId: id,
                score: body.score,
                comment,
                status: 'PENDING',
                mine: true,
                likes: 0,
                liked: false,
              })
          }
          data = list()
        } else if (method === 'put' && match[3]) {
          const review = reviews.find(
            (r) => r.id === Number(match[3]) && r.merchantId === id && r.status === 'PUBLISHED',
          )
          if (!review) error('短评不存在或未公开')
          if (review.mine) error('不能为自己的短评点赞')
          if (typeof body.liked !== 'boolean') error('点赞参数不正确')
          if (review.liked !== body.liked) review.likes += body.liked ? 1 : -1
          review.liked = body.liked
          data = reviewList(id)
        } else error('未实现的演示操作')
      } else error('演示不访问真实服务')
      return { data: structuredClone(data), status: 200, statusText: 'OK', headers: {}, config }
    },
  }
}
