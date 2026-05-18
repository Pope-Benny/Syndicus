import { getDb } from './db'
import { JSDOM } from 'jsdom'

function extractImageFromContent(html: string): string | null {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return imgMatch ? imgMatch[1] : null
}

function extractTextWithSpacing(node: Node): string {
  if (node.nodeType === 3) {
    const text = (node.textContent || '').trim()
    return text
  }
  if (node.nodeType !== 1) return ''
  const el = node as Element
  if (el.tagName === 'BR') return ''
  const parts: string[] = []
  for (const child of el.childNodes) {
    const text = extractTextWithSpacing(child)
    if (text) parts.push(text)
  }
  return parts.join(' - ')
}

function parseHtmlContent(html: string | null): { text: string; imageUrl: string | null } {
  if (!html) return { text: '', imageUrl: null }
  
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html)
  
  if (hasHtmlTags) {
    try {
      const dom = new JSDOM(html, { contentType: 'text/html' })
      const doc = dom.window.document
      
      const imageUrl = extractImageFromContent(html)
      const text = extractTextWithSpacing(doc.body)
      
      if (text.length > 0) {
        return { text, imageUrl }
      }
    } catch {
      // Fall through to regex fallback
    }
  }
  
  return { text: html.replace(/<[^>]+>/g, '').trim(), imageUrl: extractImageFromContent(html) }
}

function isHtmlOnlyContent(content: string | null): boolean {
  if (!content) return false
  const trimmed = content.trim()
  if (!trimmed) return false
  const stripped = trimmed.replace(/<[^>]+>/g, '').trim()
  return stripped.length < 20
}

function getItemContent(item: Element): string | null {
  const contentEncoded = item.querySelector('content\\:encoded, encoded')
  if (contentEncoded?.textContent) return contentEncoded.textContent
  
  const content = item.querySelector('content, description, summary')
  return content?.textContent || null
}

function extractImageFromItem(item: Element): string | null {
  const enclosure = item.querySelector('enclosure[type^="image"]')
  if (enclosure) {
    const url = enclosure.getAttribute('url')
    if (url) return url
  }

  const mediaContent = item.querySelector('media\\:content, content')
  if (mediaContent) {
    const url = mediaContent.getAttribute('url')
    const medium = mediaContent.getAttribute('medium')
    if (url && medium === 'image') return url
  }

  const mediaThumbnail = item.querySelector('media\\:thumbnail, thumbnail')
  if (mediaThumbnail) {
    const url = mediaThumbnail.getAttribute('url')
    if (url) return url
  }

  const image = item.querySelector('image')
  if (image) {
    const url = image.querySelector('url')?.textContent
    if (url) return url
  }

  const description = item.querySelector('description, summary, content')?.textContent
  if (description) {
    return extractImageFromContent(description)
  }

  return null
}

async function fetchFavicon(feedUrl: string): Promise<string | null> {
  try {
    const urlObj = new URL(feedUrl)
    const faviconUrl = `${urlObj.protocol}//${urlObj.host}/favicon.ico`
    const response = await fetch(faviconUrl, { method: 'HEAD' })
    if (response.ok) return faviconUrl
    return null
  } catch {
    return null
  }
}

export interface FeedData {
  title: string
  articles: { url: string; title: string; content_snippet: string | null; published: string | null; fetched_at: string; ai_score: null; image_url: string | null; is_html_only: boolean }[]
  favicon_url: string | null
}

export async function fetchFeed(url: string): Promise<FeedData> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Syndicus/1.0',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`)
  }

  const body = await response.text()
  const dom = new JSDOM(body, { contentType: 'application/xml' })
  const xml = dom.window.document

  let feedTitle = ''
  const articles: FeedData['articles'] = []
  let faviconUrl: string | null = null

  const root = xml.querySelector('feed') || xml.querySelector('channel') || xml.querySelector('rss')
  if (root?.tagName === 'feed') {
    feedTitle = root.querySelector('title')?.textContent || 'Unknown Feed'
    faviconUrl = await fetchFavicon(url)
    const items = root.querySelectorAll('entry')
    for (const item of items) {
      const content = getItemContent(item)
      const parsed = parseHtmlContent(content)
      const isHtmlOnly = isHtmlOnlyContent(content)
      articles.push({
        url: item.querySelector('link')?.getAttribute('href') || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: parsed.text.slice(0, 500) || null,
        published: item.querySelector('published, updated')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: parsed.imageUrl || extractImageFromItem(item),
        is_html_only: isHtmlOnly,
      })
    }
  } else if (root?.tagName === 'channel') {
    feedTitle = root.querySelector('title')?.textContent || 'Unknown Feed'
    faviconUrl = await fetchFavicon(url)
    const items = root.querySelectorAll('item')
    for (const item of items) {
      const content = getItemContent(item)
      const parsed = parseHtmlContent(content)
      const isHtmlOnly = isHtmlOnlyContent(content)
      articles.push({
        url: item.querySelector('link')?.textContent || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: parsed.text.slice(0, 500) || null,
        published: item.querySelector('pubDate')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: parsed.imageUrl || extractImageFromItem(item),
        is_html_only: isHtmlOnly,
      })
    }
  } else if (root?.tagName === 'rss') {
    const channel = root.querySelector('channel')
    feedTitle = channel?.querySelector('title')?.textContent || 'Unknown Feed'
    faviconUrl = await fetchFavicon(url)
    const items = channel?.querySelectorAll('item') || []
    for (const item of items) {
      const content = getItemContent(item)
      const parsed = parseHtmlContent(content)
      const isHtmlOnly = isHtmlOnlyContent(content)
      articles.push({
        url: item.querySelector('link')?.textContent || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: parsed.text.slice(0, 500) || null,
        published: item.querySelector('pubDate')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: parsed.imageUrl || extractImageFromItem(item),
        is_html_only: isHtmlOnly,
      })
    }
  }

  return { title: feedTitle, articles, favicon_url: faviconUrl }
}

