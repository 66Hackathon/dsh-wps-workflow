import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { WPS_MODES, WPS_SECRET_REF, WPS_TRANSPORTS } from './protocol.mjs';

const APP_ID = /^AK[0-9A-Za-z_-]{6,}$/;

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function maskWpsAppId(appId) {
  const text = cleanString(appId);
  if (!text) return 'AK••••';
  return text.length > 12 ? `${text.slice(0, 8)}••••${text.slice(-4)}` : 'AK••••';
}

export function normalizeWpsConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const appId = cleanString(value.appId);
  const appSecretRef = cleanString(value.appSecretRef) ?? WPS_SECRET_REF;
  const transport = cleanString(value.transport) ?? WPS_TRANSPORTS.WEBSOCKET;
  const callbackPort = Number(value.callbackPort ?? 18_765);
  const callbackPath = cleanString(value.callbackPath) ?? '/wps/events';
  const mode = cleanString(value.mode) ?? WPS_MODES.HARNESS;
  if (!appId || !APP_ID.test(appId)) return null;
  if (![WPS_TRANSPORTS.WEBSOCKET, WPS_TRANSPORTS.HTTP].includes(transport)) return null;
  if (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65_535) return null;
  if (!callbackPath.startsWith('/')) return null;
  if (![WPS_MODES.ECHO, WPS_MODES.HARNESS].includes(mode)) return null;
  return Object.freeze({
    version: 1,
    appId,
    appSecretRef,
    transport,
    callbackPort,
    callbackPath,
    mode,
    createdAt: cleanString(value.createdAt) ?? new Date().toISOString(),
    updatedAt: cleanString(value.updatedAt) ?? new Date().toISOString(),
  });
}

export class WpsConfigStore {
  #path;
  #value = null;
  #queue = Promise.resolve();

  constructor(path) {
    this.#path = path;
  }

  async load() {
    try {
      const normalized = normalizeWpsConfig(JSON.parse(await readFile(this.#path, 'utf8')));
      if (!normalized) throw new Error('dsh-wps config is invalid');
      this.#value = normalized;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.#value = null;
    }
    return this;
  }

  get() {
    return this.#value ? structuredClone(this.#value) : null;
  }

  async save(value) {
    const normalized = normalizeWpsConfig({
      ...value,
      updatedAt: new Date().toISOString(),
      createdAt: value?.createdAt ?? this.#value?.createdAt ?? new Date().toISOString(),
    });
    if (!normalized) throw new Error('Refusing to persist invalid WPS configuration');
    const operation = this.#queue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      const temporary = `${this.#path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.#path);
      this.#value = normalized;
    });
    this.#queue = operation.then(() => undefined, () => undefined);
    await operation;
    return this.get();
  }

  async clear() {
    const operation = this.#queue.then(async () => {
      try {
        await unlink(this.#path);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      this.#value = null;
    });
    this.#queue = operation.then(() => undefined, () => undefined);
    await operation;
  }
}
