import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

/**
 * Give the units that already exist a kind of unit, and a deposit rule for it.
 *
 * The kind of unit used to be a free-text string on the unit
 * (`Unit.type`), which is why it could disagree with the unit's own bedroom
 * count and why a deposit rule had nothing controlled to hang off. Units now
 * point at a `PropertyUnitType`, and a property declares its own types.
 *
 * This script does that for an estate that already has units, without
 * touching anything else: it reads each unit's bedroom count, makes a type
 * for each distinct count, points the units at it, and gives each type a
 * deposit rule of one month's rent (two for a commercial property, where
 * leases run longer and the owner asks for more).
 *
 * It is safe to run twice: a property that already has types is left alone.
 *
 *   npm run db:backfill:unit-types
 */
dotenv.config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const properties = await prisma.property.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      _count: { select: { unitTypes: true } },
    },
  });

  let touched = 0;

  for (const property of properties) {
    if (property._count.unitTypes > 0) {
      console.log(`  ${property.name}: already has unit types — left alone.`);
      continue;
    }

    const units = await prisma.unit.findMany({
      where: { propertyId: property.id },
      select: { id: true, bedrooms: true, name: true },
    });
    if (units.length === 0) continue;

    // One type per distinct bedroom count, which is what the estate was
    // describing with the old string in the first place.
    const byBedrooms = new Map<number, string[]>();
    for (const unit of units) {
      const bedrooms = unit.bedrooms ?? 1;
      const list = byBedrooms.get(bedrooms) ?? [];
      list.push(unit.id);
      byBedrooms.set(bedrooms, list);
    }

    const commercial = property.category !== 'residential';
    const months = commercial ? 2 : 1;

    for (const [bedrooms, unitIds] of byBedrooms) {
      const code = bedrooms === 0 ? 'STUDIO' : `${bedrooms}B`;
      const name =
        bedrooms === 0
          ? 'Studio'
          : bedrooms === 1
            ? 'One Bedroom'
            : bedrooms === 2
              ? 'Two Bedroom'
              : bedrooms === 3
                ? 'Three Bedroom'
                : `${bedrooms} Bedroom`;

      const unitType = await prisma.propertyUnitType.create({
        data: {
          propertyId: property.id,
          code,
          name,
          bedrooms,
          bathrooms: bedrooms,
        },
      });

      await prisma.propertyDepositRule.create({
        data: {
          unitTypeId: unitType.id,
          amount: 0,
          basis: 'RENT_MONTHS',
          months,
        },
      });

      await prisma.unit.updateMany({
        where: { id: { in: unitIds } },
        data: { unitTypeId: unitType.id },
      });

      console.log(
        `  ${property.name}: ${code} (${unitIds.length} unit(s)) — deposit ${months} month(s) of rent`,
      );
    }

    touched += 1;
  }

  console.log(`Done. ${touched} propert${touched === 1 ? 'y' : 'ies'} updated.`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
