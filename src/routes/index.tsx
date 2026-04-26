import * as React from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useServerFn } from '~/lib/useServerFn'

const getArticles = createServerFn({ method: 'GET' })
  .inputValidator((data: { limit?: number; offset?: number; oldestDays?: number }) => data)
  .handler(async ({ data }) => {
    try {
      const db = await import('~/lib/db').then(m => m.getDb())
      const limit = data?.limit || 100
      const offset = data?.offset || 0
      const oldestDays = data?.oldestDays || 30

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - oldestDays)
      const cutoffTime = cutoffDate.getTime()

      const articles = db.prepare(`
        SELECT a.*, f.title as feed_title, f.favicon_url, f.is_favorite as feed_is_favorite, f.id as feed_id
        FROM articles a
        JOIN feeds f ON a.feed_id = f.id
        WHERE a.ai_score IS NOT NULL AND a.is_dismissed = 0
        ORDER BY a.is_read ASC, RANDOM()
        LIMIT 500
      `).all() as any[]

      const filtered = articles.filter(a => {
        const pubDate = a.published ? new Date(a.published).getTime() : null
        const fetchDate = new Date(a.fetched_at).getTime()
        const articleTime = pubDate || fetchDate
        return articleTime >= cutoffTime
      })

      const sorted = filtered.slice(offset, offset + limit).sort((a, b) => {
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
  .inputValidator((data?: { force?: boolean; clear?: boolean; scoreArticles?: boolean }) => data)
  .handler(async ({ data }) => {
    console.log('[refreshFeeds] Starting refresh...')
    
    try {
      if (data?.clear) {
        const { clearOldArticles } = await import('~/lib/rss')
        const cleared = await clearOldArticles()
        console.log('[refreshFeeds] Cleared', cleared, 'articles')
      }
      
      const { fetchAllFeeds } = await import('~/lib/rss')
      let refreshResult: { added: number; skipped: number; errors: string[] }
      
      try {
        refreshResult = await fetchAllFeeds(!!data?.force)
      } catch {
        refreshResult = { added: 0, skipped: 0, errors: ['Legacy fetchAllFeeds returned number instead of object'] }
      }
      
      console.log('[refreshFeeds] Fetched', refreshResult.added, 'articles, skipped', refreshResult.skipped)
      if (refreshResult.errors.length > 0) {
        console.log('[refreshFeeds] Errors:', refreshResult.errors)
      }
      
      if (data?.scoreArticles !== false) {
        console.log('[refreshFeeds] Starting AI scoring...')
        const { scoreAllArticles } = await import('~/lib/ai')
        await scoreAllArticles()
        console.log('[refreshFeeds] AI scoring complete')
      }

      return { ok: true, ...refreshResult }
    } catch (err) {
      console.error('[refreshFeeds] Error:', err)
      return { ok: false, error: String(err), added: 0, skipped: 0, errors: [String(err)] }
    }
  })

const autoRefresh = createServerFn({ method: 'POST' }).handler(async () => {
  console.log('[autoRefresh] Starting scheduled refresh at 7am...')
  
  try {
    const { fetchAllFeeds } = await import('~/lib/rss')
    const result = await fetchAllFeeds(false)
    
    console.log('[autoRefresh] Fetched', result.added, 'articles, skipped', result.skipped)
    
    const { scoreAllArticles } = await import('~/lib/ai')
    await scoreAllArticles()
    
    console.log('[autoRefresh] Complete')
    return { ok: true, ...result }
  } catch (err) {
    console.error('[autoRefresh] Error:', err)
    return { ok: false, error: String(err), added: 0, skipped: 0, errors: [String(err)] }
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

    const info = db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(url, title)
    const newFeed = db.prepare('SELECT * FROM feeds WHERE url = ?').get(url)

    return { ok: true, title, feed: newFeed }
  })

const removeFeed = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    db.prepare('DELETE FROM articles WHERE feed_id = ?').run(data.id)
    db.prepare('DELETE FROM feeds WHERE id = ?').run(data.id)
    return { ok: true }
  })

const toggleFeedFavorite = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const db = await import('~/lib/db').then(m => m.getDb())
    const feed = db.prepare('SELECT is_favorite FROM feeds WHERE id = ?').get(data.id) as { is_favorite: number } | undefined
    if (!feed) {
      return { ok: false, error: 'Feed not found' }
    }
    const newValue = feed.is_favorite ? 0 : 1
    db.prepare('UPDATE feeds SET is_favorite = ? WHERE id = ?').run(newValue, data.id)
    return { ok: true, is_favorite: newValue }
  })

export const Route = createFileRoute('/')({
  component: FeedPage,
  loader: async ({ context }) => {
    try {
      const db = await import('~/lib/db').then(m => m.getDb())
      const prefs = db.prepare('SELECT dark_mode FROM preferences WHERE id = 1').get()
      const lastFetch = db.prepare('SELECT MAX(last_fetched) as last_fetched FROM feeds WHERE last_fetched IS NOT NULL').get()
      const lastFetched = lastFetch?.last_fetched ? String(lastFetch.last_fetched) : null
      const feeds = await getFeeds({ data: {} })
      return { darkMode: prefs?.dark_mode === 1, lastFetched, feeds }
    } catch (err) {
      console.error('Failed to load feed data:', err)
      return { darkMode: false, lastFetched: null, feeds: [] }
    }
  },
})

function FeedPage() {
  const { darkMode, lastFetched, feeds: initialFeeds } = Route.useLoaderData() as { articles: any[]; darkMode: boolean; lastFetched: string | null; feeds: any[] }
  const router = useRouter()
  const [refreshing, setRefreshing] = React.useState(false)
  const [articlesList, setArticlesList] = React.useState<any[]>([])
  const [feedUrl, setFeedUrl] = React.useState('')
  const [feedsList, setFeedsList] = React.useState(initialFeeds)
  const [addFeedError, setAddFeedError] = React.useState('')

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
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  const handleGetFeeds = useServerFn(getFeeds)
  const handleAddFeed = useServerFn(addFeed)
  const handleRemoveFeed = useServerFn(removeFeed)
  const handleToggleFavorite = useServerFn(toggleFeedFavorite)

  const loadArticles = async () => {
    const arts = await handleGetArticles({ data: { limit: 50 } })
    setArticlesList(arts || [])
  }

  const onRefresh = async () => {
    setRefreshing(true)
    const result = await handleRefresh({ data: { force: true, scoreArticles: true } })
    setRefreshing(false)
    if (result?.ok) {
      await loadArticles()
    }
  }

  const onLoadRefresh = async () => {
    setRefreshing(true)
    await handleRefresh({ data: { force: false, scoreArticles: true } })
    await loadArticles()
    setRefreshing(false)
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
          {lastFetched && (
            <p className="hero-updated">
              Updated {new Date(lastFetched).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
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
            <button
              onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
              className="menu-item"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span>Settings</span>
            </button>
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

        {settingsOpen && (
          <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Settings</h2>
                <button onClick={() => setSettingsOpen(false)} className="modal-close">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="settings-content">
                <p className="settings-description">
                  Add RSS feeds. Feeds will be checked periodically for new articles.
                </p>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  if (!feedUrl.trim()) return
                  const result = await handleAddFeed({ data: { url: feedUrl } })
                  setFeedUrl('')
                  if (result?.ok && result.feed) {
                    setFeedsList(prev => [...prev, result.feed])
                  } else if (result?.ok === false) {
                    setAddFeedError(result.error || 'Failed to add feed')
                  }
                }} className="feed-form">
                  <input
                    type="url"
                    value={feedUrl}
                    onChange={e => setFeedUrl(e.target.value)}
                    placeholder="https://example.com/feed.xml"
                    className="period-input"
                  />
                  <button type="submit" className="period-button primary">
                    Add
                  </button>
                </form>

                {addFeedError && (
                  <p style={{ color: '#dc2626', marginTop: '8px' }}>{addFeedError}</p>
                )}

                {feedsList.length === 0 ? (
                  <p style={{ color: 'var(--ink-brown)', fontStyle: 'italic' }}>No feeds added yet.</p>
                ) : (
                  <ul className="feeds-list">
                    {feedsList.map((feed: any) => (
                      <li key={feed.id} className="feed-item">
                        <div className="feed-details">
                          <div className="feed-title-display">{feed.title}</div>
                          <a href={feed.url} target="_blank" rel="noopener noreferrer" className="feed-url">
                            {feed.url}
                          </a>
                        </div>
                        <div className="feed-actions">
                          <button
                            onClick={async () => {
                              await handleToggleFavorite({ data: { id: feed.id } })
                              setFeedsList(prev => prev.map(f => 
                                f.id === feed.id ? { ...f, is_favorite: f.is_favorite ? 0 : 1 } : f
                              ))
                            }}
                            className={`favorite-btn ${feed.is_favorite ? 'favorited' : ''}`}
                            title={feed.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill={feed.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          </button>
                          <button
                            onClick={async () => {
                              await handleRemoveFeed({ data: { id: feed.id } })
                              setFeedsList(prev => prev.filter(f => f.id !== feed.id))
                            }}
                            className="period-button danger"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
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