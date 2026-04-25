import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, existsSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/syndicus.db')

const dbDir = path.dirname(dbPath)
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    try {
      db = new Database(dbPath)
      initSchema()
    } catch (err) {
      console.error('Failed to initialize database:', err)
      throw new Error('Database unavailable. Please check the data directory and permissions.')
    }
  }
  return db
}

function initSchema() {
  const db = getDb()
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      content_snippet TEXT,
      published TEXT,
      fetched_at TEXT NOT NULL,
      ai_score REAL,
      image_url TEXT,
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
      UNIQUE(feed_id, url)
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      last_fetched TEXT,
      favicon_url TEXT
    );

    CREATE TABLE IF NOT EXISTS engagement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_url TEXT NOT NULL,
      article_title TEXT,
      content_snippet TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('click', 'like')),
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY,
      prompt_text TEXT NOT NULL,
      dark_mode INTEGER DEFAULT 0
    );
  `)

  const prefs = db.prepare('SELECT * FROM preferences WHERE id = 1').get()
  if (!prefs) {
    db.prepare('INSERT INTO preferences (id, prompt_text, dark_mode) VALUES (1, ?, 0)').run('Show me interesting tech articles about AI, productivity, and new programming tools')
  }

  try {
    db.exec(`ALTER TABLE engagement ADD COLUMN article_title TEXT`)
    db.exec(`ALTER TABLE engagement ADD COLUMN content_snippet TEXT`)
  } catch {
  }

  try {
    db.exec(`ALTER TABLE articles ADD COLUMN image_url TEXT`)
  } catch {
  }

  try {
    db.exec(`ALTER TABLE feeds ADD COLUMN favicon_url TEXT`)
  } catch {
  }

  try {
    db.exec(`ALTER TABLE preferences ADD COLUMN dark_mode INTEGER DEFAULT 0`)
  } catch {
  }

  try {
    db.exec(`ALTER TABLE articles ADD COLUMN is_read INTEGER DEFAULT 0`)
  } catch {
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(is_read)`)
  } catch {
  }
}

export type Feed = { id: number; url: string; title: string; last_fetched: string | null; favicon_url: string | null }
export type Article = { id: number; feed_id: number; url: string; title: string; content_snippet: string | null; published: string | null; fetched_at: string; ai_score: number | null; image_url: string | null; is_read: number }
export type Engagement = { id: number; article_url: string; article_title: string | null; content_snippet: string | null; event_type: 'click' | 'like'; timestamp: string }
export type Preferences = { id: number; prompt_text: string; dark_mode: number }