import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { FacilitiesModule } from './facilities.module';

/**
 * Module 13 — route resolution.
 *
 * **This file exists because of a bug no service test could have caught.**
 * `FacilitiesController` has `@Get(':id')` on the `facilities` prefix, and a
 * one-segment path parameter matches `bookings`, `visitors` and `access-cards` just
 * as happily as it matches a cuid. With that controller registered first, all three
 * sub-resources answered **404 "Facility not found"** — and the symptom read like a
 * broken list filter rather than a broken route, which is exactly why it took a live
 * request to find.
 *
 * Every service test passed the entire time it was broken, because a service never
 * sees the router. So the guarantee has to be asserted against the route *table*.
 *
 * Two things are asserted, and the split matters:
 *
 * 1. **Which controller owns each path**, read from the same `PATH_METADATA` /
 *    `METHOD_METADATA` that Nest's router is built from. Reading the metadata rather
 *    than booting an app is a deliberate trade: standing up a real `NestApplication`
 *    in this project's Jest config hangs on `init()` (the controllers carry
 *    `@UseGuards(JwtAuthGuard)`, which needs a passport stack), and a test that
 *    cannot run is worth less than one that can. The metadata *is* the input to the
 *    router, so this still fails when the declarations are wrong.
 * 2. **The registration order**, which is the mechanism that resolves the collision.
 *    This is the half that a metadata check alone would miss entirely: reordering the
 *    `controllers` array changes nothing about the declarations, still compiles, still
 *    boots, and still passes every service test — while three screens 404. So it is
 *    pinned directly against `FacilitiesModule`.
 *
 * The complement is a live check, recorded in the module doc: with the order below,
 * `GET /facilities`, `/facilities/bookings`, `/facilities/visits`,
 * `/facilities/visitors` and `/facilities/access-cards` all answered 200.
 */
interface RouteRecord {
  controller: string;
  prefix: string;
  path: string;
  method: RequestMethod;
  /** The full Express path, e.g. `/facilities/:id/approve`. */
  full: string;
}

/**
 * Nest's `Reflect.getMetadata` is typed `any`, and the controller method table it
 * returns has no declared shape. This is the one place that `any` enters, and it is
 * cast immediately into something typed — so a typo in a field name downstream is a
 * compile error rather than an `undefined` that quietly resolves nothing.
 */
function metaOf(target: unknown, key: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const value = Reflect.getMetadata(key, target as object);
  return value as unknown;
}

