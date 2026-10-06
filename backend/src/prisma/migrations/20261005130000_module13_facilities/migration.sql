-- Module 13 — Facilities Management.
--
-- Six tables: the facilities themselves, bookings against them, closures, the
-- visitor directory, the visit log and access cards. The reasoning for each is in
-- the model comments in schema.prisma; the part that has to live *here* is at the
-- bottom.

-- ============================================================ facilities

CREATE TYPE "FacilityKind" AS ENUM (
    'CLUBHOUSE',
    'MEETING_ROOM',
    'PARKING',
    'GYM',
    'POOL',
    'TENNIS_COURT',
    'LAUNDRY',
    'RECREATION',
    'OTHER'
);

CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FacilityKind" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "capacity" INTEGER,
    "opensAtMinutes" INTEGER NOT NULL DEFAULT 480,
    "closesAtMinutes" INTEGER NOT NULL DEFAULT 1320,
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 90,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "isBookable" BOOLEAN NOT NULL DEFAULT true,
    "bookingFee" DECIMAL(12,2),
    "bookingFeeCurrency" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facilities_propertyId_name_key" ON "facilities"("propertyId", "name");
CREATE INDEX "facilities_organizationId_idx" ON "facilities"("organizationId");
CREATE INDEX "facilities_propertyId_idx" ON "facilities"("propertyId");
CREATE INDEX "facilities_kind_idx" ON "facilities"("kind");

ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================ bookings

CREATE TYPE "FacilityBookingStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'CANCELLED',
    'REJECTED',
    'NO_SHOW'
);

CREATE TABLE "facility_bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookedByUserId" TEXT,
    "contactId" TEXT,
    "tenantId" TEXT,
    "bookedForName" TEXT NOT NULL,
    "bookedForPhone" TEXT,
    "purpose" TEXT,
    "attendeeCount" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "FacilityBookingStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "fee" DECIMAL(12,2),
    "feeCurrency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facility_bookings_facilityId_reference_key" ON "facility_bookings"("facilityId", "reference");
CREATE INDEX "facility_bookings_organizationId_idx" ON "facility_bookings"("organizationId");
CREATE INDEX "facility_bookings_facilityId_startsAt_idx" ON "facility_bookings"("facilityId", "startsAt");
CREATE INDEX "facility_bookings_status_idx" ON "facility_bookings"("status");

