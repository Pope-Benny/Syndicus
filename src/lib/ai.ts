import { getDb, type Article } from './db'

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || ''
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || ''

export async function getEmbedding(text: string): Promise<number[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || ''
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || ''
  
  if (!accountId || !apiToken) {
    console.error('[AI] Missing credentials for embedding')
    return []
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    }
  )

  if (!response.ok) {
    console.error('Embedding error:', response.status, await response.text())
    return []
  }

  const data = await response.json() as any
  const rawEmbedding = data.result?.data?.[0]
  return Array.isArray(rawEmbedding) ? rawEmbedding : []
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  
  let dot = 0
  let magA = 0
  let magB = 0
  
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export async function scoreArticlesByEngagement(): Promise<number> {
  const db = getDb()
  
  const engaged = db.prepare(`
    SELECT article_title, content_snippet FROM engagement 
    WHERE event_type IN ('click', 'like') AND article_title IS NOT NULL
    ORDER BY timestamp DESC LIMIT 20
  `).all() as { article_title: string; content_snippet: string | null }[]

  if (engaged.length === 0) {
    console.log('[AI] No engagement data yet, using default score')
    db.prepare('UPDATE articles SET ai_score = 0.5 WHERE ai_score IS NULL').run()
    return 0
  }

  const engagedEmbeddings = await Promise.all(
    engaged.map(async e => {
      const text = `${e.article_title}${e.content_snippet ? ' ' + e.content_snippet : ''}`
      const emb = await getEmbedding(text)
      return emb.length > 0 ? emb : null
    })
  )
  
  const validEmbeddings = engagedEmbeddings.filter(e => e !== null)
  if (validEmbeddings.length === 0) {
    db.prepare('UPDATE articles SET ai_score = 0.5 WHERE ai_score IS NULL').run()
    return 0
  }

  const unscored = db.prepare(`
    SELECT a.*, f.title as feed_title FROM articles a
    JOIN feeds f ON a.feed_id = f.id
    WHERE a.ai_score IS NULL
    ORDER BY a.fetched_at DESC
    LIMIT 50
  `).all() as (Article & { feed_title: string })[]

  let scored = 0

  for (const article of unscored) {
    const text = `${article.feed_title}: ${article.title}${article.content_snippet ? ' ' + article.content_snippet : ''}`
    const articleEmbedding = await getEmbedding(text)
    
    if (articleEmbedding.length > 0) {
      const similarities = validEmbeddings.map(userEmb => cosineSimilarity(userEmb!, articleEmbedding))
      const maxSimilarity = Math.max(...similarities)
      let score = (maxSimilarity + 1) / 2
      
      score = score + (Math.random() - 0.5) * 0.1
      score = Math.max(0.1, Math.min(0.95, score))
      
      db.prepare('UPDATE articles SET ai_score = ? WHERE id = ?').run(score, article.id)
      scored++
    }
  }

  return scored
}

export async function scoreArticles(): Promise<number> {
  return scoreArticlesByEngagement()
}

export async function scoreAllArticles(): Promise<number> {
  return scoreArticles()
}