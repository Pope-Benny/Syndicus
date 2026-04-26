import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/lib/db'
import { fetchFeed } from '~/lib/rss'

export const getFeeds = createServerFn({ method: 'GET' }).handler(() => {
  const db = getDb()
  return db.prepare('SELECT * FROM feeds ORDER BY id').all()
})

export const addFeed = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string }) => data)
  .handler(async ({ data }) => {
    const db = getDb()
    const { url } = data

    const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(url)
    if (existing) {
      return { ok: false, error: 'Feed already exists' }
    }

    try {
      const result = await fetchFeed(url)
      const title = result.title || 'Unknown Feed'

      const insertResult = db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(url, title)

      return { ok: true, feed: { id: insertResult.lastInsertRowid as number, url, title } }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch feed'
      return { ok: false, error: message }
    }
  })

export const removeFeed = createServerFn({ method: 'DELETE' })
  .inputValidator((data: { id: number }) => data)
  .handler(({ data }) => {
    const db = getDb()
    db.prepare('DELETE FROM feeds WHERE id = ?').run(data.id)
    return { ok: true }
  })

export const toggleFeedFavorite = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(({ data }) => {
    const db = getDb()
    const feed = db.prepare('SELECT is_favorite FROM feeds WHERE id = ?').get(data.id) as { is_favorite: number } | undefined
    if (!feed) {
      return { ok: false, error: 'Feed not found' }
    }
    const newValue = feed.is_favorite ? 0 : 1
    db.prepare('UPDATE feeds SET is_favorite = ? WHERE id = ?').run(newValue, data.id)
    return { ok: true, is_favorite: newValue }
  })