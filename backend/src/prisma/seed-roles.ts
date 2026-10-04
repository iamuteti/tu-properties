// Re-seed the system roles without wiping the database.
//
// `npx prisma db seed` / `npm run db:seed:demo` run the full demo seed, which
// deletes every table first. This exists for the other case: a change to
// `roles-seed.ts` (a new permission module, a changed role matrix) needs to reach
// the database without destroying the demo data. Module 9's `work_orders` /
// `assets` / `pm_schedules` permissions are exactly that case — master doc issue
// 36 records that a permission added to the seed but not the database is denied
// to everybody, including admins.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { seedRoles } from './roles-seed';

dotenv.config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await seedRoles(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
