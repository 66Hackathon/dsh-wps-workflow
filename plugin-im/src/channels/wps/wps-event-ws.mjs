import { createHash, createHmac } from 'node:crypto';

import {
  decryptEventData,
  verifyEventSignature,
  WPS_EVENT_OPERATION_CREATE,
  WPS_EVENT_TOPIC_CHAT_MESSAGE,
} from './event-crypto.mjs';
import { rfc1123Date } from './kso-sign.mjs';

export const DEFAULT_WPS_EVENT_WS_URL = 'wss://openapi.wps.cn/v7/event/ws';

function signWebSocketHeaders({ appId, appSecret, requestUri, ksoDate }) {
  const stringToSign = `KSO-1GET${requestUri}${ksoDate}`;
  const signature = createHmac('sha256', appSecret).update(stringToSign).digest('hex');
  return {
    'X-Kso-Date': ksoDate,
    'X-Kso-Authorization': `KSO-1 ${appId}:${signature}`,
    'X-Ack-Mode': 'required',
  };
}

function parseJsonMessage(data) {
  const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
  return text ? JSON.parse(text) : {};
}

/**
 * Outbound WebSocket transport for WPS encrypted events.
 * Avoids public callback URL during local development.
 */
export class WpsEventWebSocket {
  #appId;
  #appSecret;
  #url;
  #WebSocket;
  #onEvent;
  #logger;
  #socket = null;
  #closed = false;

  constructor({
    appId,
    appSecret,
    url = DEFAULT_WPS_EVENT_WS_URL,
    WebSocket,
    onEvent,
    logger = console,
  }) {
    if (!appId || !appSecret) throw new TypeError('WPS event WebSocket requires app credentials');
    if (typeof onEvent !== 'function') throw new TypeError('WPS event WebSocket requires onEvent');
    const ResolvedWebSocket = WebSocket ?? globalThis.WebSocket;
    if (!ResolvedWebSocket) throw new TypeError('WPS event WebSocket requires a WebSocket implementation');
    this.#appId = appId;
    this.#appSecret = appSecret;
    this.#url = url;
    this.#WebSocket = ResolvedWebSocket;
    this.#onEvent = onEvent;
    this.#logger = logger;
  }

  async connect() {
    if (this.#socket) return;
    const endpoint = new URL(this.#url);
    const headers = signWebSocketHeaders({
      appId: this.#appId,
      appSecret: this.#appSecret,
      requestUri: `${endpoint.pathname}${endpoint.search}`,
      ksoDate: rfc1123Date(),
    });
    const socket = new this.#WebSocket(this.#url, { headers });
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      this.#handleMessage(event.data).catch((error) => {
        this.#logger.error?.('[dsh-wps] websocket event failed:', error);
      });
    });
    socket.addEventListener('close', () => {
      this.#socket = null;
    });
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error?.error ?? error);
      };
      const cleanup = () => {
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
      };
      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onError);
    });
  }

  async close() {
    this.#closed = true;
    this.#socket?.close?.();
    this.#socket = null;
  }

  get connected() {
    return this.#socket?.readyState === 1;
  }

  async #handleMessage(raw) {
    const frame = parseJsonMessage(raw);
    if (frame.type === 'goaway') {
      this.#logger.warn?.('[dsh-wps] websocket goaway:', frame.reason ?? frame.message);
      if (frame.reason === 'connection_replaced') this.#closed = true;
      return;
    }
    if (!frame.topic || !frame.encrypted_data) return;
    if (!verifyEventSignature(frame, { appId: this.#appId, appSecret: this.#appSecret })) {
      this.#logger.warn?.('[dsh-wps] websocket signature check failed');
      return;
    }
    const plain = decryptEventData(frame.encrypted_data, {
      appSecret: this.#appSecret,
      nonce: frame.nonce,
    });
    this.#sendAck(frame.nonce);
    await this.#onEvent({
      topic: frame.topic,
      operation: frame.operation,
      plain,
      frame,
    });
  }

  #sendAck(nonce) {
    if (!nonce || !this.#socket || this.#socket.readyState !== 1) return;
    this.#socket.send(JSON.stringify({
      type: 'ack',
      nonce,
      code: 200,
    }));
  }
}

export function isWpsChatMessageCreate(event) {
  return event?.topic === WPS_EVENT_TOPIC_CHAT_MESSAGE
    && event?.operation === WPS_EVENT_OPERATION_CREATE;
}

// Keep hash helper exported for tests that need deterministic vectors.
export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}
