# Syndicus

An AI-curated RSS reader with a classic newspaper aesthetic. Syndicus fetches articles from RSS feeds, uses AI to score their relevance and quality, and presents them in a beautifully designed interface.

![Syndicus](https://img.shields.io/badge/React-19-blue) ![TanStack%20Start](https://img.shields.io/badge/TanStack%20Start-purple) ![TypeScript-blue](https://img.shields.io/badge/TypeScript-blue)

## Features

- **RSS Feed Aggregation** - Subscribe to multiple RSS feeds
- **AI-Powered Scoring** - Articles are scored using AI to highlight the most relevant content
- **Dark/Light Mode** - Toggle between modes via the hamburger menu
- **Automatic Refresh** - Fetch new articles on demand
- **Read/Unread Tracking** - Track which articles you've already read
- **Like & Dismiss** - Like articles to save or dismiss to hide
- **Mobile Responsive** - Works on desktop and mobile devices

## Tech Stack

- **React 19** - UI framework
- **TanStack Start** - Full-stack React framework with SSR
- **TanStack Router** - File-based routing
- **Vite 8** - Build tool
- **SQLite (better-sqlite3)** - Local database
- **TypeScript** - Type safety

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app runs at `http://localhost:3000`.

## Production

```bash
# Build for production
npm run build

# Run the production server
node server.prod.ts
```

Or use Docker:

```bash
docker-compose up --build
```

## Project Structure

```
src/
├── routes/
│   ├── __root.tsx      # Root layout
│   ├── index.tsx        # Main feed page
│   └── settings.tsx      # Settings page
├── lib/
│   ├── db.ts          # Database utilities
│   ├── rss.ts        # RSS feed fetching
│   ├── ai.ts         # AI scoring
│   └── useServerFn.ts  # Server function utilities
├── router.tsx         # Router configuration
└── styles.css         # Global styles
```

## Adding New Feeds

Feeds can be added through the Settings page. Each feed is periodically fetched and new articles are scored by the AI.

## Keyboard Shortcuts

- Scroll down to load more articles
- Use the hamburger menu (top-right) to access settings, toggle theme, and refresh feeds

## Theme

Syndicus features a classic newspaper aesthetic with cream-colored backgrounds, serif fonts (Playfair Display, Crimson Pro), and subtle sepia accents. The design draws inspiration from traditional print newspapers.