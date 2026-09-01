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

    // Seed demo user (only in development or when explicitly enabled)
    const shouldSeedDemo = process.env.NODE_ENV === 'development' || process.env.SEED_DEMO_USER === 'true';
    if (shouldSeedDemo) {
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

    // Seed workflow templates
    const templateCheck = await pool.query('SELECT COUNT(*)::int AS count FROM workflow_templates');
    if (templateCheck.rows[0].count === 0) {
      const templates = [
        {
          name: '文章生成',
          description: '从主题生成完整文章的自动化工作流',
          category: 'content',
          nodes: [
            { id: 'start', type: 'start', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
            { id: 'topic_input', type: 'llm', label: '输入主题', position: { x: 300, y: 100 }, data: { label: '输入主题', model: 'gpt-4o' } },
            { id: 'outline', type: 'llm', label: '生成大纲', position: { x: 500, y: 100 }, data: { label: '生成大纲', model: 'gpt-4o' } },
            { id: 'draft', type: 'llm', label: '撰写正文', position: { x: 700, y: 100 }, data: { label: '撰写正文', model: 'gpt-4o' } },
            { id: 'review', type: 'llm', label: '审核优化', position: { x: 900, y: 100 }, data: { label: '审核优化', model: 'gpt-4o' } },
            { id: 'end', type: 'end', label: 'End', position: { x: 1100, y: 100 }, data: { label: 'End' } },
          ],
          edges: [
            { id: 'e1', source: 'start', target: 'topic_input' },
            { id: 'e2', source: 'topic_input', target: 'outline' },
            { id: 'e3', source: 'outline', target: 'draft' },
            { id: 'e4', source: 'draft', target: 'review' },
            { id: 'e5', source: 'review', target: 'end' },
          ],
        },
        {
          name: '代码审查',
          description: '自动进行代码质量检查和改进建议',
          category: 'dev',
          nodes: [
            { id: 'start', type: 'start', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
            { id: 'fetch_code', type: 'tool', label: '获取代码', position: { x: 300, y: 100 }, data: { label: '获取代码' } },
            { id: 'static_check', type: 'llm', label: '静态检查', position: { x: 500, y: 50 }, data: { label: '静态检查', model: 'gpt-4o' } },
            { id: 'security_scan', type: 'llm', label: '安全扫描', position: { x: 500, y: 150 }, data: { label: '安全扫描', model: 'gpt-4o' } },
            { id: 'generate_report', type: 'llm', label: '生成报告', position: { x: 700, y: 100 }, data: { label: '生成报告', model: 'gpt-4o' } },
            { id: 'end', type: 'end', label: 'End', position: { x: 900, y: 100 }, data: { label: 'End' } },
          ],
          edges: [
            { id: 'e1', source: 'start', target: 'fetch_code' },
            { id: 'e2', source: 'fetch_code', target: 'static_check' },
            { id: 'e3', source: 'fetch_code', target: 'security_scan' },
            { id: 'e4', source: 'static_check', target: 'generate_report' },
            { id: 'e5', source: 'security_scan', target: 'generate_report' },
            { id: 'e6', source: 'generate_report', target: 'end' },
          ],
        },
        {
          name: '数据分析',
          description: '从原始数据到洞察报告的自动化流程',
          category: 'data',
          nodes: [
            { id: 'start', type: 'start', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
            { id: 'load_data', type: 'tool', label: '加载数据', position: { x: 300, y: 100 }, data: { label: '加载数据' } },
            { id: 'clean_data', type: 'llm', label: '数据清洗', position: { x: 500, y: 100 }, data: { label: '数据清洗', model: 'gpt-4o' } },
            { id: 'analyze', type: 'llm', label: '分析建模', position: { x: 700, y: 100 }, data: { label: '分析建模', model: 'gpt-4o' } },
            { id: 'visualize', type: 'llm', label: '可视化', position: { x: 900, y: 100 }, data: { label: '可视化', model: 'gpt-4o' } },
            { id: 'report', type: 'llm', label: '生成报告', position: { x: 1100, y: 100 }, data: { label: '生成报告', model: 'gpt-4o' } },
            { id: 'end', type: 'end', label: 'End', position: { x: 1300, y: 100 }, data: { label: 'End' } },
          ],
          edges: [
            { id: 'e1', source: 'start', target: 'load_data' },
            { id: 'e2', source: 'load_data', target: 'clean_data' },
            { id: 'e3', source: 'clean_data', target: 'analyze' },
            { id: 'e4', source: 'analyze', target: 'visualize' },
            { id: 'e5', source: 'visualize', target: 'report' },
            { id: 'e6', source: 'report', target: 'end' },
          ],
        },
      ];

      // Add 4th preset template: multi-turn conversation
      templates.push({
        name: '多轮对话',
        description: '支持上下文延续的多轮对话工作流',
        category: 'conversation',
        nodes: [
          { id: 'start', type: 'start', label: 'Start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
          { id: 'llm_1', type: 'llm', label: '首轮回复', position: { x: 300, y: 100 }, data: { label: '首轮回复', model: 'gpt-4o' } },
          { id: 'llm_2', type: 'llm', label: '深度追问', position: { x: 500, y: 100 }, data: { label: '深度追问', model: 'gpt-4o' } },
          { id: 'llm_3', type: 'llm', label: '总结输出', position: { x: 700, y: 100 }, data: { label: '总结输出', model: 'gpt-4o' } },
          { id: 'end', type: 'end', label: 'End', position: { x: 900, y: 100 }, data: { label: 'End' } },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'llm_1' },
          { id: 'e2', source: 'llm_1', target: 'llm_2' },
          { id: 'e3', source: 'llm_2', target: 'llm_3' },
          { id: 'e4', source: 'llm_3', target: 'end' },
        ],
      });

      for (const t of templates) {
        await pool.query(
          'INSERT INTO workflow_templates (id, name, description, category, nodes, edges) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
          [uuidv4(), t.name, t.description, t.category, JSON.stringify(t.nodes), JSON.stringify(t.edges)]
        );
      }
      console.log('[DB] Seeded 4 workflow templates');
    }
  }

  function convertPlaceholders(text: string): string {
    let idx = 0;
    return text.replace(/\?/g, () => `$${++idx}`);
  }

  const dbQuery = (text: string, params?: any[]): Promise<QueryResult> => pool!.query(convertPlaceholders(text), params);

  return {
    query: dbQuery,
    all: async (text: string, params?: any[]): Promise<any[]> => {
      const result = await pool!.query(convertPlaceholders(text), params);
      return result.rows;
    },
    get: async (text: string, params?: any[]): Promise<any | undefined> => {
      const result = await pool!.query(convertPlaceholders(text), params);
      return result.rows[0];
    },
    run: async (text: string, params?: any[]): Promise<void> => {
      await pool!.query(convertPlaceholders(text), params);
    },
    transaction: async <T>(fn: (client: { query: (text: string, params?: any[]) => Promise<QueryResult>; run: (text: string, params?: any[]) => Promise<void> }) => Promise<T>): Promise<T> => {
      const client = await pool!.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: (text: string, params?: any[]) => client.query(convertPlaceholders(text), params),
          run: async (text: string, params?: any[]) => { await client.query(convertPlaceholders(text), params); },
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
