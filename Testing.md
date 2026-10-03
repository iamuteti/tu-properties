# Testing Guide - TU Properties (Multi-Tenant SaaS)

This guide outlines how to test the multi-tenant functionality using the provided seed data.

## 1. Setup

Ensure you have your database running and the `.env` file configured (see `backend/.env.example`).

### Reset and Seed Database
Run the following commands in the `backend` directory:

```bash
# Apply any pending migrations
npx prisma migrate dev

# Run the seed script (super admin + demo organizations, users, and business data)
npx prisma db seed
```

> `npm run db:seed:demo` runs the same demo-data script standalone
> (`src/prisma/demo-data.ts`). `npx prisma db seed` is the documented
> entry point and produces the state described in this file.

## 2. Test User Accounts

The seed creates demo accounts representing different roles and organizations.
The password for **all** accounts is `Password123!`.

### Super Admin Account (Platform Admin)
| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@tuproperties.co.ke` | `Password123!` | None (access to ALL organizations) |

**Purpose:** Can access all organizations, create new organizations, manage platform settings.

---

### Organization 1: Westhill Properties
| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@westhill.co.ke` | `Password123!` | Westhill Properties |
| **Property Manager** | `manager@westhill.co.ke` | `Password123!` | Westhill Properties |
| **Accountant** | `accountant@westhill.co.ke` | `Password123!` | Westhill Properties |

**Purpose:** Westhill is a **fresh organization with no business data** — use it to
create properties, tenants, leases, and invoices from scratch.

---

### Organization 2: Rohi Estate Management
| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@rohi.co.ke` | `Password123!` | Rohi Estate Management |

**Purpose:** Rohi contains the **full demo dataset** (~120 landlords, ~100
properties, ~2,400 units, ~1,800 tenants, plus rental agreements, invoices,
payments, and receipts). Use it to verify list/filter/pagination behavior.

## 3. Multi-Tenancy Test Scenarios

### Scenario 1: Data Isolation
1. Login as `admin@rohi.co.ke` (Rohi Estate Management).
2. Verify the large demo dataset is visible (properties, units, tenants, invoices).
3. Logout and login as `admin@westhill.co.ke` (Westhill Properties).
4. Verify NO properties/tenants/invoices are visible (Westhill is empty).

### Scenario 2: Super Admin Access
1. Login as `admin@tuproperties.co.ke` (Super Admin).
2. Navigate to Dashboard → Organizations.
3. Verify you can see ALL organizations.
4. Create a new organization.
5. Verify you can see data from ALL organizations (super admin bypasses the tenant filter).

### Scenario 3: Role-Based Access
1. Login as `accountant@westhill.co.ke`.
2. Verify finance pages are available and the nav hides admin-only items.
3. Navigate to Settings — should be restricted (Settings is visible to SUPER_ADMIN/ADMIN only).
4. Login as `manager@westhill.co.ke` (Property Manager) and verify property/tenant/lease
   pages are available but finance pages are hidden from the nav.

## 4. Test Data

### Organizations
| Name | Slug | Subdomain | Plan |
| :--- | :--- | :--- | :--- |
| Westhill Properties | westhill-properties | demo | PROFESSIONAL |
| Rohi Estate Management | rohi-estate-management | rohi | ENTERPRISE |

### Business Data
- **Westhill Properties:** none (fresh organization).
- **Rohi Estate Management:** ~120 landlords, ~100 properties, ~2,400 units,
  ~1,800 tenants, plus rental agreements, invoices, payments, and receipts.
  Exact counts may vary slightly between seed runs (names/addresses are randomized).

---

## 5. Testing Steps

1. **Database Reset**: Run `npx prisma migrate dev` then `npx prisma db seed`
   (or `npx prisma migrate reset` + `npx prisma db seed` to wipe and reseed).
2. **Test Data Isolation**:
   - Login as admin@rohi.co.ke → sees the full demo dataset.
   - Login as admin@westhill.co.ke → sees no properties.
   - Login as manager@westhill.co.ke → sees no properties, no finance nav.
3. **Test Super Admin**:
   - Login as admin@tuproperties.co.ke → access the Organizations page.
4. **Test New Organization**:
   - As Super Admin, create a new organization.
   - Create a user for that organization.
   - Login as the new user → should only see their org's data (none, initially).

---

## 6. Troubleshooting

1. **Database Connection**: Verify `DATABASE_URL` in `backend/.env`.
2. **Re-seed**: If data gets messy, run `npx prisma migrate reset` and then `npx prisma db seed`.
3. **Check Organization ID**: Users without an `organizationId` can only be Super Admins.
