import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET environment variable is required and must be at least 32 characters long.');
  process.exit(1);
}

export type AuthRequest = FastifyRequest & {
  user?: { id: string; username: string; email: string };
};

// SEC-013: In-memory token blacklist for revocation
const tokenBlacklist = new Set<string>();

export function addToTokenBlacklist(token: string): void {
  tokenBlacklist.add(token);
}

export function isTokenBlacklisted(token: string): boolean {
  return tokenBlacklist.has(token);
}

export async function authenticate(request: AuthRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  // SEC-013: Check token blacklist
  if (isTokenBlacklisted(token)) {
    return reply.status(401).send({ error: 'Token has been revoked' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as unknown as { id: string; username: string; email: string };
    request.user = decoded;
  } catch {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}
