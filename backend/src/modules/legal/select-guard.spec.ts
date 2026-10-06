import { Prisma } from '@prisma/client';

/**
 * Module 15 - the selects are checked against the schema, and this proves it twice.
 *
 * The defect this file exists for: the register shipped a build that was green, a test
 * suite that was green, and a `GET /contracts` that 500'd on **every** request,
 * because the select named `Tenant.firstName` and the column is `surname`. Nothing in
 * the repository disagreed with itself - the service's select, the spec's hand-written
 * row type and the spec's fixture were all consistent fiction, and the live harness was
 * the only thing that noticed.
 *
 * There are two guards, and this file covers the *removable* one:
 *
 * 1. `satisfies Prisma.ContractSelect` on `LIST_SELECT`, and `ContractRow` derived from
 *    it via `Prisma.ContractGetPayload`. Both are compile-time, both verified by
 *    deliberately corrupting the file and watching `tsc` fail. Neither can be
 *    exercised from a Jest test, because by the time Jest runs, `tsc` has already
 *    passed - which is exactly why guard 2 is needed.
 * 2. **This file.** It reads the selects and checks every field against
 *    `Prisma.dmmf.datamodel`, the schema's own description of itself. It runs in a unit
 *    test, needs no database, and fails if someone deletes the `satisfies` or hand-edits
 *    the literal - which is the realistic way this regresses, because the annotation
 *    looks redundant once the tests pass.
 *
 * The lesson is the one worth keeping: **a mock is not evidence.** A fixture that
 * agrees with a hand-written type agrees with nothing, and two agreeing fictions are
 * not more true than one.
 */

/** Field names Prisma understands on any model: scalars plus its own enum columns. */
function fieldsOf(modelName: string): Set<string> {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) throw new Error(`Model ${modelName} is not in the schema`);
  return new Set(model.fields.map((f) => f.name));
}

/**
 * Walk a select literal and return every `model.field` pair it names.
 *
 * Handles the two shapes Prisma allows: `relation: { select: { ... } }` recurses with
 * the named model, and `relation: true` names the relation itself with no sub-fields.
 * `include` is not accepted here on purpose - `LIST_SELECT` uses `select` only, and a
 * silent allowance would let the walker drift from the thing it checks.
 */
function collectFields(
  select: Record<string, unknown>,
  modelName: string,
): { pair: string; exists: boolean }[] {
  const known = fieldsOf(modelName);
  const results: { pair: string; exists: boolean }[] = [];

  for (const [key, value] of Object.entries(select)) {
    const exists = known.has(key);
    results.push({ pair: `${modelName}.${key}`, exists });

    if (!exists) continue;
    // Only recurse into a relation the schema actually declares, otherwise the next
    // `fieldsOf` throws on something that is not a model.
    const field = Prisma.dmmf.datamodel.models
      .find((m) => m.name === modelName)!
      .fields.find((f) => f.name === key);
    if (field?.relationName) {
      const nested = (value as { select?: Record<string, unknown> } | undefined)
        ?.select;
      if (nested) {
        results.push(...collectFields(nested, field.type));
      }
    }
  }

  return results;
}

/**
 * The literals under test, imported rather than duplicated.
 *
 * Imported because a copy is a second thing that can drift, which is the whole failure
 * mode being guarded against - and because a guard that checks a copy of the select
 * rather than the select proves nothing about the code that runs.
 */
import { LIST_SELECT, RELATED_INCLUDE } from './contracts.service';

describe('Module 15 selects match the schema', () => {
  it('names only fields that exist on Contract', () => {
    const missing = collectFields(
      LIST_SELECT as unknown as Record<string, unknown>,
      'Contract',
    )
      .filter((p) => !p.exists)
      .map((p) => p.pair);

    expect(missing).toEqual([]);
  });

  it('names only fields that exist on the related models', () => {
    // Checked separately from the above so a failure says *which* model drifted.
    for (const model of [
      'RentalAgreement',
      'SaleTransaction',
      'Supplier',
      'Landlord',
    ]) {
      const select = (RELATED_INCLUDE as Record<string, { select: unknown }>)[
        {
          RentalAgreement: 'rentalAgreement',
          SaleTransaction: 'saleTransaction',
          Supplier: 'supplier',
          Landlord: 'landlord',
        }[model]!
      ]?.select;
      if (!select) continue;

      const missing = collectFields(select as Record<string, unknown>, model)
        .filter((p) => !p.exists)
        .map((p) => p.pair);
      expect({ model, missing }).toEqual({ model, missing: [] });
    }
  });

  it('covers the fields the view depends on', () => {
    // The other direction: a select that silently stopped fetching something the
    // service reads would not be caught by the check above, only by a 500 or a blank
    // column. Both directions matter.
    const select = LIST_SELECT as unknown as Record<string, unknown>;
    for (const field of [
      'id',
      'reference',
      'title',
      'type',
      'expiresAt',
      'noticeDays',
      'autoRenew',
      'renewalOfId',
      'documentId',
      // `renewals` is the reverse edge SUPERSEDED is derived from. Losing it turns
      // every superseded contract into an apparently live one.
      'renewals',
    ]) {
      expect(select).toHaveProperty(field);
    }
  });

  it('selects the tenant columns by their real names', () => {
    // Named explicitly because this is the exact field that shipped the 500, and a
    // regression here is silent: `surname` would come back undefined and the
    // counterparty label would quietly fall through to the agreement code.
    const tenant = (
      LIST_SELECT as unknown as {
        rentalAgreement: {
          select: { tenant: { select: Record<string, unknown> } };
        };
      }
    ).rentalAgreement.select.tenant.select;

    expect(Object.keys(tenant).sort()).toEqual([
      'email',
      'otherNames',
      'surname',
    ]);
    expect(tenant).not.toHaveProperty('firstName');
    expect(tenant).not.toHaveProperty('lastName');
  });

  it('keeps notes and createdByUserId OUT of the list select', () => {
    // `ContractRow` marks both optional because they are absent here, and the view
    // normalises them to null. If they are ever added, the optionality should be
    // revisited rather than left as a lie - so the change has to be deliberate.
    const select = LIST_SELECT as unknown as Record<string, unknown>;
    expect(select).not.toHaveProperty('notes');
    expect(select).not.toHaveProperty('createdByUserId');
  });
});
