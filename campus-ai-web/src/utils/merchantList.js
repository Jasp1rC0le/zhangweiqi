const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

/** Ranking belongs to this read, so a successful vote never relocates its card. */
export function snapshotMerchantRanking(merchants) {
  return new Map(merchants.map((merchant, index) => [merchant.id, {
    ratingCount: Math.max(0, number(merchant.ratingCount)),
    averageScore: number(merchant.averageScore),
    index,
  }]))
}

/** Sort a copy; never reorder the API result or invent scores for unrated shops. */
export function selectMerchants(merchants, { canteen = 'all', query = '', sort = 'popular', ranking } = {}) {
  const term = query.trim().toLocaleLowerCase()
  const result = merchants.filter((merchant) =>
    (canteen === 'all' || merchant.canteenId === canteen)
    && (!term || [merchant.name, merchant.canteenName, merchant.description]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(term)))
  if (['default', 'popular', 'rating'].includes(sort)) result.sort((a, b) => {
    if (ranking) {
      const known = Number(ranking.has(b.id)) - Number(ranking.has(a.id))
      if (known) return known
      if (!ranking.has(a.id)) return 0
    }
    const left = ranking?.get(a.id) || a, right = ranking?.get(b.id) || b
    const leftCount = Math.max(0, number(left.ratingCount)), rightCount = Math.max(0, number(right.ratingCount))
    const score = (rightCount ? number(right.averageScore) : 0) - (leftCount ? number(left.averageScore) : 0)
    const tie = ranking ? left.index - right.index : 0
    return sort === 'rating'
      ? Number(rightCount > 0) - Number(leftCount > 0) || score || rightCount - leftCount || tie
      : rightCount - leftCount || score || tie
  })
  return result
}
