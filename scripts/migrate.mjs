import { migrateDatabase } from '../db/sqlite.mjs';
migrateDatabase();
console.log('Database migrations are up to date.');
