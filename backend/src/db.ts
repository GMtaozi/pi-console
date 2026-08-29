import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import fs from 'fs';
import path from 'path';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDb() {
  if (db) return db;
  const dbPath = process.env.DATABASE_PATH || './data/pi-console.db';
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
  const schemaPath = path.join(__dirname, '../migrations/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await db.exec(schema);
  return db;
}

export async function closeDb() {
  if (db) {
    await db.close();
    db = null;
  }
}
