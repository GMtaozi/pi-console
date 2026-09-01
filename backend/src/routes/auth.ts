import { FastifyInstance, FastifyReply } from 'fastify';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request: AuthRequest, reply: FastifyReply) => {
    const { username, email, password } = request.body as any;
    if (!username || !email || !password) {
      return reply.status(400).send({ error: 'Missing fields' });
    }
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
    const { email, password } = request.body as any;
    if (!email || !password) {
      return reply.status(400).send({ error: 'Missing fields' });
    }
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
}
