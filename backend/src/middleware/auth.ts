import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET environment variable is required and must be at least 32 characters long.');
  process.exit(1);
}

export interface AuthRequest extends FastifyRequest {
  user?: { id: string; username: string; email: string };
}

export async function authenticate(request: AuthRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as unknown as { id: string; username: string; email: string };
    request.user = decoded;
  } catch {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}
