import assert from 'node:assert/strict';
import test from 'node:test';

import { signKso1Request, sha256Hex } from '../../../src/channels/wps/kso-sign.mjs';
import { WpsApiClient } from '../../../src/channels/wps/wps-api.mjs';
import { WpsTokenProvider } from '../../../src/channels/wps/wps-app.mjs';

test('signKso1Request matches documented string-to-sign layout', () => {
  const body = '{"type":"text"}';
  const headers = signKso1Request({
    appId: 'AK2024TEST',
    appSecret: 'secret',
    method: 'POST',
    requestUri: '/v7/messages/create',
    contentType: 'application/json',
    ksoDate: 'Wed, 23 Jan 2013 06:43:08 GMT',
    body,
  });
  assert.equal(headers['X-Kso-Date'], 'Wed, 23 Jan 2013 06:43:08 GMT');
  assert.match(headers['X-Kso-Authorization'], /^KSO-1 AK2024TEST:[0-9a-f]{64}$/);
  assert.equal(sha256Hex(body).length, 64);
});

test('WpsApiClient signs and sends create message request', async () => {
  const requests = [];
  const provider = new WpsTokenProvider({
    appId: 'AK2024TEST',
    appSecret: 'secret',
    fetch: async () => new Response(JSON.stringify({
      access_token: 'token-1',
      expires_in: 7200,
    }), { status: 200 }),
  });
  const api = new WpsApiClient({
    tokenProvider: provider,
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (String(url).includes('/oauth2/token')) {
        return new Response(JSON.stringify({
          access_token: 'token-1',
          expires_in: 7200,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        code: 0,
        data: { chat_id: 'chat_1', message_id: 'msg_reply' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const result = await api.createTextMessage({ chatId: 'chat_1', text: 'echo' });
  assert.equal(result.messageId, 'msg_reply');
  assert.equal(requests.length, 1);
  const create = requests[0];
  assert.match(create.url, /\/v7\/messages\/create$/);
  assert.match(create.init.headers.authorization, /Bearer token-1/);
  assert.match(create.init.headers['X-Kso-Authorization'], /^KSO-1 /);
  assert.match(create.init.body, /"receiver_id":"chat_1"/);
});
