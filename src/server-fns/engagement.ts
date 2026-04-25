import { createServerFn } from '@tanstack/react-start'
import { getDb } from '~/lib/db'

export const addEngagement = createServerFn({ method: 'POST' })
  .inputValidator((data: { articleUrl: string; eventType: 'click' | 'like' }) => data)
  .handler(({ data }) => {
    const db = getDb()
    const { articleUrl, eventType } = data

    db.prepare('INSERT INTO engagement (article_url, event_type, timestamp) VALUES (?, ?, ?)').run(
      articleUrl,
      eventType,
      new Date().toISOString()
    )

    return { ok: true }
  })

export const addClick = createServerFn({ method: 'POST' })
  .inputValidator((data: { articleUrl: string }) => data)
  .handler(({ data }) => addEngagement({ data: { articleUrl: data.articleUrl, eventType: 'click' } }))

export const addLike = createServerFn({ method: 'POST' })
  .inputValidator((data: { articleUrl: string }) => data)
  .handler(({ data }) => addEngagement({ data: { articleUrl: data.articleUrl, eventType: 'like' } }))