ALTER TABLE "facility_bookings" ADD CONSTRAINT "facility_bookings_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facility_bookings" ADD CONSTRAINT "facility_bookings_facilityId_fkey"
    FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facility_bookings" ADD CONSTRAINT "facility_bookings_bookedByUserId_fkey"
    FOREIGN KEY ("bookedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facility_bookings" ADD CONSTRAINT "facility_bookings_decidedByUserId_fkey"
    FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facility_bookings" ADD CONSTRAINT "facility_bookings_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- SetNull, not Restrict: a resident record is financial history and outlives
-- their tenancy (master doc issue 25's reasoning, applied to the same table).
ALTER TABLE "facility_bookings" ADD CONSTRAINT "facility_bookings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================ blackouts

CREATE TABLE "facility_blackouts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_blackouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "facility_blackouts_organizationId_idx" ON "facility_blackouts"("organizationId");
CREATE INDEX "facility_blackouts_facilityId_startsAt_idx" ON "facility_blackouts"("facilityId", "startsAt");

ALTER TABLE "facility_blackouts" ADD CONSTRAINT "facility_blackouts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facility_blackouts" ADD CONSTRAINT "facility_blackouts_facilityId_fkey"
    FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facility_blackouts" ADD CONSTRAINT "facility_blackouts_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================ visitors

CREATE TABLE "visitors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "idType" TEXT,
    "idNumber" TEXT,
    "contactId" TEXT,
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklistedAt" TIMESTAMP(3),
    "blacklistReason" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visitors_organizationId_idx" ON "visitors"("organizationId");
CREATE INDEX "visitors_phone_idx" ON "visitors"("phone");
CREATE INDEX "visitors_isBlacklisted_idx" ON "visitors"("isBlacklisted");

ALTER TABLE "visitors" ADD CONSTRAINT "visitors_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================ access cards

CREATE TYPE "AccessCardType" AS ENUM ('BUILDING', 'UNIT', 'PARKING', 'FACILITY', 'GATE');
CREATE TYPE "AccessCardHolder" AS ENUM ('STAFF', 'TENANT', 'CONTACT', 'VISITOR', 'NONE');
CREATE TYPE "AccessCardStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'LOST', 'EXPIRED', 'REVOKED');

CREATE TABLE "access_cards" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "type" "AccessCardType" NOT NULL DEFAULT 'BUILDING',
    "status" "AccessCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "holder" "AccessCardHolder" NOT NULL DEFAULT 'NONE',
    "propertyId" TEXT,
    "unitId" TEXT,
    "facilityId" TEXT,
    "userId" TEXT,
    "tenantId" TEXT,
    "contactId" TEXT,
    "visitorId" TEXT,
    "holderName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacementCardId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_cards_organizationId_cardNumber_key" ON "access_cards"("organizationId", "cardNumber");
CREATE INDEX "access_cards_organizationId_idx" ON "access_cards"("organizationId");
CREATE INDEX "access_cards_status_idx" ON "access_cards"("status");
CREATE INDEX "access_cards_holder_idx" ON "access_cards"("holder");
CREATE INDEX "access_cards_unitId_idx" ON "access_cards"("unitId");

ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_facilityId_fkey"
    FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_cards" ADD CONSTRAINT "access_cards_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "visitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================ visitor visits

CREATE TABLE "visitor_visits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "propertyId" TEXT,
    "tenantId" TEXT,
    "contactId" TEXT,
    "userId" TEXT,
    "hostName" TEXT NOT NULL,
    "hostPhone" TEXT,
    "purpose" TEXT,
    "expectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedOutAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "preApprovedByUserId" TEXT,
    "accessCardId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_visits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visitor_visits_organizationId_idx" ON "visitor_visits"("organizationId");
CREATE INDEX "visitor_visits_visitorId_idx" ON "visitor_visits"("visitorId");
CREATE INDEX "visitor_visits_expectedAt_idx" ON "visitor_visits"("expectedAt");
CREATE INDEX "visitor_visits_checkedOutAt_idx" ON "visitor_visits"("checkedOutAt");

ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Restrict: a visit is the reason a visitor row exists, and a gate log that
-- silently loses rows when somebody tidies up the visitor directory is worse than
-- a delete that has to be deliberate.
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_preApprovedByUserId_fkey"
    FOREIGN KEY ("preApprovedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visitor_visits" ADD CONSTRAINT "visitor_visits_accessCardId_fkey"
    FOREIGN KEY ("accessCardId") REFERENCES "access_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================ notification types

-- Adding a value to an existing enum. `ADD VALUE` cannot run inside a transaction
-- on PostgreSQL below 12, and Prisma runs migrations in one — so this is written
-- to be safe either way by being a bare statement above the constraint work
-- below, which Prisma will execute first in file order.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FACILITY_BOOKING_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VISITOR_ARRIVAL';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCESS_CARD_EXPIRING';

-- =====================================================================
-- THE ACCEPTANCE CRITERION, ENFORCED BY POSTGRES RATHER THAN BY THE API
-- =====================================================================
--
-- "A facility can be booked without double-booking the same slot" is the module's
-- one stated acceptance criterion, and a `SELECT` then `INSERT` cannot deliver it:
-- two receptionists clicking Confirm at the same instant both read an empty slot
-- and both write. Whichever lost the race has to find out afterwards, by looking
-- at a diary that is now wrong.
--
-- So the guarantee lives in the database as a GiST exclusion constraint over a
-- half-open range: for any two rows on the same facility whose ranges touch or
-- overlap, at most one may exist. `[)` is not decoration — it is what makes a
-- booking ending at 12:00 compatible with one starting at 12:00, which is every
-- diary ever drawn. The partial predicate keeps only the states that actually hold
-- a slot, so CANCELLED, REJECTED and NO_SHOW rows — which must be kept as
-- history — never occupy anything.
--
-- `tsrange`, not `tstzrange`: `DateTime` is `TIMESTAMP(3) WITHOUT TIME ZONE` in
-- this schema, and pairing a naive column with a zoned range type would make the
-- comparison depend on the session's TimeZone setting — a double booking that
-- reproduces only on the server that has the right offset. All facility times are
-- already resolved to the organization's local wall clock by the time they reach
-- a column, so a naive range is both correct and consistent with every other
-- timestamp in this database.
--
-- The service still checks first, because it has to return a message naming the
-- conflicting booking rather than a constraint name. This constraint is what makes
-- that check honest under concurrency; it is not a replacement for it.
--
-- `btree_gist` supplies the equality operator class GiST needs for the uuid
-- column. It is part of postgresql-contrib and is present on a stock Windows
-- installer; if it is not, the statement below raises rather than leaving the
-- table silently unprotected — a module whose headline guarantee quietly depends
-- on an extension that may or may not be installed is worse than a failed
-- migration somebody has to read.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "facility_bookings"
    ADD CONSTRAINT "facility_bookings_no_overlap"
    EXCLUDE USING gist (
        "facilityId" WITH =,
        tsrange("startsAt", "endsAt", '[)') WITH &&
    )
    WHERE ("status" IN ('PENDING', 'CONFIRMED'));
