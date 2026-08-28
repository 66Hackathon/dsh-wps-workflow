import { maskWpsAppId, WpsConfigStore } from './config-store.mjs';
import { WPS_MODES, WPS_SECRET_REF, WPS_TRANSPORTS, wpsBotId } from './protocol.mjs';
import { WpsTokenProvider } from './wps-app.mjs';
import { WpsRuntime } from './wps-runtime.mjs';
import { createBotWorkspaceScope } from '../shared/bot-workspace-store.mjs';

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

export class WpsController {
  #credentials;
  #store;
  #stateStore;
  #harness;
  #workspaces;
  #agentPresetCatalog;
  #defaultAgentPreset;
  #logger;
  #createRuntime;
  #internals;
  #runtime = null;
  #lastError = null;
  #transition = Promise.resolve();

  constructor({
    credentials,
    configStore,
    stateStore,
    harness = null,
    workspaces = null,
    agentPresetCatalog = null,
    defaultAgentPreset,
    logger = console,
    createRuntime,
    internals = {},
  }) {
    if (!credentials?.resolve || !credentials?.set || !credentials?.unset) {
      throw new TypeError('WPS controller requires ctx.credentials');
    }
    if (!(configStore instanceof WpsConfigStore)) {
      throw new TypeError('WPS controller requires WpsConfigStore');
    }
    if (!stateStore) throw new TypeError('WPS controller requires WpsStateStore');
    this.#credentials = credentials;
    this.#store = configStore;
    this.#stateStore = stateStore;
    this.#harness = harness;
    this.#workspaces = workspaces;
    this.#agentPresetCatalog = agentPresetCatalog;
    this.#defaultAgentPreset = defaultAgentPreset;
    this.#logger = logger;
    this.#createRuntime = createRuntime ?? ((options) => new WpsRuntime(options));
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
    const runtime = this.#runtime?.status ?? null;
    const workspace = config?.appId && this.#workspaces?.has(wpsBotId(config.appId))
      ? this.#workspaces.workspaceFor(wpsBotId(config.appId))
      : null;
    return {
      configured: Boolean(config),
      connected: runtime?.ready === true,
      mode: config?.mode ?? WPS_MODES.HARNESS,
      tokenConfigured: Boolean(config),
      state: !config ? 'unconfigured' : runtime?.ready ? 'connected' : 'disconnected',
      config: publicConfig(config),
      workspace,
      transport: config?.transport ?? runtime?.transport ?? null,
      callbackUrl: runtime?.callbackUrl ?? null,
      health: {
        lastError: this.#lastError,
        runtime,
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
      const mode = input.mode === WPS_MODES.ECHO ? WPS_MODES.ECHO : WPS_MODES.HARNESS;
      const existing = this.#store.get();
      if (!appId) throw new TypeError('WPS App ID 不能为空');
      if (!appSecret && !existing) throw new TypeError('WPS App ID 和 App Secret 不能为空');

      await this.#stopRuntime();
      if (appSecret) {
        await this.#credentials.set(WPS_SECRET_REF, appSecret);
      }
      const config = await this.#store.save({
        appId,
        appSecretRef: WPS_SECRET_REF,
        transport,
        callbackPort,
        callbackPath,
        mode,
      });
      const previousBotId = existing?.appId ? wpsBotId(existing.appId) : null;
      const nextBotId = wpsBotId(config.appId);
      if (this.#workspaces) {
        if (previousBotId && previousBotId !== nextBotId) {
          await this.#workspaces.remove(previousBotId).catch(() => undefined);
        }
        await this.#workspaces.ensure(nextBotId, {
          defaultAgentPreset: this.#defaultAgentPreset,
        });
      }
      await this.#startFromConfig(config);
      this.#lastError = null;
      return this.status();
    });
  }

  async reconnect() {
    return this.#serial(async () => {
      const config = this.#store.get();
      if (!config) throw new Error('尚未配置 WPS 企业应用');
      await this.#stopRuntime();
      await this.#startFromConfig(config);
      this.#lastError = null;
      return this.status();
    });
  }

  async test() {
    const config = this.#store.get();
    if (!config) throw new Error('尚未配置 WPS 企业应用');
    const secret = await this.#resolveSecret(config);
    const provider = new WpsTokenProvider({
      appId: config.appId,
      appSecret: secret,
      fetch: this.#internals.fetch,
    });
    await provider.verifyCredentials();
    if (config.mode === WPS_MODES.HARNESS && this.#harness?.ensureRunning) {
      await this.#harness.ensureRunning();
    }
    return { ok: true };
  }

  async remove() {
    return this.#serial(async () => {
      const config = this.#store.get();
      await this.#stopRuntime();
      if (config?.appId && this.#workspaces) {
        await this.#workspaces.remove(wpsBotId(config.appId)).catch(() => undefined);
      }
      await this.#store.clear();
      await this.#stateStore.clearSessions?.().catch(() => undefined);
      try {
        await this.#credentials.unset(WPS_SECRET_REF);
      } catch {
        // read-only credential shadowing is acceptable
      }
      this.#lastError = null;
      return this.status();
    });
  }

  async close() {
    await this.#serial(() => this.#stopRuntime());
  }

  async #startFromConfig(config) {
    const secret = await this.#resolveSecret(config);
    let harness = null;
    let state = this.#stateStore;
    if (config.mode === WPS_MODES.HARNESS && this.#harness) {
      if (this.#workspaces) {
        await this.#workspaces.ensure(wpsBotId(config.appId), {
          defaultAgentPreset: this.#defaultAgentPreset,
        });
        const scope = createBotWorkspaceScope(this.#harness, {
          botId: wpsBotId(config.appId),
          workspaces: this.#workspaces,
          state: this.#stateStore,
          agentPresetCatalog: this.#agentPresetCatalog,
        });
        harness = scope.harness;
        state = scope.state;
      } else {
        harness = this.#harness;
      }
    }
    const runtime = this.#createRuntime({
      config,
      secret,
      harness,
      state,
      logger: this.#logger,
      internals: this.#internals,
    });
    this.#runtime = runtime;
    await runtime.start();
  }

  async #stopRuntime() {
    const runtime = this.#runtime;
    this.#runtime = null;
    if (runtime) await runtime.stop();
  }

  async #resolveSecret(config) {
    const resolved = await this.#credentials.resolve(config.appSecretRef);
    if (!resolved?.value) throw new Error('WPS App Secret 缺失，请重新保存凭据');
    return resolved.value;
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
    message: error instanceof Error ? error.message : 'WPS 连接失败',
  };
}
