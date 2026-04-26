import { getDb, type Article } from './db'

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || ''
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || ''

const REQUEST_TIMEOUT = 30000

async function getEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error('[AI] Missing credentials')
    return texts.map(() => null)
  }

  if (texts.length === 0) return []

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: texts }),
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text()
      console.error('[AI] Embedding error:', response.status, errText)
      return texts.map(() => null)
    }

    const data = await response.json() as any
    const result = data.result
    
    if (!result?.data || !Array.isArray(result.data)) {
      console.error('[AI] Invalid response format')
      return texts.map(() => null)
    }

    return result.data.map((emb: number[] | null) => {
      return Array.isArray(emb) ? emb : null
    })
  } catch (err) {
    clearTimeout(timeoutId)
    console.error('[AI] Fetch error:', err)
    return texts.map(() => null)
  }
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
    console.log('[AI] No engagement data, using default score')
    db.prepare('UPDATE articles SET ai_score = 0.5 WHERE ai_score IS NULL').run()
    return 0
  }

  const engagedTexts = engaged.map(e => 
    `${e.article_title}${e.content_snippet ? ' ' + e.content_snippet : ''}`
  )

  console.log('[AI] Getting embeddings for', engagedTexts.length, 'engagement items')

  const engagedEmbeddings = await getEmbeddingsBatch(engagedTexts)
  const validUserEmbeds = engagedEmbeddings.filter((e): e is number[] => e !== null)

  if (validUserEmbeds.length === 0) {
    console.log('[AI] Failed to get embeddings, using default score')
    db.prepare('UPDATE articles SET ai_score = 0.5 WHERE ai_score IS NULL').run()
    return 0
  }

  const unscoredData = db.prepare(`
    SELECT a.*, f.title as feed_title, f.is_favorite as feed_is_favorite FROM articles a
    JOIN feeds f ON a.feed_id = f.id
    WHERE a.ai_score IS NULL
    ORDER BY a.fetched_at DESC
    LIMIT 15
  `).all() as (Article & { feed_title: string; feed_is_favorite: number })[]

  if (unscoredData.length === 0) return 0

  const unscoredTexts = unscoredData.map(a => 
    `${a.feed_title}: ${a.title}${a.content_snippet ? ' ' + a.content_snippet : ''}`
  )
  
  console.log('[AI] Getting embeddings for', unscoredTexts.length, 'articles')

  const unscoredEmbeddings = await getEmbeddingsBatch(unscoredTexts)

  const updates = db.transaction(() => {
    for (let i = 0; i < unscoredData.length; i++) {
      const article = unscoredData[i]
      const emb = unscoredEmbeddings[i]

      if (!emb) {
        db.prepare('UPDATE articles SET ai_score = 0.5 WHERE id = ?').run(article.id)
        continue
      }

      const similarities = validUserEmbeds.map(userEmb => cosineSimilarity(userEmb, emb))
      const maxSimilarity = Math.max(...similarities)
      let score = (maxSimilarity + 1) / 2
      if (article.feed_is_favorite) {
        score = Math.min(0.98, score + 0.15)
      }
      score = score + (Math.random() - 0.5) * 0.1
      score = Math.max(0.1, Math.min(0.98, score))

      db.prepare('UPDATE articles SET ai_score = ? WHERE id = ?').run(score, article.id)
    }
  })

  updates()
  return unscoredData.length
}

export async function scoreArticles(): Promise<number> {
  return scoreArticlesByEngagement()
}

export async function scoreAllArticles(): Promise<number> {
  return scoreArticles()
}