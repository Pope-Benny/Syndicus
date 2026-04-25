import { JSDOM } from 'jsdom'
import { getDb, type Feed, type Article } from './db'

function extractImageFromContent(html: string): string | null {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return imgMatch ? imgMatch[1] : null
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

export async function fetchFeed(url: string): Promise<{ title: string; articles: Omit<Article, 'id' | 'feed_id'>[]; favicon_url: string | null }> {
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
  const articles: Omit<Article, 'id' | 'feed_id'>[] = []
  let faviconUrl: string | null = null

  const root = xml.querySelector('feed') || xml.querySelector('channel') || xml.querySelector('rss')
  if (root?.tagName === 'feed') {
    feedTitle = root.querySelector('title')?.textContent || 'Unknown Feed'
    faviconUrl = await fetchFavicon(url)
    const items = root.querySelectorAll('entry')
    for (const item of items) {
      articles.push({
        url: item.querySelector('link')?.getAttribute('href') || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: item.querySelector('summary, content')?.textContent?.slice(0, 500) || null,
        published: item.querySelector('published, updated')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: extractImageFromItem(item),
      })
    }
  } else if (root?.tagName === 'channel') {
    feedTitle = root.querySelector('title')?.textContent || 'Unknown Feed'
    faviconUrl = await fetchFavicon(url)
    const items = root.querySelectorAll('item')
    for (const item of items) {
      articles.push({
        url: item.querySelector('link')?.textContent || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: item.querySelector('description')?.textContent?.slice(0, 500) || null,
        published: item.querySelector('pubDate')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: extractImageFromItem(item),
      })
    }
  } else if (root?.tagName === 'rss') {
    const channel = root.querySelector('channel')
    feedTitle = channel?.querySelector('title')?.textContent || 'Unknown Feed'
    faviconUrl = await fetchFavicon(url)
    const items = channel?.querySelectorAll('item') || []
    for (const item of items) {
      articles.push({
        url: item.querySelector('link')?.textContent || '',
        title: item.querySelector('title')?.textContent || 'Untitled',
        content_snippet: item.querySelector('description')?.textContent?.slice(0, 500) || null,
        published: item.querySelector('pubDate')?.textContent || null,
        fetched_at: new Date().toISOString(),
        ai_score: null,
        image_url: extractImageFromItem(item),
      })
    }
  }

  return { title: feedTitle, articles, favicon_url: faviconUrl }
}

export async function fetchAllFeeds(): Promise<number> {
  const db = getDb()
  const feeds = db.prepare('SELECT * FROM feeds').all() as Feed[]
  let totalArticles = 0

  for (const feed of feeds) {
    try {
      const { title, articles, favicon_url } = await fetchFeed(feed.url)
      
      const insert = db.prepare(`
        INSERT OR IGNORE INTO articles (feed_id, url, title, content_snippet, published, fetched_at, ai_score, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertMany = db.transaction((arts: typeof articles) => {
        for (const art of arts) {
          insert.run(feed.id, art.url, art.title, art.content_snippet, art.published, art.fetched_at, art.ai_score, art.image_url)
        }
      })

      insertMany(articles)
      db.prepare('UPDATE feeds SET last_fetched = ?, title = ?, favicon_url = ? WHERE id = ?').run(new Date().toISOString(), title, favicon_url, feed.id)
      totalArticles += articles.length
    } catch (err) {
      console.error(`Error fetching feed ${feed.url}:`, err)
    }
  }

  return totalArticles
}