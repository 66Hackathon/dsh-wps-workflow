import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createProductionController } from '../../../plugin-src/host/channels/wps/production.mjs';

test('WPS production wires harness controller and config store', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-wps-production-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));

  const ctx = {
    apiProxy: {},
    credentials: {
      async resolve() { return null; },
      async set() {},
      async unset() {},
    },
    logger: () => ({ error() {}, warn() {}, info() {}, debug() {} }),
  };

  const production = await createProductionController(ctx, { dataDir }, {
    Controller: class {
      async initialize() { return { configured: false }; }
      async close() {}
    },
  });

  assert.equal(typeof production.close, 'function');
  assert.match(production.paths.config, /config\.json$/);
  assert.match(production.paths.workspaces, /workspaces\.json$/);
  await production.close();
});

test('WPS production accepts null config from Cordis loader', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-wps-production-null-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));

  const ctx = {
    apiProxy: {},
    credentials: {
      async resolve() { return null; },
      async set() {},
      async unset() {},
    },
    logger: () => ({ error() {}, warn() {}, info() {}, debug() {} }),
  };

  const production = await createProductionController(ctx, null, {
    Controller: class {
      async initialize() { return { configured: false }; }
      async close() {}
    },
  });

  assert.match(production.paths.config, /config\.json$/);
  await production.close();
});
