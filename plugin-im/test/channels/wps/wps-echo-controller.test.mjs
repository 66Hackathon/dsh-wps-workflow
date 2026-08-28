import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { WpsConfigStore } from '../../../src/channels/wps/config-store.mjs';
import { WPS_SECRET_REF, WPS_TRANSPORTS } from '../../../src/channels/wps/protocol.mjs';
import { WpsEchoController } from '../../../src/channels/wps/wps-echo-controller.mjs';
import {
  WPS_RPC_ENDPOINTS,
  createWpsRpcHandler,
} from '../../../plugin-src/host/channels/wps/rpc.mjs';

const APP_ID = 'AK2024TESTAPP';
const APP_SECRET = 'secret-for-controller-tests';

function mockFetch() {
  return async () => ({
    ok: true,
    async text() {
      return JSON.stringify({ access_token: 'token', expires_in: 7200 });
    },
  });
}

function mockWebSocket() {
  return class {
    constructor() {
      this.readyState = 1;
      queueMicrotask(() => {
        for (const listener of this.#open) listener();
      });
    }

    #open = [];

    addEventListener(type, listener) {
      if (type === 'open') {
        this.#open.push(listener);
        queueMicrotask(listener);
      }
    }

    removeEventListener(type, listener) {
      if (type === 'open') {
        this.#open = this.#open.filter((item) => item !== listener);
      }
    }

    close() {}

    send() {}
  };
}

function credentials() {
  const values = new Map();
  return {
    values,
    async resolve(ref) {
      const value = values.get(ref);
      return value ? { value } : null;
    },
    async set(ref, value) {
      values.set(ref, value);
    },
    async unset(ref) {
      values.delete(ref);
    },
  };
}

test('WpsEchoController stores secret in credentials and starts websocket transport', async () => {
  const credentialStore = credentials();
  const root = await mkdtemp(join(tmpdir(), 'dsh-wps-controller-'));
  const store = new WpsConfigStore(join(root, 'config.json'));
  await store.load();
  const controller = new WpsEchoController({
    credentials: credentialStore,
    configStore: store,
    internals: {
      fetch: mockFetch(),
      WebSocket: mockWebSocket(),
    },
  });

  const status = await controller.configure({
    appId: APP_ID,
    appSecret: APP_SECRET,
    transport: WPS_TRANSPORTS.WEBSOCKET,
  });

  assert.equal(status.configured, true);
  assert.equal(status.connected, true);
  assert.equal(status.transport, WPS_TRANSPORTS.WEBSOCKET);
  assert.equal(credentialStore.values.get(WPS_SECRET_REF), APP_SECRET);
  assert.equal(JSON.stringify(status).includes(APP_SECRET), false);
  assert.match(status.config.appIdMasked, /AK2024/);

  const removed = await controller.remove();
  assert.equal(removed.configured, false);
  assert.equal(credentialStore.values.size, 0);
  await rm(root, { recursive: true, force: true });
});

test('WpsEchoController reconfigures transport without resubmitting secret', async () => {
  const credentialStore = credentials();
  const root = await mkdtemp(join(tmpdir(), 'dsh-wps-controller-'));
  const store = new WpsConfigStore(join(root, 'config.json'));
  await store.load();
  const controller = new WpsEchoController({
    credentials: credentialStore,
    configStore: store,
    internals: {
      fetch: mockFetch(),
      WebSocket: mockWebSocket(),
    },
  });

  await controller.configure({
    appId: APP_ID,
    appSecret: APP_SECRET,
    transport: WPS_TRANSPORTS.WEBSOCKET,
  });
  const status = await controller.configure({
    appId: APP_ID,
    transport: WPS_TRANSPORTS.WEBSOCKET,
    callbackPort: 18_888,
  });
  assert.equal(status.connected, true);
  assert.equal(status.config.callbackPort, 18_888);
  assert.equal(credentialStore.values.get(WPS_SECRET_REF), APP_SECRET);
  await controller.close();
  await rm(root, { recursive: true, force: true });
});

test('WPS RPC validates configure payloads and maps credential failures', async () => {
  const calls = [];
  const handler = createWpsRpcHandler({
    status: async () => ({ configured: false }),
    configure: async (payload) => { calls.push(payload); return { configured: true }; },
    reconnect: async () => ({ configured: true }),
    test: async () => { const error = new Error('bad secret'); error.code = 'invalid-token'; throw error; },
    remove: async () => ({ configured: false }),
  });

  assert.deepEqual(await handler(WPS_RPC_ENDPOINTS.configure, { transport: WPS_TRANSPORTS.WEBSOCKET }), {
    ok: false,
    error: { code: 'bad-request', message: 'Invalid WPS request.' },
  });
  assert.deepEqual(await handler(WPS_RPC_ENDPOINTS.configure, {
    appId: APP_ID,
    transport: WPS_TRANSPORTS.WEBSOCKET,
  }), { ok: true, value: { configured: true } });
  assert.deepEqual(calls[0], { appId: APP_ID, transport: WPS_TRANSPORTS.WEBSOCKET });
  assert.deepEqual(await handler(WPS_RPC_ENDPOINTS.test, {}), {
    ok: false,
    error: { code: 'invalid-credentials', message: 'bad secret' },
  });
});
