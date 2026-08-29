import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const execAsync = promisify(exec);

// Path where backend package.json lives; extensions installed as npm deps here
const BACKEND_ROOT = path.resolve(__dirname, '../..');

export async function extensionRoutes(app: FastifyInstance) {
  app.get('/extensions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM extensions WHERE user_id = ? ORDER BY created_at DESC', [request.user!.id]);
    // Never expose any potential package internals beyond what we store
    return reply.send({ data: rows });
  });

  app.post('/extensions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { name, description, version, enabled, config, package_name } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'Name required' });
    const db = await getDb();
    const id = uuidv4();
    await db.run(
      'INSERT INTO extensions (id, user_id, name, description, version, enabled, config, package_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, request.user!.id, name, description || '', version || '1.0.0', enabled ? 1 : 0, typeof config === 'string' ? config : JSON.stringify(config || {}), package_name || name]
    );
    const row = await db.get('SELECT * FROM extensions WHERE id = ?', [id]);
    return reply.status(201).send(row);
  });

  app.delete('/extensions/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const ext = await db.get('SELECT * FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!ext) return reply.status(404).send({ error: 'Extension not found' });

    // If installed, uninstall npm package first
    if (ext.installed_version && ext.package_name) {
      try {
        await execAsync(`npm uninstall ${ext.package_name}`, { cwd: BACKEND_ROOT, timeout: 60000 });
      } catch (err: any) {
        console.error(`[Extension] Uninstall error for ${ext.package_name}:`, err.stderr || err.message);
      }
    }

    await db.run('DELETE FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    return reply.send({ success: true });
  });

  app.post('/extensions/:id/install', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const ext = await db.get('SELECT * FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!ext) return reply.status(404).send({ error: 'Extension not found' });

    const packageName = ext.package_name || ext.name;
    const targetVersion = ext.version || 'latest';

    try {
      const { stdout, stderr } = await execAsync(
        `npm install ${packageName}@${targetVersion}`,
        { cwd: BACKEND_ROOT, timeout: 120000 }
      );

      // Try to require the package and introspect exports
      let exportsList: string[] = [];
      let installedVersion = targetVersion;
      try {
        // Clear require cache to pick up newly installed module
        const modulePath = require.resolve(packageName);
        delete require.cache[modulePath];
        const mod = require(packageName);
        exportsList = Object.keys(mod).filter((k) => typeof mod[k] === 'function');

        // Try to read installed version from package.json
        const pkgJsonPath = path.join(BACKEND_ROOT, 'node_modules', packageName, 'package.json');
        const pkgJson = require(pkgJsonPath);
        installedVersion = pkgJson.version || targetVersion;
      } catch (loadErr: any) {
        console.warn(`[Extension] Could not introspect ${packageName}:`, loadErr.message);
      }

      await db.run(
        'UPDATE extensions SET install_path = ?, installed_version = ?, exports = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [path.join(BACKEND_ROOT, 'node_modules', packageName), installedVersion, JSON.stringify(exportsList), id]
      );

      const row = await db.get('SELECT * FROM extensions WHERE id = ?', [id]);
      return reply.send({ success: true, data: row, npmOutput: stdout, npmError: stderr || undefined });
    } catch (err: any) {
      console.error(`[Extension] Install failed for ${packageName}:`, err);
      return reply.status(500).send({
        error: 'Install failed',
        detail: err.stderr || err.message || String(err),
      });
    }
  });

  app.post('/extensions/:id/uninstall', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const ext = await db.get('SELECT * FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!ext) return reply.status(404).send({ error: 'Extension not found' });

    const packageName = ext.package_name || ext.name;

    try {
      const { stdout, stderr } = await execAsync(
        `npm uninstall ${packageName}`,
        { cwd: BACKEND_ROOT, timeout: 60000 }
      );

      await db.run(
        'UPDATE extensions SET install_path = NULL, installed_version = NULL, exports = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify([]), id]
      );

      const row = await db.get('SELECT * FROM extensions WHERE id = ?', [id]);
      return reply.send({ success: true, data: row, npmOutput: stdout, npmError: stderr || undefined });
    } catch (err: any) {
      console.error(`[Extension] Uninstall failed for ${packageName}:`, err);
      return reply.status(500).send({
        error: 'Uninstall failed',
        detail: err.stderr || err.message || String(err),
      });
    }
  });
}
