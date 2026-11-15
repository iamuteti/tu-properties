import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OnboardOrganizationDto } from './onboarding.dto';
import { TrialSignupDto } from './trial-signup.dto';

/**
 * The currency boundary between the two ways an organization is created.
 *
 * Onboarding is an operator action, so it accepts any ISO-4217 code — the
 * platform models fifteen jurisdictions and only two of them are priced. Trial
 * signup is self-serve, so it must refuse a currency the plan catalogue has no
 * price for. Losing either half of that boundary is what turns "we price two
 * currencies" into "the app only works in two countries".
 */

const ONBOARDING_BASE = {
  name: 'Acme Property Group',
  slug: 'acme-property-group',
  adminEmail: 'admin@acme.test',
  adminFirstName: 'Ada',
  adminLastName: 'Lovelace',
  adminPassword: 'correct-horse-battery',
};

const TRIAL_BASE = {
  name: 'Acme Property Group',
  adminEmail: 'admin@acme.test',
  adminFirstName: 'Ada',
  adminLastName: 'Lovelace',
  adminPassword: 'correct-horse-battery',
};

async function currencyErrorCount<T extends object>(
  dtoClass: new () => T,
  base: object,
  currency: string,
): Promise<number> {
  const errors = await validate(
    plainToInstance(dtoClass, { ...base, currency }),
  );
  return errors.filter((error) => error.property === 'currency').length;
}

describe('currency boundary between onboarding and trial signup', () => {
  it('onboarding accepts an unpriced ISO-4217 currency', async () => {
    expect(
      await currencyErrorCount(OnboardOrganizationDto, ONBOARDING_BASE, 'ZAR'),
    ).toBe(0);
  });

  it('onboarding rejects a string that is not an ISO-4217 code', async () => {
    expect(
      await currencyErrorCount(
        OnboardOrganizationDto,
        ONBOARDING_BASE,
        'DOLLARS',
      ),
    ).toBe(1);
  });

  it('trial signup rejects a currency the plan catalogue does not price', async () => {
    expect(await currencyErrorCount(TrialSignupDto, TRIAL_BASE, 'ZAR')).toBe(1);
  });

  it('trial signup accepts both priced currencies', async () => {
    expect(await currencyErrorCount(TrialSignupDto, TRIAL_BASE, 'KES')).toBe(0);
    expect(await currencyErrorCount(TrialSignupDto, TRIAL_BASE, 'USD')).toBe(0);
  });
});
