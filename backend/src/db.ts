import { Pool, QueryResult } from 'pg';
import fs from 'fs';
import path from 'path';

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

    // Run schema migration
    const schemaPath = path.join(__dirname, '../migrations/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schema);
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
  };
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
