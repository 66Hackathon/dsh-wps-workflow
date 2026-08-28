import { splitMessageText } from '../shared/editable-message-stream.mjs';
import { connectionTestMessage } from '../shared/connection-test.mjs';
import { t } from '../shared/i18n.mjs';
import { createWpsCallbackServer } from './callback-server.mjs';
import { createWpsEchoHandler } from './wps-echo.mjs';
import {
  isP2pChatType,
  parseWpsChatMessageEvent,
  shouldHandleIncomingMessage,
} from './message-parser.mjs';
import { createWpsBridgeStatus, WpsHarnessBridge } from './wps-bridge.mjs';
import { WPS_MODES, WPS_TRANSPORTS } from './protocol.mjs';
import {
  createWpsStreamingSession,
  WPS_CARD_MAX_CHARS,
} from './wps-streaming-card.mjs';
import { WpsApiClient } from './wps-api.mjs';
import { WpsTokenProvider } from './wps-app.mjs';
import { WpsEventWebSocket, isWpsChatMessageCreate } from './wps-event-ws.mjs';
import { wpsLogError, wpsTrace } from './wps-trace.mjs';

export function normalizeWpsMessage(parsed, { appId } = {}) {
  if (!parsed || !shouldHandleIncomingMessage(parsed, { appId })) return null;
  const direct = isP2pChatType(parsed.chatType);
  const kind = direct ? 'direct' : 'group';
  return {
    messageId: parsed.messageId,
    senderId: parsed.senderId,
    senderIsBot: parsed.senderType === 'app',
    kind,
    conversationId: parsed.chatId,
    content: parsed.text ?? '',
    plainText: true,
    images: [],
    files: [],
    addressed: direct || parsed.isAtBot,
    replyTarget: { chatId: parsed.chatId },
    connectionTestTarget: { chatId: parsed.chatId },
  };
}

export class WpsBotClient {
  #api;
  #signal;
  #logger;

  constructor({ api, signal, logger = console }) {
    this.#api = api;
    this.#signal = signal;
    this.#logger = logger;
  }

  async sendText(target, text) {
    const chunks = splitMessageText(text, WPS_CARD_MAX_CHARS);
    const providerMessageIds = [];
    for (const chunk of chunks) {
      this.#signal?.throwIfAborted();
      const result = await this.#api.createTextMessage({
        chatId: target.chatId,
        text: chunk,
        markdown: true,
      });
      if (result.messageId) providerMessageIds.push(result.messageId);
    }
    return { providerMessageIds };
  }

  async openStream(target) {
    const logger = this.#logger;
    const sendText = this.sendText.bind(this);
    let broken = false;
    const session = createWpsStreamingSession({
      sendCard: async (payload) => {
        this.#signal?.throwIfAborted();
        const result = await this.#api.createMessage({
          chatId: target.chatId,
          type: payload.type,
          content: payload.content,
        });
        return { messageId: result.messageId, message_id: result.messageId };
      },
      updateCard: async (messageId, payload) => {
        this.#signal?.throwIfAborted();
        await this.#api.updateMessage({
          messageId,
          type: payload.type,
          content: payload.content,
        });
      },
      logger: this.#logger,
      onUpdateError: () => {
        broken = true;
      },
    });
    const { controller } = await session.begin();
    wpsTrace('openStream placeholder sent', { chatId: target.chatId, messageId: controller.messageId });
    const providerMessageIds = controller.messageId ? [controller.messageId] : [];
    return {
      messageId: controller.messageId,
      get providerMessageIds() {
        return [...providerMessageIds];
      },
      update(text) {
        if (broken || typeof text !== 'string' || !text.trim()) return undefined;
        // Harness 轮询约 300ms；立即 flush 与飞书一致，且自然受轮询频率限制。
        return controller.setContent(text).catch((error) => {
          broken = true;
          wpsLogError('streaming card update failed:', error);
          logger.warn?.('[dsh-wps] streaming card update failed:', error);
        });
      },
      async finish(text) {
        if (broken) {
          const result = await sendText(target, text);
          providerMessageIds.push(...(result.providerMessageIds ?? []));
          return result;
        }
        try {
          await controller.finish(text);
          return { providerMessageIds: [...providerMessageIds] };
        } catch (error) {
          broken = true;
          wpsLogError('streaming card finish failed; falling back to text:', error);
          logger.warn?.('[dsh-wps] streaming card finish failed; falling back to text:', error);
          const result = await sendText(target, text);
          providerMessageIds.push(...(result.providerMessageIds ?? []));
          return result;
        }
      },
      cancel() {
        controller.cancel();
      },
    };
  }
}

export function createWpsRuntimeStatus() {
  return {
    startedAt: null,
    ready: false,
    connectionState: 'idle',
    harnessReachable: false,
    lastCheckedAt: null,
    lastConnectedAt: null,
    lastError: null,
    ...createWpsBridgeStatus(),
  };
}

export class WpsRuntime {
  #config;
  #secret;
  #harness;
  #state;
  #logger;
  #replyTimeoutMs;
  #internals;
  #createApi;
  #createTokenProvider;
  #status = createWpsRuntimeStatus();
  #tokenProvider = null;
  #api = null;
  #bridge = null;
  #transport = null;
  #callbackUrl = null;
  #abortController = null;
  #stopped = true;

