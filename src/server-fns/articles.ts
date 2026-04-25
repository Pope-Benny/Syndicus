import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/lib/db'

export const getArticles = createServerFn({ method: 'GET' })
  .inputValidator((data: { limit?: number; offset?: number }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const limit = data?.limit || 50
    const offset = data?.offset || 0

    const articles = db.prepare(`
      SELECT a.*, f.title as feed_title
      FROM articles a
      JOIN feeds f ON a.feed_id = f.id
      WHERE a.ai_score IS NOT NULL
      ORDER BY a.ai_score DESC, a.published DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]

    return articles
  })

export const refreshFeeds = createServerFn({ method: 'POST' }).handler(async () => {
  const { fetchAllFeeds } = await import('~/lib/rss')
  const { scoreAllArticles } = await import('~/lib/ai')

  const count = await fetchAllFeeds()
  await scoreAllArticles()

  return { ok: true, articlesAdded: count }
})