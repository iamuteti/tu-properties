# Testing Guide - Tuhame Property Management System

This guide outlines how to test the system using the provided seed data.

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

The system comes with three default accounts representing different roles. The password for all accounts is `Password123!`.

| Role | Email | Purpose |
| :--- | :--- | :--- |
| **Super Admin** | `admin@tuhame.com` | User management, system configuration, full access. |
| **Property Manager** | `manager@tuhame.com` | Managing properties, units, tenants, and leases. |
| **Accountant** | `accountant@tuhame.com` | Managing invoices, payments, and financial reports. |

## 3. Scenarios to Test

### Property & Unit Management
- **Dashboard**: Log in as `manager@tuhame.com` and check if "Riverside Heights" and "Westlands Plaza" appear.
- **Unit Status**: Verify that some units are marked as `OCCUPIED` (e.g., `RIV-101`) and others as `VACANT` (e.g., `RIV-104`).

### Tenant & Lease Management
- **Active Leases**: Check for the active lease of `John Doe` in `Riverside Heights`.
- **Tenant Directory**: Verify `John Doe`, `Mary Smith`, and `Peter Kamau` are in the system.

### Financials (Billing & Payments)
- **Invoices**: Log in as `accountant@tuhame.com`. You should see:
    - Paid Invoice: `INV-2024-001` (History)
    - Pending Invoice: `INV-2024-002` (Overdue or Due shortly)
- **Payments**: Check the payment history for `John Doe` to see receipt `REC-001`.

## 4. Manual Testing Steps

1. **Login**: Test authentication with the provided email/password combinations.
2. **Navigation**: Navigate through Properties -> Units -> Tenants.
3. **Lease Lifecycle**: Try creating a new lease for a `VACANT` unit.
4. **Billing**: Generate a new invoice for an active lease.
5. **Collection**: Record a payment against a `PENDING` invoice.

## 5. Troubleshooting

If you encounter issues:
1. **Database Connection**: Verify `DATABASE_URL` in `.env`.
2. **Re-seed**: If data gets messy, run `npx prisma migrate reset` and then `npx prisma db seed` to start fresh.
