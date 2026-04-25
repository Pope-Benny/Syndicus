import * as React from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useServerFn } from '~/lib/useServerFn'

const getArticles = createServerFn({ method: 'GET' })
  .inputValidator((data: { limit?: number; offset?: number }) => data)
  .handler(async () => {
    const db = await import('~/lib/db').then(m => m.getDb())
    const limit = 50
    const offset = 0

    const articles = db.prepare(`
      SELECT a.*, f.title as feed_title, f.favicon_url
      FROM articles a
      JOIN feeds f ON a.feed_id = f.id
      WHERE a.ai_score IS NOT NULL
      ORDER BY a.ai_score DESC, a.published DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]

    return articles
  })

const refreshFeeds = createServerFn({ method: 'POST' }).handler(async () => {
  const { fetchAllFeeds } = await import('~/lib/rss')
  const { scoreAllArticles } = await import('~/lib/ai')

  const count = await fetchAllFeeds()
  await scoreAllArticles()

  return { ok: true, articlesAdded: count }
})

const addLike = createServerFn({ method: 'POST' })
  .inputValidator((data: { articleUrl: string; articleTitle: string; contentSnippet: string }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    db.prepare('INSERT INTO engagement (article_url, article_title, content_snippet, event_type, timestamp) VALUES (?, ?, ?, ?, ?)').run(
      data.articleUrl,
      data.articleTitle,
      data.contentSnippet,
      'like',
      new Date().toISOString()
    )
    return { ok: true }
  })

const addClick = createServerFn({ method: 'POST' })
  .inputValidator((data: { articleUrl: string; articleTitle: string; contentSnippet: string }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    db.prepare('INSERT INTO engagement (article_url, article_title, content_snippet, event_type, timestamp) VALUES (?, ?, ?, ?, ?)').run(
      data.articleUrl,
      data.articleTitle,
      data.contentSnippet,
      'click',
      new Date().toISOString()
    )
    return { ok: true }
  })

const toggleDarkMode = createServerFn({ method: 'POST' })
  .inputValidator((data: { enabled: boolean }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    db.prepare('UPDATE preferences SET dark_mode = ? WHERE id = 1').run(data.enabled ? 1 : 0)
    return { ok: true }
  })

export const Route = createFileRoute('/')({
  component: FeedPage,
  loader: async () => {
    const articles = await getArticles({ data: { limit: 50 } })
    const db = await import('~/lib/db').then(m => m.getDb())
    const prefs = db.prepare('SELECT dark_mode FROM preferences WHERE id = 1').get()
    return { articles, darkMode: prefs?.dark_mode === 1 }
  },
})

function FeedPage() {
  const { articles, darkMode } = Route.useLoaderData() as { articles: any[]; darkMode: boolean }
  const router = useRouter()
  const [refreshing, setRefreshing] = React.useState(false)

  const handleRefresh = useServerFn(refreshFeeds)
  const handleLike = useServerFn(addLike)
  const handleToggleDarkMode = useServerFn(toggleDarkMode)
  const [showSun, setShowSun] = React.useState(darkMode)

  const onRefresh = async () => {
    setRefreshing(true)
    await handleRefresh({ data: {} })
    router.invalidate()
    setRefreshing(false)
  }

  return (
    <div className="newspaper-container">
      <header className="newspaper-header">
        <div className="hero-section">
          <h1 className="hero-title">Syndicus</h1>
          <p className="hero-subtitle">caretaker of the issues</p>
        </div>
        <div className="header-actions">
          <button
            onClick={async () => {
              const newValue = !showSun
              setShowSun(newValue)
              document.documentElement.classList.toggle('dark', newValue)
              await handleToggleDarkMode({ data: { enabled: newValue } })
            }}
            className="header-icon-btn"
            title={showSun ? "Light Mode" : "Dark Mode"}
          >
            {showSun ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 1v2"/>
                <path d="M12 21v2"/>
                <path d="M4.22 4.22l1.42 1.42"/>
                <path d="M18.36 18.36l1.42 1.42"/>
                <path d="M1 12h2"/>
                <path d="M21 12h2"/>
                <path d="M4.22 19.78l1.42-1.42"/>
                <path d="M18.36 5.64l1.42-1.42"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="header-icon-btn"
            title="Refresh Feeds"
          >
            {refreshing ? (
              <span className="spinner" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            )}
          </button>
          <a href="/settings" className="header-icon" title="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </a>
        </div>
      </header>

      {articles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p>No articles to display.</p>
          <p>Kindly add some feeds in the <a href="/settings">Settings</a> section to begin your reading.</p>
        </div>
      ) : (
        <div className="articles-list">
          {articles.map((article: any) => (
            <ArticleCard key={article.id} article={article} onLike={handleLike} />
          ))}
        </div>
      )}
    </div>
  )
}

function ArticleCard({ article, onLike }: { article: any; onLike: any }) {
  const [liked, setLiked] = React.useState(false)

  const handleLike = async () => {
    await onLike({ data: { 
      articleUrl: article.url, 
      articleTitle: article.title, 
      contentSnippet: article.content_snippet || '' 
    } })
    setLiked(true)
  }

  const score = article.ai_score !== null ? Math.round(article.ai_score * 100) : null
  const scoreClass = article.ai_score > 0.7 ? 'score-high' : article.ai_score > 0.4 ? 'score-medium' : 'score-low'

  return (
    <article className="article-card">
      <div className="article-meta">
        {article.favicon_url && (
          <img 
            src={article.favicon_url} 
            alt="" 
            className="favicon"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
        <span className="feed-title">{article.feed_title}</span>
        {score !== null && (
          <span className={`score-badge ${scoreClass}`}>{score}%</span>
        )}
      </div>
      <h3 className="article-title">
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          {article.title}
        </a>
      </h3>
      {article.image_url && (
        <img 
          src={article.image_url} 
          alt="" 
          className="article-image"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      {article.content_snippet && (
        <p className="article-excerpt">
          {article.content_snippet.slice(0, 180)}
          {article.content_snippet.length > 180 ? '...' : ''}
        </p>
      )}
      <div className="article-actions">
        <button
          onClick={handleLike}
          disabled={liked}
          className={`action-btn ${liked ? 'liked' : ''}`}
        >
          {liked ? '★ Saved' : '☆ Save'}
        </button>
      </div>
    </article>
  )
}