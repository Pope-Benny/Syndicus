import { getDb } from './db'
import { JSDOM } from 'jsdom'

function extractImageFromContent(html: string): string | null {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return imgMatch ? imgMatch[1] : null
}

function parseHtmlContent(html: string | null): { text: string; imageUrl: string | null } {
  if (!html) return { text: '', imageUrl: null }
  
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html)
  
  if (hasHtmlTags) {
    try {
      const dom = new JSDOM(html, { contentType: 'text/html' })
      const doc = dom.window.document
      
      const imageUrl = extractImageFromContent(html)
      const text = doc.body.textContent?.trim() || ''
      
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
const SKIP_REFRESH_HOURS = 3

function parseFeedDate(dateStr: string | null): Date | null {
  if (!dateStr) return null
  try {
    const parsed = new Date(dateStr)
    return isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}

function isArticleFresh(published: string | null, fetchedAt: string): boolean {
  const pubDate = parseFeedDate(published)
  if (!pubDate) {
    const fetchDate = new Date(fetchedAt)
    const now = new Date()
    const hoursDiff = (now.getTime() - fetchDate.getTime()) / (1000 * 60 * 60)
    return hoursDiff <= MAX_AGE_DAYS * 24
  }
  const now = new Date()
  const daysDiff = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24)
  return daysDiff <= MAX_AGE_DAYS
}

export async function clearOldArticles(): Promise<number> {
  const db = getDb()
  const result = db.prepare('DELETE FROM articles').run()
  console.log('[RSS] Cleared', result.changes, 'articles')
  return result.changes
}

export async function fetchAllFeeds(force = false): Promise<{ added: number; skipped: number; errors: string[] }> {
  const db = getDb()
  const feeds = db.prepare('SELECT * FROM feeds').all() as { id: number; url: string; last_fetched: string | null; title: string }[]
  
  if (feeds.length === 0) return { added: 0, skipped: 0, errors: [] }

  const errors: string[] = []
  let totalArticles = 0
  let totalSkipped = 0
  const now = new Date()

  for (const feed of feeds) {
    if (!force && feed.last_fetched) {
      const lastFetched = new Date(feed.last_fetched)
      const hoursSince = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60)
      if (hoursSince < SKIP_REFRESH_HOURS) {
        console.log(`[RSS] Skipping ${feed.title || feed.url} - refreshed ${hoursSince.toFixed(1)}h ago`)
        totalSkipped++
        continue
      }
    }

    console.log(`[RSS] Fetching ${feed.url}...`)
    
    try {
      const result = await fetchFeed(feed.url)
      const { title, articles, favicon_url } = result

      const freshArticles = []
      for (const art of articles) {
        if (isArticleFresh(art.published, art.fetched_at)) {
          freshArticles.push(art)
          if (freshArticles.length >= MAX_ARTICLES_PER_FEED) break
        }
      }

      console.log(`[RSS] ${feed.url}: ${articles.length} total, ${freshArticles} fresh (last ${MAX_AGE_DAYS} days, max ${MAX_ARTICLES_PER_FEED})`)

      if (freshArticles.length === 0) {
        db.prepare('UPDATE feeds SET last_fetched = ?, title = ?, favicon_url = ? WHERE id = ?').run(now.toISOString(), title, favicon_url, feed.id)
        continue
      }

      const insert = db.prepare(`
        INSERT OR IGNORE INTO articles (feed_id, url, title, content_snippet, published, fetched_at, ai_score, image_url, is_html_only)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertMany = db.transaction((arts: typeof freshArticles) => {
        for (const art of arts) {
          insert.run(feed.id, art.url, art.title, art.content_snippet, art.published, art.fetched_at, art.ai_score, art.image_url, art.is_html_only ? 1 : 0)
        }
      })

      insertMany(freshArticles)
      db.prepare('UPDATE feeds SET last_fetched = ?, title = ?, favicon_url = ? WHERE id = ?').run(now.toISOString(), title, favicon_url, feed.id)
      totalArticles += freshArticles.length
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[RSS] ERROR fetching ${feed.url}:`, errMsg)
      errors.push(`${feed.url}: ${errMsg}`)
    }
  }

  return { added: totalArticles, skipped: totalSkipped, errors }
}