  constructor({
    config,
    secret,
    harness,
    state,
    logger = console,
    replyTimeoutMs = 600_000,
    internals = {},
    createApi = (options) => new WpsApiClient(options),
    createTokenProvider = (options) => new WpsTokenProvider(options),
  }) {
    if (!config || !secret) throw new TypeError('WpsRuntime requires config and app secret');
    if (config.mode === WPS_MODES.HARNESS && (!harness || !state)) {
      throw new TypeError('WpsRuntime harness mode requires Harness client and state store');
    }
    this.#config = config;
    this.#secret = secret;
    this.#harness = harness;
    this.#state = state;
    this.#logger = logger;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#internals = internals;
    this.#createApi = createApi;
    this.#createTokenProvider = createTokenProvider;
  }

  get status() {
    return structuredClone({
      ...this.#status,
      callbackUrl: this.#callbackUrl,
      transport: this.#config.transport ?? null,
      mode: this.#config.mode ?? WPS_MODES.HARNESS,
    });
  }

  async sendConnectionTest(text) {
    if (!this.#status.ready || !this.#bridge) {
      const error = new Error(t('WPS 协作尚未连接'));
      error.code = 'test-target-unavailable';
      throw error;
    }
    return this.#bridge.sendConnectionTest(text);
  }

  async start() {
    if (this.#status.ready && this.#transport) return this.status;
    await this.stop();
    this.#stopped = false;
    this.#status.startedAt = new Date().toISOString();
    this.#status.connectionState = 'connecting';
    this.#status.lastError = null;
    const controller = new AbortController();
    this.#abortController = controller;
    try {
      if (this.#config.mode === WPS_MODES.HARNESS) {
        await this.#harness.ensureRunning({ signal: controller.signal });
        this.#status.harnessReachable = true;
      }
      this.#tokenProvider = this.#createTokenProvider({
        appId: this.#config.appId,
        appSecret: this.#secret,
        fetch: this.#internals.fetch,
      });
      await this.#tokenProvider.verifyCredentials();
      this.#api = this.#createApi({
        tokenProvider: this.#tokenProvider,
        fetch: this.#internals.fetch,
      });
      const onEvent = this.#config.mode === WPS_MODES.ECHO
        ? createWpsEchoHandler({
          api: this.#api,
          appId: this.#config.appId,
          logger: this.#logger,
        })
        : this.#createHarnessEventHandler(controller.signal);
      await this.#startTransport(onEvent);
      const now = Date.now();
      this.#status.ready = true;
      this.#status.connectionState = 'connected';
      this.#status.lastCheckedAt = now;
      this.#status.lastConnectedAt = now;
      console.warn('[dsh-wps] connected', {
        mode: this.#config.mode,
        transport: this.#config.transport,
        appId: this.#config.appId,
      });
      return this.status;
    } catch (error) {
      this.#status.ready = false;
      this.#status.connectionState = 'failed';
      this.#status.lastError = error?.message ?? String(error);
      await this.stop();
      throw error;
    }
  }

  async stop() {
    this.#stopped = true;
    this.#abortController?.abort();
    this.#abortController = null;
    const transport = this.#transport;
    const bridge = this.#bridge;
    this.#transport = null;
    this.#bridge = null;
    this.#api = null;
    this.#tokenProvider = null;
    this.#callbackUrl = null;
    if (transport) await transport.close?.();
    await Promise.race([
      bridge?.waitForIdle() ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    this.#status.ready = false;
    this.#status.connectionState = 'idle';
    return this.status;
  }

  #createHarnessEventHandler(signal) {
    const client = new WpsBotClient({ api: this.#api, signal, logger: this.#logger });
    this.#bridge = new WpsHarnessBridge({
      bot: client,
      harness: this.#harness,
      state: this.#state,
      status: this.#status,
      logger: this.#logger,
      replyTimeoutMs: this.#replyTimeoutMs,
      signal,
    });
    return async (event) => {
      if (!isWpsChatMessageCreate(event)) return;
      const parsed = parseWpsChatMessageEvent(event.plain);
      const message = normalizeWpsMessage(parsed, { appId: this.#config.appId });
      if (!message || !this.#bridge) return;
      wpsTrace('incoming message', {
        chatId: message.conversationId,
        kind: message.kind,
        preview: String(message.content ?? '').slice(0, 80),
      });
      await this.#bridge.accept(message);
    };
  }

  async #startTransport(onEvent) {
    if (this.#config.transport === WPS_TRANSPORTS.HTTP) {
      const server = createWpsCallbackServer({
        appId: this.#config.appId,
        appSecret: this.#secret,
        path: this.#config.callbackPath,
        onEvent,
        logger: this.#logger,
      });
      const endpoint = await server.listen('127.0.0.1', this.#config.callbackPort);
      this.#transport = server;
      this.#callbackUrl = endpoint.url;
      return;
    }
    const socket = new WpsEventWebSocket({
      appId: this.#config.appId,
      appSecret: this.#secret,
      WebSocket: this.#internals.WebSocket,
      onEvent,
      logger: this.#logger,
    });
    await socket.connect();
    this.#transport = socket;
    this.#callbackUrl = null;
  }
}

export function createWpsConnectionTestMessage(appIdMasked) {
  return connectionTestMessage(
    appIdMasked,
    t('WPS 协作'),
  );
}
