import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data/syndicus.db');
const db = new Database(dbPath);

console.log('=== FEEDS ===');
const feeds = db.prepare('SELECT id, title, url, last_fetched FROM feeds').all();
console.log(JSON.stringify(feeds, null, 2));

console.log('\n=== ARTICLE STATS ===');
const count = db.prepare('SELECT COUNT(*) as cnt FROM articles').get();
console.log('Total articles:', count.cnt);

const oldest = db.prepare('SELECT MIN(published) as oldest FROM articles').get();
console.log('Oldest published:', oldest.oldest);

const newest = db.prepare('SELECT MAX(published) as newest FROM articles').get();
console.log('Newest published:', newest.newest);

console.log('\n=== ARTICLES BY FEED (with date range) ===');
const articlesByFeed = db.prepare(`
  SELECT f.title, f.url, COUNT(a.id) as article_count, 
         MIN(a.published) as oldest, MAX(a.published) as newest
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  GROUP BY f.id
`).all();
console.log(JSON.stringify(articlesByFeed, null, 2));

console.log('\n=== SAMPLE OLD ARTICLES ===');
const oldArticles = db.prepare(`
  SELECT a.title, a.published, a.fetched_at, f.title as feed
  FROM articles a
  JOIN feeds f ON a.feed_id = f.id
  ORDER BY a.published ASC
  LIMIT 10
`).all();
console.log(JSON.stringify(oldArticles, null, 2));

db.close();
