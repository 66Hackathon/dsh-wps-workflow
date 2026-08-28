import { rfc1123Date, signKso1Request } from './kso-sign.mjs';

const DEFAULT_BASE_URL = 'https://openapi.wps.cn';

function apiError(operation, body, status) {
  const message = body?.msg ?? body?.message ?? `${operation} failed`;
  const error = new Error(message);
  error.code = body?.code ?? `wps-http-${status}`;
  error.status = status;
  return error;
}

function assertApiSuccess(operation, body, status) {
  if (!body || typeof body !== 'object') {
    throw new Error(`${operation} returned a non-JSON response`);
  }
  if (body.code !== undefined && body.code !== 0) {
    throw apiError(operation, body, status);
  }
  return body;
}

function textContent(text, { markdown = true } = {}) {
  return {
    text: {
      content: String(text ?? ''),
      type: markdown ? 'markdown' : 'plain',
    },
  };
}

export class WpsApiClient {
  #tokenProvider;
  #baseUrl;
  #fetchImpl;

  constructor({
    tokenProvider,
    baseUrl = DEFAULT_BASE_URL,
    fetch: fetchImpl = globalThis.fetch,
  } = {}) {
    if (!tokenProvider?.getAccessToken || !tokenProvider.appId || !tokenProvider.appSecret) {
      throw new TypeError('WpsApiClient requires a token provider with app credentials');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('WpsApiClient requires fetch');
    this.#tokenProvider = tokenProvider;
    this.#baseUrl = String(baseUrl).replace(/\/$/, '');
    this.#fetchImpl = fetchImpl;
  }

  async createMessage({ chatId, type, content }) {
    const body = await this.#request('POST', '/v7/messages/create', {
      type,
      receiver: {
        type: 'chat',
        receiver_id: String(chatId),
      },
      content,
    }, 'WPS create message');
    return {
      chatId: body.data?.chat_id ?? chatId,
      messageId: body.data?.message_id ?? null,
      raw: body,
    };
  }

  async createTextMessage({ chatId, text, markdown = true }) {
    return this.createMessage({
      chatId,
      type: 'text',
      content: textContent(text, { markdown }),
    });
  }

  async updateMessage({ messageId, type, content }) {
    return this.#request(
      'POST',
      `/v7/messages/${encodeURIComponent(messageId)}/update`,
      { type, content },
      'WPS update message',
    );
  }

  async updateCardMessage({ messageId, card }) {
    return this.updateMessage({
      messageId,
      type: 'card',
      content: { card },
    });
  }

  async #request(method, path, payload, operation) {
    const body = JSON.stringify(payload);
    const contentType = 'application/json';
    const ksoDate = rfc1123Date();
    const accessToken = await this.#tokenProvider.getAccessToken();
    const response = await this.#fetchImpl(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        ...signKso1Request({
          appId: this.#tokenProvider.appId,
          appSecret: this.#tokenProvider.appSecret,
          method,
          requestUri: path,
          contentType,
          ksoDate,
          body,
        }),
        'content-type': contentType,
        authorization: `Bearer ${accessToken}`,
      },
      body,
    });
    const text = await response.text();
    let json = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`${operation} returned non-JSON (${response.status})`);
      }
    }
    if (!response.ok) {
      throw apiError(operation, json, response.status);
    }
    return assertApiSuccess(operation, json, response.status);
  }
}
