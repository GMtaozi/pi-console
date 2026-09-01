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

// SEC-013: Token blacklist with TTL (token -> expiration timestamp)
const tokenBlacklist = new Map<string, number>();

export function addToTokenBlacklist(token: string): void {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    const exp = decoded?.exp;
    if (exp) {
      tokenBlacklist.set(token, exp * 1000); // convert to ms
    } else {
      // Fallback: 7 days from now
      tokenBlacklist.set(token, Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  } catch {
    // If decode fails, set a short TTL (1 hour)
    tokenBlacklist.set(token, Date.now() + 60 * 60 * 1000);
  }
}

function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [token, expiry] of tokenBlacklist.entries()) {
    if (expiry < now) {
      tokenBlacklist.delete(token);
    }
  }
}

export function isTokenBlacklisted(token: string): boolean {
  cleanupExpiredTokens();
  return tokenBlacklist.has(token);
}

export async function authenticate(request: AuthRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  // SEC-013: Check token blacklist (with TTL cleanup)
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
