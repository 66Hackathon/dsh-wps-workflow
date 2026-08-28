import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { WpsConfigStore } from '../../../src/channels/wps/config-store.mjs';
import { WPS_MODES, WPS_SECRET_REF, WPS_TRANSPORTS } from '../../../src/channels/wps/protocol.mjs';
import { WpsStateStore } from '../../../src/channels/wps/state-store.mjs';
import { WpsController } from '../../../src/channels/wps/wps-controller.mjs';
import { BotWorkspaceStore } from '../../../src/channels/shared/bot-workspace-store.mjs';

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

function mockHarness() {
  return {
    async ensureRunning() {},
  };
}

test('WpsController starts harness mode with websocket transport', async () => {
  const credentialStore = credentials();
  const root = await mkdtemp(join(tmpdir(), 'dsh-wps-harness-'));
  const defaultWorkspace = join(root, 'project');
  const store = new WpsConfigStore(join(root, 'config.json'));
  const stateStore = new WpsStateStore(join(root, 'state.json'));
  const workspaces = await new BotWorkspaceStore(join(root, 'workspaces.json'), {
    defaultWorkspace,
  }).load();
  await store.load();
  await stateStore.load();
  const controller = new WpsController({
    credentials: credentialStore,
    configStore: store,
    stateStore,
    harness: mockHarness(),
    workspaces,
    internals: {
      fetch: mockFetch(),
      WebSocket: mockWebSocket(),
    },
  });

  const status = await controller.configure({
    appId: APP_ID,
    appSecret: APP_SECRET,
    transport: WPS_TRANSPORTS.WEBSOCKET,
    mode: WPS_MODES.HARNESS,
  });

  assert.equal(status.configured, true);
  assert.equal(status.connected, true);
  assert.equal(status.mode, WPS_MODES.HARNESS);
  assert.equal(status.workspace, defaultWorkspace);
  assert.equal(status.transport, WPS_TRANSPORTS.WEBSOCKET);
  assert.equal(workspaces.workspaceFor(APP_ID), defaultWorkspace);
  assert.equal(credentialStore.values.get(WPS_SECRET_REF), APP_SECRET);
  assert.equal(JSON.stringify(status).includes(APP_SECRET), false);

  await controller.close();
  await rm(root, { recursive: true, force: true });
});
