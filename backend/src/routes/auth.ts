import { FastifyInstance, FastifyReply } from 'fastify';
import { AuthRequest, authenticate } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// SEC-007: Zod schemas for input validation
const RegisterSchema = z.object({
  username: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request: AuthRequest, reply: FastifyReply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { username, email, password } = parsed.data;
    // Password strength validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      return reply.status(400).send({
        error: 'Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, and one number',
      });
    }
    const db = await getDb();
    const existing = await db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing) {
      return reply.status(409).send({ error: 'User already exists' });
    }
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    await db.run(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
      [id, username, email, passwordHash]
    );
    const token = jwt.sign({ id, username, email }, JWT_SECRET, { expiresIn: '7d' });
    return reply.send({ token, user: { id, username, email } });
  });

  app.post('/login', async (request: AuthRequest, reply: FastifyReply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { email, password } = parsed.data;
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return reply.send({ token, user: { id: user.id, username: user.username, email: user.email } });
  });

  // SEC-013: Token revocation — logout endpoint
  app.post('/logout', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // Add token to blacklist (handled by middleware)
      const { addToTokenBlacklist } = await import('../middleware/auth');
      addToTokenBlacklist(token);
    }
    return reply.send({ success: true });
  });
}
