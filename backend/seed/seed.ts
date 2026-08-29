import 'dotenv/config';
import { getDb, closeDb } from '../src/db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

async function seed() {
  const db = await getDb();
  const userId = uuidv4();
  const hash = await bcrypt.hash('demo123', 10);
  await db.run(
    'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING',
    [userId, 'demo', 'demo@pi.console', hash]
  );
  console.log('Seeded user: demo@pi.console / demo123');
  await closeDb();
}

seed().catch(console.error);