const MAX_ARTICLES_PER_FEED = 60
const MAX_AGE_DAYS = parseInt(process.env.MAX_AGE_DAYS || '3', 10)

function parseFeedDate(dateStr: string | null): Date | null {
  if (!dateStr) return null
  try {
    const parsed = new Date(dateStr)
    return isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}

export async function clearOldArticles(): Promise<number> {
  const db = getDb()
  
  // Get all articles and filter by parsed published date
  const articles = db.prepare('SELECT id, published FROM articles WHERE published IS NOT NULL').all() as { id: number; published: string }[]
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS)
  
  const oldArticleIds = articles
    .filter(a => {
      const pubDate = parseFeedDate(a.published)
      return pubDate && pubDate < cutoffDate
    })
    .map(a => a.id)
  
  if (oldArticleIds.length === 0) return 0
  
  // Delete old articles in batches
  const deleteStmt = db.prepare('DELETE FROM articles WHERE id = ?')
  const deleteMany = db.transaction((ids: number[]) => {
    for (const id of ids) {
      deleteStmt.run(id)
    }
  })
  
  deleteMany(oldArticleIds)
  console.log('[RSS] Cleared', oldArticleIds.length, 'articles older than', MAX_AGE_DAYS, 'days')
  return oldArticleIds.length
}

export async function fetchAllFeeds(): Promise<{ added: number; skipped: number; errors: string[] }> {
  const db = getDb()
  const feeds = db.prepare('SELECT * FROM feeds').all() as { id: number; url: string; last_fetched: string | null; title: string }[]

  if (feeds.length === 0) return { added: 0, skipped: 0, errors: [] }

  const now = new Date()
  const errors: string[] = []
  let totalArticles = 0

  console.log(`[RSS] Refreshing ${feeds.length} feeds...`)

  // Clean up old articles before fetching
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS)
  const oldArticleIds = db.prepare('SELECT id, published FROM articles WHERE published IS NOT NULL').all()
    .filter((a: any) => {
      const pubDate = parseFeedDate(a.published)
      return pubDate && pubDate < cutoffDate
    })
    .map((a: any) => a.id)

  if (oldArticleIds.length > 0) {
    const deleteStmt = db.prepare('DELETE FROM articles WHERE id = ?')
    const deleteMany = db.transaction((ids: number[]) => {
      for (const id of ids) deleteStmt.run(id)
    })
    deleteMany(oldArticleIds)
    console.log(`[RSS] Cleaned up ${oldArticleIds.length} articles older than ${MAX_AGE_DAYS} days`)
  }

  // Fetch all feeds in parallel (HTTP requests only, no DB writes)
  const fetchResults = await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        console.log(`[RSS] Fetching ${feed.url}...`)
        const result = await fetchFeed(feed.url)
        return { feed, result }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        errors.push(`${feed.url}: ${errMsg}`)
        console.error(`[RSS] ERROR fetching ${feed.url}:`, errMsg)
        return null
      }
    })
  )

  // Process results sequentially for database writes (better-sqlite3 doesn't support concurrent writes)
  const insert = db.prepare(`
    INSERT INTO articles (feed_id, url, title, content_snippet, published, fetched_at, ai_score, image_url, is_html_only)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(feed_id, url) DO UPDATE SET
      content_snippet = excluded.content_snippet,
      image_url = excluded.image_url
  `)

  const insertMany = db.transaction((feedId: number, arts: any[]) => {
    for (const art of arts) {
      insert.run(feedId, art.url, art.title, art.content_snippet, art.published, art.fetched_at, art.ai_score, art.image_url, art.is_html_only ? 1 : 0)
    }
  })

  let skippedCount = 0

  for (const fetchResult of fetchResults) {
    if (fetchResult.status === 'rejected') {
      errors.push(fetchResult.reason.message)
      console.error(`[RSS] ERROR:`, fetchResult.reason.message)
      continue
    }

    const result = fetchResult.value

    if (!result) {
      skippedCount++
      continue
    }

    const { feed, result: feedResult } = result
    const { title, articles, favicon_url } = feedResult

    // Take the most recent articles (up to MAX_ARTICLES_PER_FEED)
    // Don't filter by age here - cleanup will handle old articles
    const articlesToInsert = articles.slice(0, MAX_ARTICLES_PER_FEED)

    db.prepare('UPDATE feeds SET last_fetched = ?, title = ?, favicon_url = ? WHERE id = ?').run(now.toISOString(), title, favicon_url, feed.id)
    insertMany(feed.id, articlesToInsert)
    totalArticles += articlesToInsert.length
  }

  console.log(`[RSS] Refresh complete. Added ${totalArticles} articles, skipped ${skippedCount}, ${errors.length} errors.`)

  return { added: totalArticles, skipped: skippedCount, errors }
}