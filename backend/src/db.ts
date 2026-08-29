import { Pool, QueryResult } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

let pool: Pool | null = null;

export async function getDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/piconsole',
    });

    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    // Run schema migrations
    const migrationsDir = path.join(__dirname, '../migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).sort();

    for (const file of migrationFiles) {
      if (!file.endsWith('.sql')) continue;
      const migrationPath = path.join(migrationsDir, file);
      const migration = fs.readFileSync(migrationPath, 'utf-8');
      const statements = migration
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        try {
          await pool.query(stmt + ';');
        } catch (err: any) {
          if (!err.message?.includes('already exists') && !err.message?.includes('duplicate column') && !err.message?.includes('does not exist')) {
            console.warn(`[DB] Migration ${file} stmt error:`, err.message);
          }
        }
      }
    }

    // Seed demo user
    const userCheck = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    if (userCheck.rows[0].count === 0) {
      const userId = uuidv4();
      const hash = await bcrypt.hash('demo123', 10);
      await pool.query(
        'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)',
        [userId, 'demo', 'demo@example.com', hash]
      );
    }
  }

  return {
    query: (text: string, params?: any[]): Promise<QueryResult> => pool!.query(text, params),
    all: async (text: string, params?: any[]): Promise<any[]> => {
      const result = await pool!.query(text, params);
      return result.rows;
    },
    get: async (text: string, params?: any[]): Promise<any | undefined> => {
      const result = await pool!.query(text, params);
      return result.rows[0];
    },
    run: async (text: string, params?: any[]): Promise<void> => {
      await pool!.query(text, params);
    },
  };
}
