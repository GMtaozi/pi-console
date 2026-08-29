import { Pool, QueryResult } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
const { DatabaseSync } = require('node:sqlite') as any;

let pool: Pool | null = null;
let sqliteDb: any | null = null;
let useSQLite = false;

function convertPlaceholders(sql: string): string {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}

async function initSQLite() {
  if (sqliteDb) return;
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '../data.sqlite');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');

  const schemaPath = path.join(__dirname, '../migrations/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      sqliteDb.exec(stmt + ';');
    } catch (err: any) {
      if (!err.message?.includes('already exists') && !err.message?.includes('duplicate column')) {
        console.warn('[DB] Schema stmt error:', err.message);
      }
    }
  }

  try {
    const userCheck = sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    if (userCheck.count === 0) {
      const userId = uuidv4();
      const hash = await bcrypt.hash('demo123', 10);
      sqliteDb.prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)').run(userId, 'demo', 'demo@pi.console', hash);
      console.log('[DB] Seeded demo user: demo@pi.console / demo123');
    }
  } catch (err: any) {
    console.warn('[DB] Seed user error:', err.message);
  }

  try {
    const templateCheck = sqliteDb.prepare('SELECT COUNT(*) as count FROM workflow_templates').get() as any;
    if (templateCheck.count === 0) {
      const templates = [
        {
          id: uuidv4(),
          name: '文章生成',
          description: '从主题生成完整文章的自动化工作流',
          category: 'content',
          nodes: JSON.stringify([
            { id: 'start', type: 'default', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
            { id: 'topic_input', type: 'default', label: '输入主题', position: { x: 300, y: 100 }, data: { label: '输入主题' } },
            { id: 'outline', type: 'default', label: '生成大纲', position: { x: 500, y: 100 }, data: { label: '生成大纲' } },
            { id: 'draft', type: 'default', label: '撰写正文', position: { x: 700, y: 100 }, data: { label: '撰写正文' } },
            { id: 'review', type: 'default', label: '审核优化', position: { x: 900, y: 100 }, data: { label: '审核优化' } },
            { id: 'end', type: 'default', label: 'End', position: { x: 1100, y: 100 }, data: { label: 'End' } },
          ]),
          edges: JSON.stringify([
            { id: 'e1', source: 'start', target: 'topic_input', label: '' },
            { id: 'e2', source: 'topic_input', target: 'outline', label: '' },
            { id: 'e3', source: 'outline', target: 'draft', label: '' },
            { id: 'e4', source: 'draft', target: 'review', label: '' },
            { id: 'e5', source: 'review', target: 'end', label: '' },
          ]),
        },
        {
          id: uuidv4(),
          name: '代码审查',
          description: '自动进行代码质量检查和改进建议',
          category: 'dev',
          nodes: JSON.stringify([
            { id: 'start', type: 'default', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
            { id: 'fetch_code', type: 'default', label: '获取代码', position: { x: 300, y: 100 }, data: { label: '获取代码' } },
            { id: 'static_check', type: 'default', label: '静态检查', position: { x: 500, y: 50 }, data: { label: '静态检查' } },
            { id: 'security_scan', type: 'default', label: '安全扫描', position: { x: 500, y: 150 }, data: { label: '安全扫描' } },
            { id: 'generate_report', type: 'default', label: '生成报告', position: { x: 700, y: 100 }, data: { label: '生成报告' } },
            { id: 'end', type: 'default', label: 'End', position: { x: 900, y: 100 }, data: { label: 'End' } },
          ]),
          edges: JSON.stringify([
            { id: 'e1', source: 'start', target: 'fetch_code', label: '' },
            { id: 'e2', source: 'fetch_code', target: 'static_check', label: '' },
            { id: 'e3', source: 'fetch_code', target: 'security_scan', label: '' },
            { id: 'e4', source: 'static_check', target: 'generate_report', label: '' },
            { id: 'e5', source: 'security_scan', target: 'generate_report', label: '' },
            { id: 'e6', source: 'generate_report', target: 'end', label: '' },
          ]),
        },
        {
          id: uuidv4(),
          name: '数据分析',
          description: '从原始数据到洞察报告的自动化流程',
          category: 'data',
          nodes: JSON.stringify([
            { id: 'start', type: 'default', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
            { id: 'load_data', type: 'default', label: '加载数据', position: { x: 300, y: 100 }, data: { label: '加载数据' } },
            { id: 'clean_data', type: 'default', label: '数据清洗', position: { x: 500, y: 100 }, data: { label: '数据清洗' } },
            { id: 'analyze', type: 'default', label: '分析建模', position: { x: 700, y: 100 }, data: { label: '分析建模' } },
            { id: 'visualize', type: 'default', label: '可视化', position: { x: 900, y: 100 }, data: { label: '可视化' } },
            { id: 'report', type: 'default', label: '生成报告', position: { x: 1100, y: 100 }, data: { label: '生成报告' } },
            { id: 'end', type: 'default', label: 'End', position: { x: 1300, y: 100 }, data: { label: 'End' } },
          ]),
          edges: JSON.stringify([
            { id: 'e1', source: 'start', target: 'load_data', label: '' },
            { id: 'e2', source: 'load_data', target: 'clean_data', label: '' },
            { id: 'e3', source: 'clean_data', target: 'analyze', label: '' },
            { id: 'e4', source: 'analyze', target: 'visualize', label: '' },
            { id: 'e5', source: 'visualize', target: 'report', label: '' },
            { id: 'e6', source: 'report', target: 'end', label: '' },
          ]),
        },
      ];
      for (const t of templates) {
        try {
          sqliteDb.prepare('INSERT INTO workflow_templates (id, name, description, category, nodes, edges) VALUES (?, ?, ?, ?, ?, ?)').run(t.id, t.name, t.description, t.category, t.nodes, t.edges);
        } catch {}
      }
      console.log('[DB] Seeded 3 workflow templates');
    }
  } catch (err: any) {
    console.warn('[DB] Seed templates error:', err.message);
  }
}

export async function getDb() {
  if (!useSQLite && !pool) {
    try {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/piconsole',
      });
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      const schemaPath = path.join(__dirname, '../migrations/schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      const statements = schema
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        try {
          await pool.query(stmt + ';');
        } catch (err: any) {
          if (!err.message?.includes('already exists') && !err.message?.includes('duplicate column')) {
            console.warn('[DB] Schema stmt error:', err.message);
          }
        }
      }

      const userCheck = await pool.query('SELECT COUNT(*) AS count FROM users');
      if (userCheck.rows[0].count === 0) {
        const userId = uuidv4();
        const hash = await bcrypt.hash('demo123', 10);
        await pool.query(
          'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [userId, 'demo', 'demo@pi.console', hash]
        );
        console.log('[DB] Seeded demo user: demo@pi.console / demo123');
      }

      const templateCheck = await pool.query('SELECT COUNT(*) AS count FROM workflow_templates');
      if (templateCheck.rows[0].count === 0) {
        const templates = [
          {
            id: uuidv4(),
            name: '文章生成',
            description: '从主题生成完整文章的自动化工作流',
            category: 'content',
            nodes: JSON.stringify([
              { id: 'start', type: 'default', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
              { id: 'topic_input', type: 'default', label: '输入主题', position: { x: 300, y: 100 }, data: { label: '输入主题' } },
              { id: 'outline', type: 'default', label: '生成大纲', position: { x: 500, y: 100 }, data: { label: '生成大纲' } },
              { id: 'draft', type: 'default', label: '撰写正文', position: { x: 700, y: 100 }, data: { label: '撰写正文' } },
              { id: 'review', type: 'default', label: '审核优化', position: { x: 900, y: 100 }, data: { label: '审核优化' } },
              { id: 'end', type: 'default', label: 'End', position: { x: 1100, y: 100 }, data: { label: 'End' } },
            ]),
            edges: JSON.stringify([
              { id: 'e1', source: 'start', target: 'topic_input', label: '' },
              { id: 'e2', source: 'topic_input', target: 'outline', label: '' },
              { id: 'e3', source: 'outline', target: 'draft', label: '' },
              { id: 'e4', source: 'draft', target: 'review', label: '' },
              { id: 'e5', source: 'review', target: 'end', label: '' },
            ]),
          },
          {
            id: uuidv4(),
            name: '代码审查',
            description: '自动进行代码质量检查和改进建议',
            category: 'dev',
            nodes: JSON.stringify([
              { id: 'start', type: 'default', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
              { id: 'fetch_code', type: 'default', label: '获取代码', position: { x: 300, y: 100 }, data: { label: '获取代码' } },
              { id: 'static_check', type: 'default', label: '静态检查', position: { x: 500, y: 50 }, data: { label: '静态检查' } },
              { id: 'security_scan', type: 'default', label: '安全扫描', position: { x: 500, y: 150 }, data: { label: '安全扫描' } },
              { id: 'generate_report', type: 'default', label: '生成报告', position: { x: 700, y: 100 }, data: { label: '生成报告' } },
              { id: 'end', type: 'default', label: 'End', position: { x: 900, y: 100 }, data: { label: 'End' } },
            ]),
            edges: JSON.stringify([
              { id: 'e1', source: 'start', target: 'fetch_code', label: '' },
              { id: 'e2', source: 'fetch_code', target: 'static_check', label: '' },
              { id: 'e3', source: 'fetch_code', target: 'security_scan', label: '' },
              { id: 'e4', source: 'static_check', target: 'generate_report', label: '' },
              { id: 'e5', source: 'security_scan', target: 'generate_report', label: '' },
              { id: 'e6', source: 'generate_report', target: 'end', label: '' },
            ]),
          },
          {
            id: uuidv4(),
            name: '数据分析',
            description: '从原始数据到洞察报告的自动化流程',
            category: 'data',
            nodes: JSON.stringify([
              { id: 'start', type: 'default', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
              { id: 'load_data', type: 'default', label: '加载数据', position: { x: 300, y: 100 }, data: { label: '加载数据' } },
              { id: 'clean_data', type: 'default', label: '数据清洗', position: { x: 500, y: 100 }, data: { label: '数据清洗' } },
              { id: 'analyze', type: 'default', label: '分析建模', position: { x: 700, y: 100 }, data: { label: '分析建模' } },
              { id: 'visualize', type: 'default', label: '可视化', position: { x: 900, y: 100 }, data: { label: '可视化' } },
              { id: 'report', type: 'default', label: '生成报告', position: { x: 1100, y: 100 }, data: { label: '生成报告' } },
              { id: 'end', type: 'default', label: 'End', position: { x: 1300, y: 100 }, data: { label: 'End' } },
            ]),
            edges: JSON.stringify([
              { id: 'e1', source: 'start', target: 'load_data', label: '' },
              { id: 'e2', source: 'load_data', target: 'clean_data', label: '' },
              { id: 'e3', source: 'clean_data', target: 'analyze', label: '' },
              { id: 'e4', source: 'analyze', target: 'visualize', label: '' },
              { id: 'e5', source: 'visualize', target: 'report', label: '' },
              { id: 'e6', source: 'report', target: 'end', label: '' },
            ]),
          },
        ];
        for (const t of templates) {
          await pool.query(
            'INSERT INTO workflow_templates (id, name, description, category, nodes, edges) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
            [t.id, t.name, t.description, t.category, t.nodes, t.edges]
          );
        }
        console.log('[DB] Seeded 3 workflow templates');
      }
    } catch (err: any) {
      console.warn('[DB] PostgreSQL unavailable, falling back to SQLite:', err.message);
      useSQLite = true;
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
      await initSQLite();
    }
  }

  if (useSQLite) {
    if (!sqliteDb) await initSQLite();
    return {
      all: async (sql: string, params?: any[]): Promise<any[]> => {
        const stmt = sqliteDb!.prepare(sql);
        return stmt.all(...(params || [])) as any[];
      },
      get: async (sql: string, params?: any[]): Promise<any | null> => {
        const stmt = sqliteDb!.prepare(sql);
        return (stmt.get(...(params || [])) as any) || null;
      },
      run: async (sql: string, params?: any[]): Promise<{ lastID?: any; changes: number }> => {
        const stmt = sqliteDb!.prepare(sql);
        const result = stmt.run(...(params || []));
        return { lastID: result.lastInsertRowid, changes: result.changes };
      },
      exec: async (sql: string): Promise<void> => {
        sqliteDb!.exec(sql);
      },
      query: async (sql: string, params?: any[]): Promise<QueryResult> => {
        const stmt = sqliteDb!.prepare(sql);
        const rows = stmt.all(...(params || [])) as any[];
        return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult;
      },
    };
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
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}