/** Every route the five controllers declare, in declaration order. */
function routesOf(controller: Type): RouteRecord[] {
  const prefix = metaOf(controller, PATH_METADATA) as string;
  const methods = (metaOf(controller, METHOD_METADATA) ?? controller) as Type;

  const methodNames = Object.getOwnPropertyNames(
    methods.prototype as object,
  ).filter((name) => name !== 'constructor');

  const records: RouteRecord[] = [];
  for (const name of methodNames) {
    const handler = (methods.prototype as Record<string, unknown>)[name];
    const path = metaOf(handler, PATH_METADATA);
    const method = metaOf(handler, METHOD_METADATA);
    // `typeof` rather than a cast: Nest stores the path as a string or, for
    // `@Controller()`, `undefined`, and a `null` here would stringify to the literal
    // text "null" in a route table — which is precisely the kind of wrong that looks
    // like a typo somewhere else entirely.
    if (typeof path !== 'string' || typeof method !== 'number') continue;
    records.push({
      controller: controller.name,
      prefix,
      path,
      method: method as RequestMethod,
      full: `/${prefix}/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/',
    });
  }
  return records;
}

/**
 * The table, in the order Nest registers it — which is the `controllers` array order.
 */
function routeTable(): RouteRecord[] {
  const registered = (metaOf(FacilitiesModule, 'controllers') ?? []) as Type[];
  return registered.flatMap(routesOf);
}

describe('Module 13 route resolution', () => {
  const table = routeTable();

  /**
   * Which handler Express reaches for `path` + `method`.
   *
   * A one-segment `:id` matches any single segment, which is the whole bug, so the
   * matcher implements exactly that and nothing more: a longer pattern never matches
   * a shorter path, and `:param` matches one non-empty segment. Express is
   * first-match-wins, so the first record in table order that matches is the answer.
   */
  function resolve(path: string, method: RequestMethod): string | null {
    const segments = path.split('/').filter(Boolean);
    for (const route of table) {
      if (route.method !== method) continue;

      const pattern = route.full.split('/').filter(Boolean);
      if (pattern.length !== segments.length) continue;

      const matches = pattern.every((part, index) =>
        part.startsWith(':')
          ? segments[index].length > 0
          : part === segments[index],
      );
      if (matches) return route.controller;
    }
    return null;
  }

  const GET = RequestMethod.GET;
  const POST = RequestMethod.POST;
  const PATCH = RequestMethod.PATCH;

  it('resolves the register to FacilitiesController', () => {
    expect(resolve('/facilities', GET)).toBe('FacilitiesController');
  });

  it('resolves the booking ledger to its own controller, not to :id', () => {
    // The bug: this used to resolve to `FacilitiesController.findOne` with
    // `id = "bookings"`, which is why the list 404'd with "Facility not found".
    expect(resolve('/facilities/bookings', GET)).toBe(
      'FacilityBookingsController',
    );
  });

  it('resolves the visitor directory to its own controller, not to :id', () => {
    expect(resolve('/facilities/visitors', GET)).toBe('VisitorsController');
  });

  it('resolves the gate book to its own controller, not to :id', () => {
    expect(resolve('/facilities/visits', GET)).toBe('VisitorVisitsController');
  });

  it('resolves the card register to its own controller, not to :id', () => {
    expect(resolve('/facilities/access-cards', GET)).toBe(
      'AccessCardsController',
    );
  });

  it('still resolves a real facility id to the detail route', () => {
    // The other half of the contract: ordering the sub-resources first must not cost
    // the detail route. (`/edit` is a frontend page, not an API route — the API's
    // second facility route is `GET /facilities/:id/availability`, covered below.)
    expect(resolve('/facilities/cmuvspnnx101fxctxutc8khrf', GET)).toBe(
      'FacilitiesController',
    );
    expect(
      resolve('/facilities/cmuvspnnx101fxctxutc8khrf/availability', GET),
    ).toBe('FacilitiesController');
  });

  it('resolves every nested booking action to the booking controller', () => {
    const routes: Array<[string, RequestMethod]> = [
      ['/facilities/bookings', GET],
      ['/facilities/bookings/export', GET],
      ['/facilities/bookings/abc123', GET],
      ['/facilities/bookings/abc123', PATCH],
      ['/facilities/bookings/abc123/approve', POST],
      ['/facilities/bookings/abc123/reject', POST],
      ['/facilities/bookings/abc123/cancel', POST],
      ['/facilities/bookings/abc123/reactivate', POST],
      ['/facilities/bookings/abc123/no-show', POST],
      ['/facilities/bookings/abc123/reschedule', POST],
      ['/facilities/bookings/bulk', POST],
      ['/facilities/bookings/preview', POST],
    ];
    for (const [path, method] of routes) {
      expect({ path, resolved: resolve(path, method) }).toEqual({
        path,
        resolved: 'FacilityBookingsController',
      });
    }
  });

  it('resolves every card action to the card controller', () => {
    const routes: Array<[string, RequestMethod]> = [
      ['/facilities/access-cards', GET],
      ['/facilities/access-cards/export', GET],
      ['/facilities/access-cards/AC-0001', GET],
      ['/facilities/access-cards/AC-0001', PATCH],
      ['/facilities/access-cards/AC-0001/suspend', POST],
      ['/facilities/access-cards/AC-0001/reactivate', POST],
      ['/facilities/access-cards/AC-0001/mark-lost', POST],
      ['/facilities/access-cards/AC-0001/mark-expired', POST],
      ['/facilities/access-cards/AC-0001/revoke', POST],
      ['/facilities/access-cards/AC-0001/record-replacement', POST],
    ];
    for (const [path, method] of routes) {
      expect({ path, resolved: resolve(path, method) }).toEqual({
        path,
        resolved: 'AccessCardsController',
      });
    }
  });

  it('resolves the gate actions to their own controllers', () => {
    expect(resolve('/facilities/visits/abc123', GET)).toBe(
      'VisitorVisitsController',
    );
    expect(resolve('/facilities/visits/abc123/check-in', POST)).toBe(
      'VisitorVisitsController',
    );
    expect(resolve('/facilities/visits/abc123/check-out', POST)).toBe(
      'VisitorVisitsController',
    );
    expect(resolve('/facilities/visits/abc123/pre-approve', POST)).toBe(
      'VisitorVisitsController',
    );
    expect(resolve('/facilities/visitors/abc123', GET)).toBe(
      'VisitorsController',
    );
    expect(resolve('/facilities/visitors/abc123/bar', POST)).toBe(
      'VisitorsController',
    );
    expect(resolve('/facilities/visitors/abc123/unbar', POST)).toBe(
      'VisitorsController',
    );
  });

  /**
   * There is no `PATCH .../status` anywhere.
   *
   * This is a property of the route table rather than of any service, and it is the
   * mechanism behind `booking-lifecycle.ts` and `access-card-lifecycle.ts` being the
   * only ways a record moves. Worth a test precisely because a body field skipping
   * past the gates would be invisible in the service tests — they call `decide()`.
   */
  it('has no status-patch route to skip the lifecycle with', () => {
    expect(resolve('/facilities/bookings/abc123/status', PATCH)).toBeNull();
    expect(
      resolve('/facilities/access-cards/AC-0001/status', PATCH),
    ).toBeNull();
  });

  it('updates a booking only through named verbs', () => {
    // `PATCH /facilities/:id` is the *facility* edit, so it must not answer a
    // booking path — and `PATCH /facilities/bookings/:id` is the booking's
    // descriptive-fields update, which is a different controller from the facility one.
    expect(resolve('/facilities/abc123', PATCH)).toBe('FacilitiesController');
    expect(resolve('/facilities/bookings/abc123', PATCH)).toBe(
      'FacilityBookingsController',
    );
  });

  /**
   * The mechanism, pinned.
   *
   * The three sub-resource controllers must stay **ahead** of `FacilitiesController`
   * in the module's `controllers` array, because that is what makes the static
   * segments win. This is the one regression that no amount of declaration-level
   * checking would catch: reordering the array compiles, boots, and passes every
   * other test in this file, while three screens 404 in a browser.
   */
  it('registers the sub-resource controllers before the one with the :id wildcard', () => {
    const registered = metaOf(FacilitiesModule, 'controllers') as Type[];

    const wildcardIndex = registered.findIndex(
      (controller) => controller.name === 'FacilitiesController',
    );
    expect(wildcardIndex).toBeGreaterThanOrEqual(0);

    registered.forEach((controller, index) => {
      if (controller.name === 'FacilitiesController') return;
      expect(index).toBeLessThan(wildcardIndex);
    });

    // All five are present — a test that passes because four controllers vanished
    // would be worse than no test.
    expect(registered.map((controller) => controller.name).sort()).toEqual([
      'AccessCardsController',
      'FacilitiesController',
      'FacilityBookingsController',
      'VisitorVisitsController',
      'VisitorsController',
    ]);
  });

  it('picks the right handler if the order were reversed — the guard against a green suite', () => {
    // Proof that the ordering assertion above is load-bearing rather than
    // ceremonial: with `FacilitiesController` first, the very first test in this file
    // answers differently. If this ever stops being true, the ordering stopped being
    // the mechanism and the comment above has gone stale.
    const reversed = [...routeTable()].sort((a, b) =>
      a.controller === 'FacilitiesController'
        ? -1
        : b.controller === 'FacilitiesController'
          ? 1
          : 0,
    );

    const resolveReversed = (
      path: string,
      method: RequestMethod,
    ): string | null => {
      const segments = path.split('/').filter(Boolean);
      for (const route of reversed) {
        if (route.method !== method) continue;
        const pattern = route.full.split('/').filter(Boolean);
        if (pattern.length !== segments.length) continue;
        if (
          pattern.every((part, index) =>
            part.startsWith(':')
              ? segments[index].length > 0
              : part === segments[index],
          )
        ) {
          return route.controller;
        }
      }
      return null;
    };

    expect(resolveReversed('/facilities/bookings', GET)).toBe(
      'FacilitiesController',
    );
    expect(resolve('/facilities/bookings', GET)).toBe(
      'FacilityBookingsController',
    );
  });
});
