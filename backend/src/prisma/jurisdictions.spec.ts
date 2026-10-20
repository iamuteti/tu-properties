import {
  DEMO_MARKETS,
  PROFILES,
  demoMarkets,
  getProfile,
  orgEmailDomain,
  rentInRange,
  randomEmail,
} from './jurisdictions';

describe('jurisdiction profiles', () => {
  it('covers exactly the markets the demo claims to cover', () => {
    // The demo's market list and the profiles behind it must agree. A profile
    // with no entry in the list is a country the seeder will quietly skip; a
    // market with no profile is a country the seeder will crash on.
    expect(Object.keys(PROFILES).sort()).toEqual([...DEMO_MARKETS].sort());
  });

  it('keeps Africa to Kenya and South Africa', () => {
    const african = DEMO_MARKETS.filter((code) =>
      ['KE', 'ZA', 'NG', 'GH', 'TZ', 'UG', 'RW', 'EG', 'MA', 'ET'].includes(
        code,
      ),
    );
    expect(african).toEqual(['KE', 'ZA']);
  });

  it.each(DEMO_MARKETS)('%s has a complete profile', (code) => {
    const profile = getProfile(code);

    expect(profile.code).toBe(code);
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.currency).toMatch(/^[A-Z]{3}$/);
    expect(profile.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    expect(profile.timezone).toContain('/');
    expect(profile.vatRate).toBeGreaterThanOrEqual(0);
    expect(profile.vatRate).toBeLessThanOrEqual(30);

    // The parts a market is made of.
    for (const [label, values] of [
      ['firstNames', profile.firstNames],
      ['lastNames', profile.lastNames],
      ['corporateNames', profile.corporateNames],
      ['streets', profile.streets],
      ['cities', profile.cities],
      ['districts', profile.districts],
      ['banks', profile.banks],
      ['bankBranches', profile.bankBranches],
      ['propertyPrefixes', profile.propertyPrefixes],
      ['propertySuffixes', profile.propertySuffixes],
      ['domains', profile.domains],
    ] as const) {
      expect(values.length).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(0);
    }

    // Telephone numbers are country-shaped: a prefix plus a subscriber part
    // that together make the number this country actually issues.
    expect(profile.phoneCountryCode).toMatch(/^\+\d{1,3}$/);
    expect(profile.phonePrefixes.length).toBeGreaterThan(0);
    for (const prefix of profile.phonePrefixes) {
      expect(prefix.length).toBeLessThanOrEqual(profile.phoneSubscriberLength);
    }

    // The rent band has to be a band.
    expect(profile.monthlyRent.max).toBeGreaterThan(profile.monthlyRent.min);

    // One utility tariff per type the product bills.
    expect(profile.utilityTariffs.map((t) => t.type)).toEqual(
      expect.arrayContaining(['ELECTRICITY', 'WATER']),
    );
  });

  it('puts the primary market first and keeps every market after it', () => {
    const markets = demoMarkets('IN');
    expect(markets[0]).toBe('IN');
    expect(markets).toHaveLength(DEMO_MARKETS.length);
    expect(new Set(markets).size).toBe(markets.length);
    expect([...markets].sort()).toEqual([...DEMO_MARKETS].sort());
  });

  it('derives an organization email domain from the profile', () => {
    expect(orgEmailDomain(getProfile('KE'))).toBe('co.ke');
    expect(orgEmailDomain(getProfile('ZA'))).toBe('co.za');
    expect(orgEmailDomain(getProfile('IN'))).toBe('co.in');
    expect(orgEmailDomain(getProfile('AE'))).toBe('ae');
  });

  it('never produces an email address that a mail server would refuse', () => {
    const profile = getProfile('FR');
    const email = randomEmail('Élise Martin', profile);
    expect(email).toMatch(/^elise\.martin@[\w.-]+$/);
    expect(profile.domains).toContain(email.split('@')[1]);
  });

  it('keeps a rent inside the band of the market it belongs to', () => {
    for (const code of DEMO_MARKETS) {
      const profile = getProfile(code);
      for (let i = 0; i < 50; i++) {
        const rent = rentInRange(profile);
        expect(rent).toBeGreaterThanOrEqual(profile.monthlyRent.min);
        expect(rent).toBeLessThanOrEqual(profile.monthlyRent.max);
        expect(Number.isInteger(rent)).toBe(true);
      }
    }
  });

  it('refuses a jurisdiction it has no profile for', () => {
    expect(() => getProfile('ZZ')).toThrow(/Unknown jurisdiction profile/);
  });
});
