import assert from 'node:assert/strict';
import test from 'node:test';

import { WpsTokenProvider } from '../../../src/channels/wps/wps-app.mjs';

test('WpsTokenProvider caches access_token until expiry', async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls += 1;
    assert.match(String(url), /oauth2\/token$/);
    assert.match(init.body, /client_credentials/);
    return new Response(JSON.stringify({
      access_token: 'token-1',
      expires_in: 7200,
      token_type: 'bearer',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  let now = 1_000;
  const provider = new WpsTokenProvider({
    appId: 'AK2024TEST',
    appSecret: 'secret',
    fetch: fetchImpl,
    now: () => now,
  });
  assert.equal(await provider.getAccessToken(), 'token-1');
  assert.equal(await provider.getAccessToken(), 'token-1');
  assert.equal(calls, 1);
  now += 7_200_000;
  assert.equal(await provider.getAccessToken(), 'token-1');
  assert.equal(calls, 2);
});

test('verifyWpsApp returns masked preview', async () => {
  const provider = new WpsTokenProvider({
    appId: 'AK2024TEST',
    appSecret: 'secret',
    fetch: async () => new Response(JSON.stringify({
      access_token: '0123456789abcdef',
      expires_in: 7200,
    }), { status: 200 }),
  });
  const result = await provider.verifyCredentials();
  assert.equal(result.appId, 'AK2024TEST');
  assert.match(result.accessTokenPreview, /••••/);
});
