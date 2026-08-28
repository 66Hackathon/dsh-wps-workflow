import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEventSignatureContent,
  challengeResponse,
  decryptEventData,
  encryptEventData,
  parseCallbackBody,
  signEventContent,
  verifyEventSignature,
} from '../../../src/channels/wps/event-crypto.mjs';

const APP_ID = 'AK2024TEST';
const APP_SECRET = 'secret-for-tests';

test('event crypto roundtrip encrypt/decrypt', () => {
  const nonce = 'aae1234567890abc';
  const plain = JSON.stringify({ app_id: APP_ID, hello: 'world' });
  const encrypted = encryptEventData(plain, { appSecret: APP_SECRET, nonce });
  const decrypted = decryptEventData(encrypted, { appSecret: APP_SECRET, nonce });
  assert.equal(decrypted, plain);
});

test('event signature verification accepts valid signature', () => {
  const event = {
    topic: 'kso.test',
    operation: 'update',
    time: 1704074400,
    nonce: 'aae1234567890abc',
    encrypted_data: encryptEventData('{"ok":true}', {
      appSecret: APP_SECRET,
      nonce: 'aae1234567890abc',
    }),
  };
  const content = buildEventSignatureContent({
    accessKey: APP_ID,
    topic: event.topic,
    nonce: event.nonce,
    time: event.time,
    encryptedData: event.encrypted_data,
  });
  event.signature = signEventContent(content, APP_SECRET);
  assert.equal(verifyEventSignature(event, { appId: APP_ID, appSecret: APP_SECRET }), true);
});

test('parseCallbackBody handles challenge and encrypted events', () => {
  assert.deepEqual(parseCallbackBody({ challenge: 'abc' }), {
    kind: 'challenge',
    challenge: 'abc',
  });
  const event = { topic: 'kso.test', encrypted_data: 'x', nonce: 'n', time: 1, signature: 's' };
  assert.deepEqual(parseCallbackBody(event), { kind: 'event', event });
  assert.deepEqual(challengeResponse('abc'), { challenge: 'abc' });
});
