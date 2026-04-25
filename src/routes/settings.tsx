import * as React from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useServerFn } from '~/lib/useServerFn'

const getFeeds = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await import('~/lib/db').then(m => m.getDb())
  return db.prepare('SELECT * FROM feeds ORDER BY id').all()
})

const addFeed = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    const { url } = data

    const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(url)
    if (existing) {
      return { ok: false, error: 'Feed already exists' }
    }

    const { fetchFeed } = await import('~/lib/rss')
    const result = await fetchFeed(url)
    const title = result.title || 'Unknown Feed'

    db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(url, title)

    return { ok: true, title }
  })

const removeFeed = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    db.prepare('DELETE FROM articles WHERE feed_id = ?').run(data.id)
    db.prepare('DELETE FROM feeds WHERE id = ?').run(data.id)
    return { ok: true }
  })

const getPreferences = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await import('~/lib/db').then(m => m.getDb())
  return db.prepare('SELECT * FROM preferences WHERE id = 1').get()
})

const updatePreferences = createServerFn({ method: 'POST' })
  .inputValidator((data: { promptText?: string }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    const { promptText } = data

    if (promptText !== undefined) {
      db.prepare('UPDATE preferences SET prompt_text = ? WHERE id = 1').run(promptText)
    }

    return { ok: true }
  })

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
  loader: async ({ context }) => {
    try {
      context.clientFnCache?.clear?.()
      const feeds = await getFeeds({ data: {} })
      const prefs = await getPreferences({ data: {} })
      return { feeds, preferences: prefs }
    } catch (err) {
      console.error('Failed to load settings data:', err)
      return { feeds: [], preferences: { prompt_text: '', dark_mode: 0 } }
    }
  },
})

function SettingsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const handleUpdatePrefs = useServerFn(updatePreferences)
  const handleAddFeed = useServerFn(addFeed)
  const handleRemoveFeed = useServerFn(removeFeed)
  const [feedUrl, setFeedUrl] = React.useState('')
  const [promptText, setPromptText] = React.useState(data.preferences?.prompt_text || '')
  const [saving, setSaving] = React.useState(false)

  const onAddFeed = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feedUrl.trim()) return
    await handleAddFeed({ data: { url: feedUrl } })
    setFeedUrl('')
    router.invalidate()
  }

  const onRemoveFeed = async (id: number) => {
    await handleRemoveFeed({ data: { id } })
    router.invalidate()
  }

  const onSavePrefs = async () => {
    setSaving(true)
    await handleUpdatePrefs({ data: { promptText } })
    setSaving(false)
  }

  return (
    <div className="newspaper-container">
      <header className="newspaper-header">
        <h1 className="newspaper-title">Settings</h1>
        <div className="newspaper-date-line" style={{ marginTop: '0.5rem' }}>
          <a href="/" className="nav-link">← Return to Feed</a>
        </div>
      </header>

      <section className="settings-section">
        <h2>AI Preferences</h2>
        <p className="settings-description">
          Describe the articles you wish to receive. The AI will employ your criteria to rank and filter the feeds.
        </p>
        <textarea
          value={promptText}
          onChange={e => setPromptText(e.target.value)}
          placeholder="e.g., Show me interesting tech articles about AI, productivity, and new programming tools"
          rows={4}
          className="period-input"
        />
        <button
          onClick={onSavePrefs}
          disabled={saving}
          className="period-button primary"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </section>

      <section className="settings-section">
        <h2>RSS Feeds</h2>
        <form onSubmit={onAddFeed} className="feed-form">
          <input
            type="url"
            value={feedUrl}
            onChange={e => setFeedUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="period-input"
          />
          <button
            type="submit"
            className="period-button primary"
          >
            Add Feed
          </button>
        </form>

        {data.feeds.length === 0 ? (
          <p className="settings-description">No feeds added yet.</p>
        ) : (
          <ul className="feeds-list">
            {data.feeds.map((feed: any) => (
              <li key={feed.id} className="feed-item">
                <div className="feed-details">
                  <div className="feed-title-display">{feed.title}</div>
                  <a
                    href={feed.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="feed-url"
                  >
                    {feed.url}
                  </a>
                </div>
                <button
                  onClick={() => onRemoveFeed(feed.id)}
                  className="period-button danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}