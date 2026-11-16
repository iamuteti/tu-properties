import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { seedDemoData } from './demo-data';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // `seedDemoData()` owns the wipe: it deletes every organization and every user
  // that is not a SUPER_ADMIN, then re-seeds the system roles and the demo
  // dataset. This file used to keep a second, hand-maintained copy of that clean
  // list, which drifted (suppliers and the chart of accounts leaked) and made
  // `db:reset:demo` wipe and rebuild everything twice.
  //
  // The platform admin is preserved by that wipe on purpose, so ensure it exists
  // with an upsert rather than deleting and re-creating the users table first.
  const passwordHash = await bcrypt.hash('Password123!', 10);
  await prisma.user.upsert({
    where: { email: 'admin@tuproperties.co.ke' },
    update: {
      role: UserRole.SUPER_ADMIN,
      emailVerified: true,
    },
    create: {
      email: 'admin@tuproperties.co.ke',
      firstName: 'Super',
      lastName: 'Admin',
      phone: '+254700000001',
      passwordHash,
      emailVerified: true,
      role: UserRole.SUPER_ADMIN,
    },
  });

  // Organizations, users, roles and business data (Westhill + Rohi + markets).
  await seedDemoData();

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
