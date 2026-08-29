import 'dotenv/config';
import { buildServer } from './server';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
