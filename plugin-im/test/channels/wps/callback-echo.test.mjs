import assert from 'node:assert/strict';
import test from 'node:test';

import { createWpsCallbackServer } from '../../../src/channels/wps/callback-server.mjs';
import {
  encryptEventData,
  signEventContent,
  buildEventSignatureContent,
} from '../../../src/channels/wps/event-crypto.mjs';
import { createWpsEchoHandler } from '../../../src/channels/wps/wps-echo.mjs';

const APP_ID = 'AK2024TEST';
const APP_SECRET = 'secret-for-tests';

function signedEvent(plain) {
  const nonce = 'aae1234567890abc';
  const encrypted_data = encryptEventData(plain, { appSecret: APP_SECRET, nonce });
  const event = {
    topic: 'kso.app_chat.message',
    operation: 'create',
    time: 1704074400,
    nonce,
    encrypted_data,
  };
  const content = buildEventSignatureContent({
    accessKey: APP_ID,
    topic: event.topic,
    nonce: event.nonce,
    time: event.time,
    encryptedData: event.encrypted_data,
  });
  event.signature = signEventContent(content, APP_SECRET);
  return event;
}

test('callback server returns challenge and dispatches decrypted events', async () => {
  const events = [];
  const server = createWpsCallbackServer({
    appId: APP_ID,
    appSecret: APP_SECRET,
    onEvent: async (event) => {
      events.push(event);
    },
  });
  const endpoint = await server.listen('127.0.0.1', 0);
  try {
    const challenge = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challenge: 'ping' }),
    });
    assert.equal(challenge.status, 200);
    assert.deepEqual(await challenge.json(), { challenge: 'ping' });

    const plain = JSON.stringify({
      chat: { id: 'chat_1', type: 'group' },
      company_id: 'co_1',
      message: {
        id: 'msg_1',
        type: 'text',
        content: { text: { content: 'echo-me' } },
        mentions: [{ identity: { id: APP_ID, type: 'app' } }],
      },
      sender: { id: 'user_1', type: 'user' },
    });
    const ack = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(signedEvent(plain)),
    });
    assert.equal(ack.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(events.length, 1);
    assert.equal(events[0].topic, 'kso.app_chat.message');
    assert.match(events[0].plain, /echo-me/);
  } finally {
    await server.close();
  }
});

test('wps echo handler replies with the same text', async () => {
  const sent = [];
  const handler = createWpsEchoHandler({
    appId: APP_ID,
    api: {
      createTextMessage: async (payload) => {
        sent.push(payload);
        return { messageId: 'reply_1' };
      },
    },
  });
  await handler({
    topic: 'kso.app_chat.message',
    operation: 'create',
    plain: JSON.stringify({
      chat: { id: 'chat_1', type: 'group' },
      message: {
        id: 'msg_1',
        type: 'text',
        content: { text: { content: 'echo-me' } },
        mentions: [{ identity: { id: APP_ID, type: 'app' } }],
      },
      sender: { id: 'user_1', type: 'user' },
    }),
  });
  assert.deepEqual(sent, [{ chatId: 'chat_1', text: 'echo-me', markdown: false }]);
});
