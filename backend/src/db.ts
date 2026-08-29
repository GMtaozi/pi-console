import { Pool, QueryResult } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

let pool: Pool | null = null;

function convertPlaceholders(sql: string): string {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}

export async function getDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/piconsole',
    });

    // Test connection
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    // Run schema migration — execute each statement separately
    const schemaPath = path.join(__dirname, '../migrations/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await pool.query(stmt + ';');
    }

    // Auto-seed demo user if users table is empty
    const userCheck = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    if (userCheck.rows[0].count === 0) {
      const userId = uuidv4();
      const hash = await bcrypt.hash('demo123', 10);
      await pool.query(
        'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [userId, 'demo', 'demo@pi.console', hash]
      );
      console.log('[DB] Seeded demo user: demo@pi.console / demo123');
    }
  }

  return {
    all: async (sql: string, params?: any[]): Promise<any[]> => {
      const result: QueryResult = await pool!.query(convertPlaceholders(sql), params || []);
      return result.rows;
    },
    get: async (sql: string, params?: any[]): Promise<any | null> => {
      const result: QueryResult = await pool!.query(convertPlaceholders(sql), params || []);
      return result.rows[0] || null;
    },
    run: async (sql: string, params?: any[]): Promise<{ lastID?: any; changes: number }> => {
      const result: QueryResult = await pool!.query(convertPlaceholders(sql), params || []);
      return { lastID: result.rows[0]?.id, changes: result.rowCount || 0 };
    },
    exec: async (sql: string): Promise<void> => {
      await pool!.query(sql);
    },
    query: async (sql: string, params?: any[]): Promise<QueryResult> => {
      return pool!.query(convertPlaceholders(sql), params || []);
    },
  };
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
