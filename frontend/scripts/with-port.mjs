import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const cmd = process.argv[2] || 'dev';
const envPath = resolve('.env');
let port = '3000';

try {
  const env = readFileSync(envPath, 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('PORT='));
  if (line) {
    port = line.split('=')[1].trim();
  }
} catch {
  // .env missing or unreadable — fall back to Next.js default
}

execSync(`next ${cmd} -p ${port}`, { stdio: 'inherit' });
