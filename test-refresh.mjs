import { getDb } from './src/lib/db.js';
import { fetchAllFeeds } from './src/lib/rss.js';

const result = await fetchAllFeeds(true);
console.log('Refresh result:', result);

// Check database state after refresh
const db = getDb();
const newest = db.prepare('SELECT MAX(published) as newest FROM articles').get();
console.log('Newest article after refresh:', newest.newest);

const count = db.prepare('SELECT COUNT(*) as cnt FROM articles').get();
console.log('Total articles:', count.cnt);
