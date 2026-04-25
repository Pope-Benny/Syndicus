import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useServerFn } from '~/lib/useServerFn'

const getArticles = createServerFn({ method: 'GET' })
  .inputValidator((data: { limit?: number; offset?: number }) => data)
  .handler(async () => {
    try {
      const db = await import('~/lib/db').then(m => m.getDb())
      const limit = 50
      const offset = 0

      const articles = db.prepare(`
        SELECT a.*, f.title as feed_title, f.favicon_url
        FROM articles a
        JOIN feeds f ON a.feed_id = f.id
        LIMIT ? OFFSET ?
      `).all(limit, offset) as any[]

      const sorted = [...articles].sort((a, b) => {
        if (a.is_read !== b.is_read) return a.is_read - b.is_read
        const dateA = new Date(a.published || a.fetched_at).getTime()
        const dateB = new Date(b.published || b.fetched_at).getTime()
        if (dateA !== dateB) return dateB - dateA
        return (b.ai_score || 0) - (a.ai_score || 0)
      })

      return sorted
    } catch (err) {
      console.error('[getArticles] Error:', err)
      throw err
    }
  })

const refreshFeeds = createServerFn({ method: 'POST' })
  .inputValidator((data: { scoreArticles?: boolean }) => data)
  .handler(async ({ data }) => {
    console.log('[refreshFeeds] Starting refresh...')
    
    try {
      const { fetchAllFeeds } = await import('~/lib/rss')
      const count = await fetchAllFeeds()
      console.log('[refreshFeeds] Fetched', count, 'articles')
      
      if (data?.scoreArticles !== false) {
        console.log('[refreshFeeds] Starting AI scoring...')
        const { scoreAllArticles } = await import('~/lib/ai')
        await scoreAllArticles()
        console.log('[refreshFeeds] AI scoring complete')
      }

      return { ok: true, articlesAdded: count }
    } catch (err) {
      console.error('[refreshFeeds] Error:', err)
      return { ok: false, error: String(err), articlesAdded: 0 }
    }
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
  .inputValidator((data: { articleUrl: string; articleTitle: string; contentSnippet: string; articleId?: number }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    db.prepare('INSERT INTO engagement (article_url, article_title, content_snippet, event_type, timestamp) VALUES (?, ?, ?, ?, ?)').run(
      data.articleUrl,
      data.articleTitle,
      data.contentSnippet,
      'click',
      new Date().toISOString()
    )
    if (data.articleId) {
      db.prepare('UPDATE articles SET is_read = 1 WHERE id = ?').run(data.articleId)
    }
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
  loader: async ({ context }) => {
    try {
      const db = await import('~/lib/db').then(m => m.getDb())
      const prefs = db.prepare('SELECT dark_mode FROM preferences WHERE id = 1').get()
      return { darkMode: prefs?.dark_mode === 1 }
    } catch (err) {
      console.error('Failed to load feed data:', err)
      return { darkMode: false }
    }
  },
})

function FeedPage() {
  const { darkMode } = Route.useLoaderData() as { articles: any[]; darkMode: boolean }
  const [refreshing, setRefreshing] = React.useState(false)
  const [articlesList, setArticlesList] = React.useState<any[]>([])

  const handleRefresh = useServerFn(refreshFeeds)
  const handleGetArticles = useServerFn(getArticles)
  const handleLike = useServerFn(addLike)
  const handleClick = useServerFn(addClick)
  const handleToggleDarkMode = useServerFn(toggleDarkMode)
  const [showSun, setShowSun] = React.useState(darkMode)
  const [initialLoad, setInitialLoad] = React.useState(true)

  const loadArticles = async () => {
    const arts = await handleGetArticles({ data: { limit: 50 } })
    setArticlesList(arts || [])
  }

  const onLoadRefresh = async () => {
    setRefreshing(true)
    await handleRefresh({ data: { scoreArticles: true } })
    await loadArticles()
    setRefreshing(false)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    const result = await handleRefresh({ data: { scoreArticles: true } })
    setRefreshing(false)
    if (result?.ok) {
      await loadArticles()
    }
  }

  React.useEffect(() => {
    if (initialLoad) {
      setInitialLoad(false)
      onLoadRefresh()
    }
  }, [initialLoad])

  return (
    <div className="newspaper-container">
      <header className="newspaper-header">
        <div className="hero-section">
          <img
            src="/hero.png"
            alt="Syndicus"
            className="hero-image"
            style={{ filter: showSun ? 'invert(1)' : undefined }}
          />
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

      {articlesList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p>No articles to display.</p>
          <p>Kindly add some feeds in the <a href="/settings">Settings</a> section to begin your reading.</p>
        </div>
      ) : (
        <div className="articles-list">
          {articlesList.map((article: any) => (
            <ArticleCard key={article.id} article={article} onLike={handleLike} onClick={handleClick} />
          ))}
        </div>
      )}
    </div>
  )
}

function ArticleCard({ article, onLike, onClick }: { article: any; onLike: any; onClick: any }) {
  const [liked, setLiked] = React.useState(false)

  const handleLike = async () => {
    await onLike({ data: { 
      articleUrl: article.url, 
      articleTitle: article.title, 
      contentSnippet: article.content_snippet || '' 
    } })
    setLiked(true)
  }

  const handleClick = async () => {
    await onClick({ data: { 
      articleUrl: article.url, 
      articleTitle: article.title, 
      contentSnippet: article.content_snippet || '',
      articleId: article.id
    } })
  }

  const score = article.ai_score !== null ? Math.round(article.ai_score * 100) : null
  const scoreClass = article.ai_score > 0.7 ? 'score-high' : article.ai_score > 0.4 ? 'score-medium' : 'score-low'

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const publishedDate = article.published || article.fetched_at

  return (
    <article className={`article-card ${article.is_read ? 'read' : 'unread'}`}>
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
        <a href={article.url} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
          {article.title}
        </a>
      </h3>
      {publishedDate && (
        <p className="article-date">{formatDate(publishedDate)}</p>
      )}
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