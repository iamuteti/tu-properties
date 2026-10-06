import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { LegalModule } from './legal.module';
import { ContractsController } from './contracts.controller';

/**
 * Module 15 - route resolution.
 *
 * **This file exists because of a bug no service test could have caught.**
 *
 * `ContractsController` has `@Get(':id')` on the `contracts` prefix, and a
 * one-segment path parameter matches `expiry-report` just as happily as it matches a
 * cuid. Declared in the wrong order, `GET /contracts/expiry-report` answers **404
 * "Contract not found"** - and the symptom reads like a bad filter on the list screen
 * rather than a shadowed route, which is why it took a live request to find.
 *
 * It is the same trap as Module 13's `/facilities/bookings`, reproduced by a different
 * controller, which is the strongest argument for asserting it rather than trusting
 * the next author to remember. Every service test in this module passes the entire
 * time it is broken, because a service never sees the router.
 *
 * Two things are asserted, and the split matters:
 *
 * 1. **Which path each route actually declares**, read from the same `PATH_METADATA` /
 *    `METHOD_METADATA` that Nest's router is built from. Reading the metadata rather
 *    than booting an app is a deliberate trade - standing up a real
 *    `NestApplication` in this project's Jest config hangs on `init()` (the
 *    controllers carry `@UseGuards(JwtAuthGuard)`, which needs a passport stack) - and
 *    a test that cannot run is worth less than one that can. The metadata *is* the
 *    router's input, so this still fails when the declarations are wrong.
 * 2. **The declaration order within the controller**, which is the mechanism that
 *    resolves the collision. This is the half a metadata check alone would miss
 *    entirely: reordering the methods changes nothing about what they declare, still
 *    compiles, still boots, and still passes every service test - while the expiry
 *    report 404s. So it is pinned directly.
 *
 * The complement is a live check, recorded in the module doc: with this order,
 * `GET /contracts`, `GET /contracts/expiry-report` and `GET /contracts/:id` all
 * answered 200 against a running API, and the harness asserts the report is not a 404.
 */
interface RouteRecord {
  path: string;
  method: RequestMethod;
  full: string;
}

/**
 * Nest's `Reflect.getMetadata` is typed `any`, and the controller method table it
 * returns has no declared shape. This is the one place `any` enters, and it is cast
 * immediately into something typed - so a typo in a field name downstream is a compile
 * error rather than an `undefined` that quietly resolves nothing.
 */
function metaOf(target: unknown, key: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const value = Reflect.getMetadata(key, target as object);
  return value as unknown;
}

/**
 * Every route the controller declares, **in declaration order**.
 *
 * `Object.getOwnPropertyNames` on a class returns methods in definition order for the
 * ES class semantics Nest compiles to, which is the order the router sees.
 */
function routesOf(controller: Type): RouteRecord[] {
  const prefix = metaOf(controller, PATH_METADATA) as string;

  const records: RouteRecord[] = [];

  for (const key of Object.getOwnPropertyNames(controller.prototype)) {
    if (key === 'constructor') continue;

    const handler = (controller.prototype as Record<string, unknown>)[key];
    const path = metaOf(handler, PATH_METADATA);
    const method = metaOf(handler, METHOD_METADATA);

    if (typeof path !== 'string' || typeof method !== 'number') continue;

    records.push({ path, method, full: `${prefix}/${path}` });
  }

  return records;
}

describe('Module 15 route resolution', () => {
  const routes = routesOf(ContractsController);

  it('declares expiry-report as a literal segment, not a parameter', () => {
    // The whole point. `expiry-report` must appear verbatim; if this ever becomes
    // `:kind` or is dropped, the assertion below is what says so.
    const report = routes.find(
      (route) => route.full === 'contracts/expiry-report',
    );
    expect(report).toBeDefined();
    expect(report?.method).toBe(RequestMethod.GET);
  });

  it('declares expiry-report BEFORE :id', () => {
    const reportIndex = routes.findIndex(
      (route) => route.full === 'contracts/expiry-report',
    );
    const idIndex = routes.findIndex((route) => route.full === 'contracts/:id');

    expect(reportIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
    // First match wins in Express, so this ordering is the entire fix. Asserting the
    // metadata alone would pass with the two swapped.
    expect(reportIndex).toBeLessThan(idIndex);
  });

  it('declares a bare :id route at all', () => {
    // Without this, the assertion above would pass vacuously on an empty table.
    expect(routes.some((route) => route.full === 'contracts/:id')).toBe(true);
  });

  it('uses named verb routes rather than a status field', () => {
    // Every state change is a `POST :id/<verb>`. There is no `PATCH :id/status`
    // anywhere in this controller, because a contract's status is derived from the
    // clock and is never stored.
    const verbs = routes.filter(
      (route) =>
        route.method === RequestMethod.POST && route.path.includes(':id'),
    );
    expect(verbs.map((route) => route.path).sort()).toEqual([':id/renew']);

    expect(
      routes.some(
        (route) =>
          route.path.includes('status') || route.path.includes('state'),
      ),
    ).toBe(false);
  });

  it('has no PATCH route that could accept a status', () => {
    const patches = routes.filter(
      (route) => route.method === RequestMethod.PATCH,
    );
    expect(patches.map((route) => route.full)).toEqual(['contracts/:id']);
  });

  it('registers the controller on the contracts prefix, alone', () => {
    expect(metaOf(ContractsController, PATH_METADATA)).toBe('contracts');
    // One controller, not four sharing a prefix - the Module 13 lesson.
    expect(LegalModule).toBeDefined();
    const controllers = Reflect.getMetadata(
      'controllers',
      LegalModule,
    ) as Type<unknown>[];
    expect(controllers).toEqual([ContractsController]);
  });

  it('keeps every declared route under the prefix', () => {
    for (const route of routes) {
      expect(route.full.startsWith('contracts/')).toBe(true);
    }
  });
});
