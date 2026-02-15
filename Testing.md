# Testing Guide - TU Properties (Multi-Tenant SAAS)

This guide outlines how to test the multi-tenant functionality using the provided seed data.

## 1. Setup

Ensure you have your database running and the `.env` file configured.

### Reset and Seed Database
Run the following commands in the `backend` directory:

```bash
# Apply any pending migrations
npx prisma migrate dev

# Run the seed script
npx prisma db seed
```

## 2. Test User Accounts

The system comes with demo accounts representing different roles and organizations. The password for all accounts is `Password123!`.

### Super Admin Account (Platform Admin)
| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@tuhame.co.ke` | `Password123!` | None (Access to ALL organizations) |

**Purpose**: Can access all organizations, create new organizations, manage platform settings

---

### Organization 1: Westhill Properties

| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Property Manager** | `manager@tuhame.co.ke` | `Password123!` | Westhill Properties |
| **Accountant** | `accountant@tuhame.co.ke` | `Password123!` | Westhill Properties |

**Purpose**: Can only see data for "Westhill Properties" organization

---

### Organization 2: Acme Properties

| Role | Email | Password | Organization |
| :--- | :--- | :--- | :--- |
| **Admin** | `manager@acme.co.ke` | `Password123!` | Acme Properties |

**Purpose**: Can only see data for "Acme Properties" organization (different from TU Properties)

---

## 3. Multi-Tenancy Test Scenarios

### Scenario 1: Data Isolation
1. Login as `manager@tuhame.co.ke` (TU Properties)
2. Note the properties: "Riverside Heights", "Westlands Plaza"
3. Logout and login as `manager@acme.co.ke` (Acme Properties)
4. Verify NO properties are visible (or only Acme-specific properties)

### Scenario 2: Super Admin Access
1. Login as `admin@tuhame.co.ke` (Super Admin)
2. Navigate to Dashboard → Organizations
3. Verify you can see ALL organizations
4. Create a new organization
5. Verify you can see data from ALL organizations

### Scenario 3: Role-Based Access
1. Login as `accountant@tuhame.co.ke`
2. Navigate to Properties
3. Verify you can see properties but cannot edit/delete
4. Try navigating to Settings - should be restricted

---

## 4. Test Data

### Organizations
| Name | Slug | Subdomain | Plan |
| :--- | :--- | :--- | :--- |
| Westhill Properties | tu-properties | demo | PROFESSIONAL |
| Acme Properties | acme-properties | acme | STARTER |

### Properties (Westhill Properties)
- Riverside Heights (5 units)
- Westlands Plaza (3 units)

### Properties (Acme Properties)
- (None - fresh organization)

---

## 5. Testing Steps

1. **Database Reset**: Run `npx prisma migrate reset` and `npx prisma db seed`
2. **Test Data Isolation**: 
   - Login as manager@tuhame.co.ke → Should see properties
   - Login as manager@acme.co.ke → Should NOT see properties
3. **Test Super Admin**: 
   - Login as admin@tuhame.co.ke → Access Organizations page
4. **Test New Organization**:
   - As Super Admin, create new organization
   - Create user for that organization
   - Login as new user → Should only see their org data

---

## 6. Troubleshooting

If you encounter issues:
1. **Database Connection**: Verify `DATABASE_URL` in `.env`
2. **Re-seed**: If data gets messy, run `npx prisma migrate reset` and then `npx prisma db seed`
3. **Check Organization ID**: Users without `organizationId` can only be Super Admins
