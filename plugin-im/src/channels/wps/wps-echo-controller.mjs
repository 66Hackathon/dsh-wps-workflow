import { createWpsCallbackServer } from './callback-server.mjs';
import { maskWpsAppId, WpsConfigStore } from './config-store.mjs';
import { createWpsEchoHandler } from './wps-echo.mjs';
import { WpsEventWebSocket } from './wps-event-ws.mjs';
import { WpsApiClient } from './wps-api.mjs';
import { WpsTokenProvider } from './wps-app.mjs';
import { WPS_MODES, WPS_SECRET_REF, WPS_TRANSPORTS } from './protocol.mjs';

function publicConfig(config) {
  if (!config) return null;
  return {
    appIdMasked: maskWpsAppId(config.appId),
    transport: config.transport,
    callbackPort: config.callbackPort,
    callbackPath: config.callbackPath,
    mode: config.mode,
  };
}

export class WpsEchoController {
  #credentials;
  #store;
  #logger;
  #tokenProvider = null;
  #api = null;
  #transport = null;
  #callbackUrl = null;
  #connected = false;
  #lastError = null;
  #transition = Promise.resolve();
  #internals;

  constructor({
    credentials,
    configStore,
    logger = console,
    internals = {},
  }) {
    if (!credentials?.resolve || !credentials?.set || !credentials?.unset) {
      throw new TypeError('WPS echo controller requires ctx.credentials');
    }
    if (!(configStore instanceof WpsConfigStore)) {
      throw new TypeError('WPS echo controller requires WpsConfigStore');
    }
    this.#credentials = credentials;
    this.#store = configStore;
    this.#logger = logger;
    this.#internals = internals;
  }

  async initialize() {
    const config = this.#store.get();
    if (!config) return this.status();
    return this.#serial(async () => {
      try {
        await this.#startFromConfig(config);
      } catch (error) {
        this.#lastError = presentError(error);
      }
      return this.status();
    });
  }

  status() {
    const config = this.#store.get();
    return {
      configured: Boolean(config),
      connected: this.#connected,
      mode: config?.mode ?? WPS_MODES.ECHO,
      tokenConfigured: Boolean(config),
      state: !config ? 'unconfigured' : this.#connected ? 'connected' : 'disconnected',
      config: publicConfig(config),
      transport: config?.transport ?? null,
      callbackUrl: this.#callbackUrl,
      health: {
        lastError: this.#lastError,
      },
    };
  }

  async configure(input = {}) {
    return this.#serial(async () => {
      const appId = typeof input.appId === 'string' ? input.appId.trim() : '';
      const appSecret = typeof input.appSecret === 'string' ? input.appSecret.trim() : '';
      const transport = input.transport === WPS_TRANSPORTS.HTTP
        ? WPS_TRANSPORTS.HTTP
        : WPS_TRANSPORTS.WEBSOCKET;
      const callbackPort = Number(input.callbackPort ?? 18_765);
      const callbackPath = typeof input.callbackPath === 'string' && input.callbackPath.startsWith('/')
        ? input.callbackPath
        : '/wps/events';
      const existing = this.#store.get();
      if (!appId) throw new TypeError('WPS App ID 不能为空');
      if (!appSecret && !existing) throw new TypeError('WPS App ID 和 App Secret 不能为空');

      await this.#stopTransport();
      if (appSecret) {
        await this.#credentials.set(WPS_SECRET_REF, appSecret);
      }
      const config = await this.#store.save({
        appId,
        appSecretRef: WPS_SECRET_REF,
        transport,
        callbackPort,
        callbackPath,
        mode: WPS_MODES.ECHO,
      });
      await this.#startFromConfig(config);
      this.#lastError = null;
      return this.status();
    });
  }

  async reconnect() {
    return this.#serial(async () => {
      const config = this.#store.get();
      if (!config) throw new Error('尚未配置 WPS 企业应用');
      await this.#stopTransport();
      await this.#startFromConfig(config);
      this.#lastError = null;
      return this.status();
    });
  }

  async test() {
    const config = this.#store.get();
    if (!config) throw new Error('尚未配置 WPS 企业应用');
    const secret = await this.#resolveSecret(config);
    const provider = this.#createTokenProvider(config, secret);
    await provider.verifyCredentials();
    return { ok: true };
  }

  async remove() {
    return this.#serial(async () => {
      await this.#stopTransport();
      await this.#store.clear();
      try {
        await this.#credentials.unset(WPS_SECRET_REF);
      } catch {
        // read-only credential shadowing is acceptable
      }
      this.#tokenProvider = null;
      this.#api = null;
      this.#lastError = null;
      return this.status();
    });
  }

  async close() {
    await this.#serial(() => this.#stopTransport());
  }

  async #startFromConfig(config) {
    const secret = await this.#resolveSecret(config);
    this.#tokenProvider = this.#createTokenProvider(config, secret);
    await this.#tokenProvider.verifyCredentials();
    this.#api = new WpsApiClient({
      tokenProvider: this.#tokenProvider,
      fetch: this.#internals.fetch,
    });
    const onEvent = createWpsEchoHandler({
      api: this.#api,
      appId: config.appId,
      logger: this.#logger,
    });
    if (config.transport === WPS_TRANSPORTS.HTTP) {
      const server = createWpsCallbackServer({
        appId: config.appId,
        appSecret: secret,
        path: config.callbackPath,
        onEvent,
        logger: this.#logger,
      });
      const endpoint = await server.listen('127.0.0.1', config.callbackPort);
      this.#transport = server;
      this.#callbackUrl = endpoint.url;
      this.#connected = true;
      return;
    }
    const socket = new WpsEventWebSocket({
      appId: config.appId,
      appSecret: secret,
      WebSocket: this.#internals.WebSocket,
      onEvent,
      logger: this.#logger,
    });
    await socket.connect();
    this.#transport = socket;
    this.#callbackUrl = null;
    this.#connected = true;
  }

  async #stopTransport() {
    this.#connected = false;
    this.#callbackUrl = null;
    const transport = this.#transport;
    this.#transport = null;
    if (!transport) return;
    await transport.close?.();
  }

  async #resolveSecret(config) {
    const resolved = await this.#credentials.resolve(config.appSecretRef);
    if (!resolved?.value) throw new Error('WPS App Secret 缺失，请重新保存凭据');
    return resolved.value;
  }

  #createTokenProvider(config, secret) {
    return new WpsTokenProvider({
      appId: config.appId,
      appSecret: secret,
      fetch: this.#internals.fetch,
    });
  }

  #serial(task) {
    const run = this.#transition.then(task);
    this.#transition = run.then(() => undefined, () => undefined);
    return run;
  }
}

function presentError(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'wps-connection-failed',
    message: error instanceof Error ? error.message : 'WPS Echo 连接失败',
  };
}
