import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAttribution } from './derive-source.ts';

describe('deriveAttribution — UTMs explícitos', () => {
  it('utm_source=instagram → instagram/social', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo?utm_source=instagram&utm_medium=social&utm_campaign=verano',
      now: 1000,
    });
    assert.equal(r.source, 'instagram');
    assert.equal(r.medium, 'social');
    assert.equal(r.campaign, 'verano');
    assert.equal(r.capturedAt, 1000);
  });

  it('utm_source=google + utm_medium=cpc → google_ads/cpc', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo?utm_source=google&utm_medium=cpc&utm_campaign=verano2026',
    });
    assert.equal(r.source, 'google_ads');
    assert.equal(r.medium, 'cpc');
  });

  it('utm_source=google sin medium → google_organic', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo?utm_source=google',
    });
    assert.equal(r.source, 'google_organic');
    assert.equal(r.medium, 'organic');
  });

  it('utm_source desconocido → no se mapea, cae a referrer/direct', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo?utm_source=marquesina_zoco',
    });
    assert.equal(r.source, 'direct');
  });

  it('utm_campaign se trunca a 80 chars y se normaliza', () => {
    const long = 'a'.repeat(120);
    const r = deriveAttribution({
      url: `https://otracita.es/b/foo?utm_source=instagram&utm_campaign=${long}`,
    });
    assert.equal(r.campaign?.length, 80);
  });
});

describe('deriveAttribution — click identifiers', () => {
  it('gclid → google_ads/cpc', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo?gclid=ABC123',
    });
    assert.equal(r.source, 'google_ads');
    assert.equal(r.medium, 'cpc');
  });

  it('fbclid → facebook/cpc', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo?fbclid=IwAR123',
    });
    assert.equal(r.source, 'facebook');
    assert.equal(r.medium, 'cpc');
  });
});

describe('deriveAttribution — referrer hostname', () => {
  it('referrer instagram.com → instagram/social', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo',
      referrer: 'https://www.instagram.com/some/profile',
    });
    assert.equal(r.source, 'instagram');
    assert.equal(r.medium, 'social');
  });

  it('referrer l.facebook.com → facebook/social', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo',
      referrer: 'https://l.facebook.com/redirect',
    });
    assert.equal(r.source, 'facebook');
  });

  it('referrer google.es → google_organic/organic', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo',
      referrer: 'https://www.google.es/search?q=barbero',
    });
    assert.equal(r.source, 'google_organic');
    assert.equal(r.medium, 'organic');
  });

  it('referrer externo desconocido → referral/referral', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo',
      referrer: 'https://random-blog.example/post',
    });
    assert.equal(r.source, 'referral');
    assert.equal(r.medium, 'referral');
  });

  it('referrer same-host → direct (no se cuenta como referral)', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo',
      referrer: 'https://otracita.es/landing',
    });
    assert.equal(r.source, 'direct');
  });
});

describe('deriveAttribution — fallbacks', () => {
  it('sin UTM ni referrer → direct/none', () => {
    const r = deriveAttribution({ url: 'https://otracita.es/b/foo' });
    assert.equal(r.source, 'direct');
    assert.equal(r.medium, 'none');
    assert.equal(r.campaign, null);
  });

  it('URL inválida → direct', () => {
    const r = deriveAttribution({ url: 'not-a-url' });
    assert.equal(r.source, 'direct');
  });

  it('referrer inválido → cae a direct', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo',
      referrer: 'no-es-una-url',
    });
    assert.equal(r.source, 'direct');
  });
});

describe('deriveAttribution — prioridad', () => {
  it('UTM tiene prioridad sobre referrer', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo?utm_source=tiktok&utm_medium=social',
      referrer: 'https://www.instagram.com/x',
    });
    assert.equal(r.source, 'tiktok');
  });

  it('gclid tiene prioridad sobre referrer', () => {
    const r = deriveAttribution({
      url: 'https://otracita.es/b/foo?gclid=ABC',
      referrer: 'https://www.instagram.com/x',
    });
    assert.equal(r.source, 'google_ads');
  });
});
