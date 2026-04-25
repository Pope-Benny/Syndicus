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

    const result = await fetchFeed(url)
    const title = result.title || 'Unknown Feed'

    db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(url, title)

    return { ok: true, title }
  })

export const removeFeed = createServerFn({ method: 'DELETE' })
  .inputValidator((data: { id: number }) => data)
  .handler(({ data }) => {
    const db = getDb()
    db.prepare('DELETE FROM feeds WHERE id = ?').run(data.id)
    return { ok: true }
  })