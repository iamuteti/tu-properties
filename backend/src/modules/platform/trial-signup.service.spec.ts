import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { TrialSignupService, slugify } from './trial-signup.service';
import type { OnboardConflictCause } from './platform.service';

/**
 * Module 19 — public trial signup.
 *
 * The danger of this endpoint is not what it returns but what it accepts: it is
 * the one unauthenticated write in the platform surface. So the tests pin the
 * narrowings — plan forced to STARTER, trial forced to 14 days, slug derived
 * rather than chosen — and the two conflict paths: a taken slug retries with a
 * suffix, a taken *email* surfaces, because that address already owns an account.
 */
describe('TrialSignupService', () => {
  let service: TrialSignupService;
  let onboard: jest.Mock;

  const dto = {
    name: 'Rohi Estate Management',
    adminEmail: 'owner@rohi-example.co.ke',
    adminFirstName: 'Test',
    adminLastName: 'Owner',
    adminPassword: 'Str0ngPass!2026',
  };

  const createdOrg = (slug: string) => ({
    id: 'org-new',
    name: dto.name,
    slug,
    plan: 'STARTER' as const,
    subscription: { trialEndsAt: new Date('2026-10-25T00:00:00.000Z') },
  });

  beforeEach(async () => {
    onboard = jest
      .fn()
      .mockImplementation((body: { slug: string }) =>
        Promise.resolve(createdOrg(body.slug)),
      );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrialSignupService,
        { provide: PlatformService, useValue: { onboard } },
      ],
    }).compile();

    service = module.get(TrialSignupService);
  });

  /** First argument of the i-th `onboard` call, typed — `mock.calls` is `any[][]`. */
  function onboardArg(i: number): Record<string, unknown> {
    expect(onboard).toHaveBeenCalled();
    return (onboard.mock.calls as unknown[][])[i][0] as Record<string, unknown>;
  }

  describe('slugify', () => {
    it('folds a company name to a slug', () => {
      expect(slugify('Rohi Estate Management')).toBe('rohi-estate-management');
    });

    it('strips punctuation, trims and collapses runs', () => {
      expect(slugify('  ACME Ltd. (Kenya)!  ')).toBe('acme-ltd-kenya');
    });

    it('falls back when nothing alphanumeric survives', () => {
      expect(slugify('---')).toBe('org');
    });

    it('caps at the 60 the column enforces', () => {
      expect(slugify(`${'a'.repeat(70)} estates`)).toHaveLength(60);
    });
  });

  it('onboards a STARTER trial with a derived slug', async () => {
    const result = await service.signup(dto);

    expect(onboard).toHaveBeenCalledTimes(1);
    const body = onboardArg(0);
    expect(body).toMatchObject({
      name: dto.name,
      slug: 'rohi-estate-management',
      plan: 'STARTER',
      trialDays: 14,
    });
    expect(result).toEqual({
      organizationId: 'org-new',
      name: dto.name,
      slug: 'rohi-estate-management',
      adminEmail: dto.adminEmail,
      plan: 'STARTER',
      trialEndsAt: new Date('2026-10-25T00:00:00.000Z'),
    });
  });

  it('retries a taken slug with a suffix instead of failing', async () => {
    onboard
      .mockRejectedValueOnce(
        new ConflictException('A record with this slug already exists', {
          cause: { conflictField: 'slug' } satisfies OnboardConflictCause,
        }),
      )
      .mockImplementation((body: { slug: string }) =>
        Promise.resolve(createdOrg(body.slug)),
      );

    const result = await service.signup(dto);

    expect(onboard).toHaveBeenCalledTimes(2);
    const retrySlug = (onboardArg(1) as { slug: string }).slug;
    expect(retrySlug).toMatch(/^rohi-estate-management-[0-9a-f]{4}$/);
    expect(result.slug).toBe(retrySlug);
  });

  it('surfaces a taken email without retrying', async () => {
    onboard.mockRejectedValue(
      new ConflictException('A record with this email already exists', {
        cause: { conflictField: 'email' } satisfies OnboardConflictCause,
      }),
    );

    await expect(service.signup(dto)).rejects.toThrow(/email/i);
    expect(onboard).toHaveBeenCalledTimes(1);
  });
});
