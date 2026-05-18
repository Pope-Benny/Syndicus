import { getDb } from './src/lib/db.js';
import { fetchAllFeeds, clearOldArticles } from './src/lib/rss.js';

console.log('=== BEFORE REFRESH ===');
const db = getDb();
const beforeCount = db.prepare('SELECT COUNT(*) as cnt FROM articles').get().cnt;
const beforeNewest = db.prepare('SELECT MAX(published) as newest FROM articles').get().newest;
console.log('Articles:', beforeCount);
console.log('Newest published:', beforeNewest);

console.log('\n=== CLEARING OLD ARTICLES ===');
const cleared = await clearOldArticles();
console.log('Cleared:', cleared);

console.log('\n=== FORCED REFRESH ===');
const result = await fetchAllFeeds(true);
console.log('Refresh result:', result);

console.log('\n=== AFTER REFRESH ===');
const afterCount = db.prepare('SELECT COUNT(*) as cnt FROM articles').get().cnt;
const afterNewest = db.prepare('SELECT MAX(published) as newest FROM articles').get().newest;
console.log('Articles:', afterCount);
console.log('Newest published:', afterNewest);

// Check Hacker News specifically
const hnArticles = db.prepare(`
  SELECT title, published, fetched_at 
  FROM articles 
  WHERE feed_id = (SELECT id FROM feeds WHERE url LIKE '%ycombinator%')
  ORDER BY published DESC
  LIMIT 5
`).all();
console.log('\n=== HACKER NEWS - NEWEST 5 ===');
hnArticles.forEach(a => console.log(a.published, '-', a.title?.slice(0, 50)));
