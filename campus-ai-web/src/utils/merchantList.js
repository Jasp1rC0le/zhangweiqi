const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

/** Sort a copy; never reorder the API result or invent scores for unrated shops. */
export function selectMerchants(merchants, { canteen = 'all', query = '', sort = 'default' } = {}) {
  const term = query.trim().toLocaleLowerCase()
  const result = merchants.filter((merchant) =>
    (canteen === 'all' || merchant.canteenId === canteen)
    && (!term || [merchant.name, merchant.canteenName, merchant.description]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(term)))
  if (sort === 'rating') result.sort((a, b) =>
    Number(number(b.ratingCount) > 0) - Number(number(a.ratingCount) > 0)
    || number(b.averageScore) - number(a.averageScore)
    || number(b.ratingCount) - number(a.ratingCount))
  if (sort === 'popular') result.sort((a, b) => number(b.ratingCount) - number(a.ratingCount))
  return result
}
