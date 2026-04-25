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
        WHERE a.ai_score IS NOT NULL AND a.is_dismissed = 0
        ORDER BY a.is_read ASC, RANDOM()
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

const dismissArticle = createServerFn({ method: 'POST' })
  .inputValidator((data: { articleId: number }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    db.prepare('UPDATE articles SET is_dismissed = 1 WHERE id = ?').run(data.articleId)
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
  const handleDismiss = useServerFn(dismissArticle)
  const handleToggleDarkMode = useServerFn(toggleDarkMode)
  const [showSun, setShowSun] = React.useState(darkMode)
  const [initialLoad, setInitialLoad] = React.useState(true)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [showScrollTop, setShowScrollTop] = React.useState(false)

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

  React.useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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
        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          title="Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        {menuOpen && (
          <div className="hamburger-menu">
            <button
              onClick={async () => {
                const newValue = !showSun
                setShowSun(newValue)
                document.documentElement.classList.toggle('dark', newValue)
                await handleToggleDarkMode({ data: { enabled: newValue } })
              }}
              className="menu-item"
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
              <span>{showSun ? "Light Mode" : "Dark Mode"}</span>
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="menu-item"
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
              <span>{refreshing ? "Refreshing..." : "Refresh Feeds"}</span>
            </button>
            <a href="/settings" className="menu-item" onClick={() => setMenuOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span>Settings</span>
            </a>
          </div>
        )}
      </header>

      <div className="articles-list">
          {articlesList.map((article: any) => (
            <ArticleCard key={article.id} article={article} onDismiss={handleDismiss} onClick={handleClick} />
          ))}
        </div>

        <button
          className={`scroll-to-top ${showScrollTop ? 'visible' : ''}`}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Back to top"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6"/>
          </svg>
        </button>
    </div>
  )
}

function ArticleCard({ article, onDismiss, onClick }: { article: any; onDismiss: any; onClick: any }) {
  const [dismissed, setDismissed] = React.useState(false)
  const [isRemoving, setIsRemoving] = React.useState(false)

  const handleDismiss = async () => {
    setIsRemoving(true)
    await onDismiss({ data: { articleId: article.id } })
    setTimeout(() => setDismissed(true), 300)
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

  const isHtmlOnly = React.useMemo(() => {
    if (!article.content_snippet) return false
    const stripped = article.content_snippet.replace(/<[^>]+>/g, '').trim()
    return stripped.length < 20
  }, [article.content_snippet])

  if (dismissed) return null

  return (
    <article className={`article-card ${article.is_read ? 'read' : 'unread'} ${isRemoving ? 'removing' : ''}`}>
      <button
        onClick={handleDismiss}
        disabled={isRemoving}
        className="dismiss-btn"
        title="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
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
      </div>
{score !== null && (
        <div className="article-dismiss">
            <span className={`score-badge ${scoreClass}`}>{score}%</span>
        </div>
      )}
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
      {article.content_snippet && !isHtmlOnly && (
        <p className="article-excerpt">
          {article.content_snippet.slice(0, 180)}
          {article.content_snippet.length > 180 ? '...' : ''}
        </p>
      )}
    </article>
  )
}