You are an expert database architect and senior software engineer specializing in multi-tenant, international property management and double-entry accounting software (NestJS, TypeScript, Prisma, PostgreSQL).

### Context & Goal
The project currently has a demo data seeder script (`backend/src/prisma/demo-data.ts`) and database schema (`backend/src/prisma/schema.prisma`). 
While the underlying schema and mathematical rules engines (taxes, FIFO waterfall payment allocation, derived landlord payouts, utility apportionment, and statutory payroll) are designed to be completely country-agnostic, the current demo data is heavily skewed towards Kenya (e.g., +254 phone numbers, Nairobi neighborhoods, KES currency, KRA PINs).

I need you to redesign/rewrite the demo data generator architecture to produce **rich, realistic, and country-flexible demo data** that can seamlessly generate an immersive demo environment for ANY country/jurisdiction (e.g. United States, United Kingdom, Canada, Australia, South Africa, Nigeria, UAE, Kenya, Germany, etc.).

---

### Core Requirements for the Demo Data Architecture

1. **Locale & Jurisdiction Profiles (Parameter-Driven Seed Data)**:
   - Create a clean configuration pattern (e.g., `JurisdictionProfile` or `CountryDatasetConfig`) defining:
     - ISO-3166-1 country code (e.g., `US`, `GB`, `ZA`, `NG`, `KE`, `AE`) and currency ISO-4217 (`USD`, `GBP`, `ZAR`, `NGN`, `KES`, `AED`).
     - Realistic phone number format generators matching valid carrier prefixes and E.164 formats for that country.
     - Natural person names (first names, surnames) and corporate landlord/vendor names appropriate for that locale.
     - Realistic addresses: Street names, districts/boroughs/suburbs, cities, postal/ZIP codes, and coordinates.
     - Tax identification formats (e.g., US EIN/SSN, UK UTR/VAT, Kenya KRA PIN, Nigeria TIN, SA Tax Number).
     - Statutory payroll presets: Names and typical deduction formulas (e.g., US: FICA/Federal/State; UK: PAYE/NIC/Pension; KE: PAYE/NSSF/SHIF/Housing Levy; ZA: PAYE/UIF/SDL).
     - Utility profiles: Common meter types, utility companies, and realistic volumetric tariffs (kWh electricity, cubic meter water, gas).

2. **Multi-Branch Global Organization Option**:
   - In addition to single-country setups, support an "International Enterprise Organization" option with multiple branches in different cities across the world (e.g. London branch with GBP properties, New York branch with USD properties, Nairobi branch with KES properties).
   - Verify that all financial records (invoices, receipts, owner payouts, work orders) use their respective branch's currency without cross-currency contamination.

3. **Deterministic Financial Math & Strict Consistency**:
   - Ensure the generated financial transactions strictly satisfy the system's database constraints and derived accounting rules:
     - **FIFO Waterfall Settlement**: Tenant payments must settle the oldest invoice first. Any overpayment must correctly generate a spendable wallet credit entry.
     - **Derived Landlord Disbursements**: Landlord gross collected must equal the exact sum of matched rental payments. Deductions (management fee %, approved maintenance work order bills, withholding tax) must calculate deterministically down to the net payout transfer.
     - **Non-Overlapping Leases**: Guarantee that no physical unit has overlapping active lease dates.
     - **Meter Single-Bill Constraint**: Utility bills must strictly observe the partial unique index guaranteeing at most one bill per meter per calendar month.
     - **Double-Entry Balance**: The general ledger audit trail must have zero un-reconciled discrepancies (`0.00 diff`).

4. **Immersive Realism & Variety**:
   - Generate diverse property types: High-rise commercial towers, multi-family apartment complexes, mixed-use retail developments, and suburban gated communities.
   - Varied tenant lifecycle states: Active leases in good standing, tenants with partial arrears, advance credit balances, pending lease renewals (30/60 days out), and completed move-outs with itemized deposit deductions (repairs, submeter arrears, and net refunds).
   - Rich operations data: Contractor directory, maintenance tickets with triage statuses (emergency vs. routine), work orders, RFQs with competing bids, and inventory stock movements.

---

### Collaborative Enhancement & Improvements
I am completely open to and actively encourage your suggestions for improving the data architecture:
- If you notice edge cases, richer lifecycles, or missing entities that would make the demo data feel significantly more professional and realistic, please propose and include them.
- If you find opportunities to optimize the seeding performance (e.g., transaction batching via `prisma.$transaction`, chunked `createMany`, or relational linking strategies), please explain your rationale and implement them.
- Let me know if you suggest packaging the locale data into modular datasets so adding new countries in the future requires only a lightweight JSON/TypeScript config file.

Please provide a clean, production-grade TypeScript implementation and explain how to configure or invoke it for any chosen jurisdiction.
