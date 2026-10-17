/**
 * Seed integration test.
 *
 * Runs the full `seedDemoData()` against a real (test) database and asserts the
 * invariants the demo depends on. This catches regressions where a change to a
 * module's schema or seed logic silently breaks the demo dataset.
 *
 * Requires `TEST_DATABASE_URL` to point at a scratch database — the seed wipes
 * every table it touches, so it must never run against production data. When the
 * variable is absent (e.g. CI without a provisioned test DB) the suite skips
 * gracefully rather than failing.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { seedDemoData } from './demo-data';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

describe('demo data seed', () => {
  beforeAll(() => {
    if (!TEST_DB_URL) {
      console.log(
        '  SKIP — TEST_DATABASE_URL not set; seed integration test needs a scratch database.',
      );
    }
  });

  it('seeds to completion with consistent data across both organizations', async () => {
    if (!TEST_DB_URL) {
      return; // skipped — no scratch database available
    }

    // seedDemoData() reads process.env.DATABASE_URL internally. Point it at the
    // scratch database, run, then restore.
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = TEST_DB_URL;

    let prisma: PrismaClient | undefined;
    try {
      await seedDemoData();

      const pool = new Pool({ connectionString: TEST_DB_URL });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

      // ── Organizations ────────────────────────────────────────────────
      const orgs = await prisma.organization.findMany();
      expect(orgs.length).toBeGreaterThanOrEqual(2);
      const rohi = orgs.find((o) => o.name === 'Rohi Estate Management');
      const westhill = orgs.find((o) => o.name === 'Westhill Properties');
      expect(rohi).toBeDefined();
      expect(westhill).toBeDefined();

      // ── Rohi: full dataset ───────────────────────────────────────────
      const rohiLandlords = await prisma.landlord.count({
        where: { organizationId: rohi!.id },
      });
      const rohiProperties = await prisma.property.count({
        where: { organizationId: rohi!.id },
      });
      const rohiUnits = await prisma.unit.count({
        where: { property: { organizationId: rohi!.id } },
      });
      const rohiTenants = await prisma.tenant.count({
        where: { organizationId: rohi!.id },
      });
      expect(rohiLandlords).toBeGreaterThan(0);
      expect(rohiProperties).toBeGreaterThan(0);
      expect(rohiUnits).toBeGreaterThan(0);
      expect(rohiTenants).toBeGreaterThan(0);

      // ── Westhill: minimal starter dataset (Item 7) ───────────────────
      const westhillProperties = await prisma.property.count({
        where: { organizationId: westhill!.id },
      });
      const westhillUnits = await prisma.unit.count({
        where: { property: { organizationId: westhill!.id } },
      });
      const westhillTenants = await prisma.tenant.count({
        where: { organizationId: westhill!.id },
      });
      expect(westhillProperties).toBeGreaterThan(0);
      expect(westhillUnits).toBeGreaterThan(0);
      expect(westhillTenants).toBeGreaterThan(0);

      // ── Role assignments resolve for every staff login (fail loudly) ──
      const staffEmails = [
        'admin@rohi.co.ke',
        'manager@rohi.co.ke',
        'finance@rohi.co.ke',
        'maintenance@rohi.co.ke',
        'technician@rohi.co.ke',
        'procurement@rohi.co.ke',
        'leasing@rohi.co.ke',
        'admin@westhill.co.ke',
        'manager@westhill.co.ke',
        'accountant@westhill.co.ke',
        'maintenance@westhill.co.ke',
        'technician@westhill.co.ke',
        'procurement@westhill.co.ke',
        'leasing@westhill.co.ke',
      ];
      for (const email of staffEmails) {
        const user = await prisma.user.findUnique({ where: { email } });
        expect(user).toBeDefined();
        const assignments = await prisma.roleAssignment.count({
          where: { userId: user!.id },
        });
        expect(assignments).toBeGreaterThan(0);
      }

      // ── Super admin preserved (seed cleans non-admin users only) ─────
      const superAdmin = await prisma.user.findUnique({
        where: { email: 'admin@tuproperties.co.ke' },
      });
      expect(superAdmin).toBeDefined();
      expect(superAdmin!.role).toBe(UserRole.SUPER_ADMIN);

      // ── Item 1 — Notifications exist across channels and statuses ───
      const notifications = await prisma.notification.count({
        where: { organizationId: rohi!.id },
      });
      expect(notifications).toBeGreaterThan(0);
      const channels = await prisma.notification.groupBy({
        by: ['channel'],
        where: { organizationId: rohi!.id },
      });
      expect(channels.length).toBeGreaterThanOrEqual(2);

      const configs = await prisma.notificationChannelConfig.count({
        where: { organizationId: rohi!.id },
      });
      expect(configs).toBeGreaterThan(0);

      // ── Item 2 — Audit log entries exist ────────────────────────────
      const auditEntries = await prisma.auditLog.count({
        where: { organizationId: rohi!.id },
      });
      expect(auditEntries).toBeGreaterThan(0);

      // ── Item 5 — Move-out requests across statuses ──────────────────
      const moveOuts = await prisma.moveOutRequest.count({
        where: { organizationId: rohi!.id },
      });
      expect(moveOuts).toBeGreaterThan(0);
      const statuses = await prisma.moveOutRequest.groupBy({
        by: ['status'],
        where: { organizationId: rohi!.id },
      });
      expect(statuses.length).toBeGreaterThanOrEqual(2);

      // ── Item 6 — Contract scans cleaned on re-seed (no stale uploads) ───
      // The seed removes the uploads root before writing new scans; verify no
      // orphaned contract document rows point at missing files by checking that
      // every contract with a documentId has a matching Document row.
      const dangling = await prisma.contract.findMany({
        where: {
          organizationId: rohi!.id,
          documentId: { not: null },
          document: { is: null },
        },
      });
      expect(dangling.length).toBe(0);
    } finally {
      process.env.DATABASE_URL = previousUrl;
      await prisma?.$disconnect();
    }
  }, 120_000);
});
