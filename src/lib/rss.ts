import { getDb } from './db'
import { JSDOM } from 'jsdom'

function extractImageFromContent(html: string): string | null {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return imgMatch ? imgMatch[1] : null
}

function isHtmlOnlyContent(content: string | null): boolean {
  if (!content) return false
  const trimmed = content.trim()
  if (!trimmed) return false
  const stripped = trimmed.replace(/<[^>]+>/g, '').trim()
  return stripped.length < 20
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
      const content = item.querySelector('summary, content')?.textContent
      const isHtmlOnly = isHtmlOnlyContent(content)
      articles.push({
        url: item.querySelector('link')?.getAttribute('href') || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: content?.slice(0, 500) || null,
        published: item.querySelector('published, updated')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: extractImageFromItem(item),
        is_html_only: isHtmlOnly,
      })
    }
  } else if (root?.tagName === 'channel') {
    feedTitle = root.querySelector('title')?.textContent || 'Unknown Feed'
    faviconUrl = await fetchFavicon(url)
    const items = root.querySelectorAll('item')
    for (const item of items) {
      const description = item.querySelector('description')?.textContent
      const isHtmlOnly = isHtmlOnlyContent(description)
      articles.push({
        url: item.querySelector('link')?.textContent || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: description?.slice(0, 500) || null,
        published: item.querySelector('pubDate')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: extractImageFromItem(item),
        is_html_only: isHtmlOnly,
      })
    }
  } else if (root?.tagName === 'rss') {
    const channel = root.querySelector('channel')
    feedTitle = channel?.querySelector('title')?.textContent || 'Unknown Feed'
    faviconUrl = await fetchFavicon(url)
    const items = channel?.querySelectorAll('item') || []
    for (const item of items) {
      const description = item.querySelector('description')?.textContent
      const isHtmlOnly = isHtmlOnlyContent(description)
      articles.push({
        url: item.querySelector('link')?.textContent || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: description?.slice(0, 500) || null,
        published: item.querySelector('pubDate')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: extractImageFromItem(item),
        is_html_only: isHtmlOnly,
      })
    }
  }

  return { title: feedTitle, articles, favicon_url: faviconUrl }
}

export async function fetchAllFeeds(): Promise<number> {
  const db = getDb()
  const feeds = db.prepare('SELECT * FROM feeds').all() as { id: number; url: string }[]
  
  if (feeds.length === 0) return 0

  const results = await Promise.allSettled(
    feeds.map(feed => fetchFeed(feed.url))
  )

  let totalArticles = 0

  for (let i = 0; i < feeds.length; i++) {
    const result = results[i]
    const feed = feeds[i]
    
    if (result.status === 'rejected') {
      console.error(`Error fetching feed ${feed.url}:`, result.reason)
      continue
    }

    const { title, articles, favicon_url } = result.value
    if (articles.length === 0) continue

    const insert = db.prepare(`
      INSERT OR IGNORE INTO articles (feed_id, url, title, content_snippet, published, fetched_at, ai_score, image_url, is_html_only)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = db.transaction((arts: typeof articles) => {
      for (const art of arts) {
        insert.run(feed.id, art.url, art.title, art.content_snippet, art.published, art.fetched_at, art.ai_score, art.image_url, art.is_html_only ? 1 : 0)
      }
    })

    insertMany(articles)
    db.prepare('UPDATE feeds SET last_fetched = ?, title = ?, favicon_url = ? WHERE id = ?').run(new Date().toISOString(), title, favicon_url, feed.id)
    totalArticles += articles.length
  }

  return totalArticles
}