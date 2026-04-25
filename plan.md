# FeedCurator - AI Curated RSS Reader

## Overview

A web-based, self-hosted RSS reader that uses Cloudflare Workers AI to curate a custom feed based on user preferences. Single container with persistent engagement tracking.

## Architecture

| Component | Technology |
|-----------|------------|
| Full Stack | TanStack Start (React 19 SSR) |
| Database | SQLite (better-sqlite3) |
| LLM | Cloudflare Workers AI (REST API) |
| Container | Docker + Docker Compose |

## Core Features

### 1. RSS Feed Ingestion
- Add feeds via UI form (URL input)
- Background scheduler fetches feeds periodically
- Parses Atom/RSS with `feedparser`

### 2. AI Curated Feed
- User sets preferences (text prompt stored in DB)
- Backend sends article titles/snippets to Cloudflare AI
- AI scores each article 0-1 based on preferences
- Articles sorted by score descending

### 3. Engagement Tracking
- Track: clicks (read), likes
- Store in SQLite with article hash (URL + title)
- Engagement history passed to AI for better scoring

### 4. Web UI
- Scrollable article list (TanStack Virtual)
- Each item: title, source, preview, like/click buttons
- Settings page: manage feeds, set AI preferences

## Data Model

```sql
-- feeds
id, url, title, last_fetched

-- articles
id, feed_id, url, title, content_snippet, published, fetched_at, ai_score

-- engagement
id, article_url, event_type ('click'|'like'), timestamp

-- preferences
id, prompt_text
```

## API Endpoints

| Method | Path | Description |
|--------|-----|-------------|
| GET | `/api/articles` | Get curated articles |
| POST | `/api/feeds` | Add RSS feed |
| GET | `/api/feeds` | List feeds |
| DELETE | `/api/feeds/{id}` | Remove feed |
| POST | `/api/engagement` | Record click/like |
| PUT | `/api/preferences` | Set AI prompt |

## Cloudflare Integration (Node.js)

```typescript
async function queryAI(prompt: string, articleText: string): Promise<number> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: `Score 0-1 how relevant this article is to: ${prompt}\n\nArticle: ${articleText}\n\nScore:`
      }),
    }
  )
  const data = await response.json()
  return parseFloat(data.result.response.trim())
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| CLOUDFLARE_ACCOUNT_ID | Cloudflare Account ID |
| CLOUDFLARE_API_TOKEN | Cloudflare API Token |
| DATABASE_PATH | Path to SQLite database (default: ./data/syndicus.db) |
| RSS_FETCH_INTERVAL | Minutes between feed fetches (default: 30) |

## File Structure

```
/app
├── src/
│   ├── app.tsx                     # App entry
│   ├── main.tsx                    # Server entry
│   ├── router.tsx                  # Router factory
│   ├── routeTree.gen.ts            # Auto-generated route tree
│   ├── routes/
│   │   ├── index.tsx               # Home/feed page
│   │   ├── settings.tsx            # Settings page
│   │   └── api/
│   │       ├── articles.ts         # Articles API
│   │       ├── feeds.ts            # Feeds API
│   │       ├── engagement.ts        # Engagement API
│   │       └── preferences.ts       # Preferences API
│   ├── components/                 # UI components
│   ├── lib/
│   │   ├── db.ts                   # SQLite client
│   │   ├── rss.ts                  # RSS fetching
│   │   └── ai.ts                   # Cloudflare AI
│   └── styles/                     # CSS
├── package.json
├── vite.config.ts
├── tsconfig.json
└── Dockerfile
```

## Docker Deployment

```yaml
services:
  app:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./data:/data
    environment:
      - CLOUDFLARE_ACCOUNT_ID
      - CLOUDFLARE_API_TOKEN
```

## Estimated Container Size

~150MB (Python + Node.js base layers)

## Roadmap

- [x] Set up dependencies (better-sqlite3, feedparser, cross-fetch)
- [x] Create SQLite schema and DB client
- [x] Implement RSS fetching service
- [x] Add Cloudflare AI scoring
- [x] Build API routes (server functions)
- [x] Build React frontend UI
- [x] Add engagement tracking
- [x] Create feed management UI
- [ ] Docker deployment
- [ ] Test and document