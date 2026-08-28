const DEFAULT_BASE_URL = 'https://openapi.wps.cn';
const TOKEN_PATHS = ['/oauth2/token', '/openapi/oauth2/token'];
const TOKEN_SKEW_MS = 60_000;

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseTokenResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('WPS token response is not JSON');
  }
  if (body.access_token) {
    return {
      accessToken: String(body.access_token),
      expiresIn: Number(body.expires_in) || 7200,
      tokenType: body.token_type ?? 'bearer',
    };
  }
  const code = body.code ?? body.error;
  const message = body.msg ?? body.error_description ?? body.message ?? 'WPS token request failed';
  const error = new Error(typeof message === 'string' ? message : 'WPS token request failed');
  error.code = code;
  throw error;
}

/**
 * Cache tenant access_token for a self-built enterprise app.
 * @see https://open.wps.cn/documents/app-integration-dev/wps365/server/certification-authorization/get-token/selfapp-tenant-access-token
 */
export class WpsTokenProvider {
  #appId;
  #appSecret;
  #baseUrl;
  #fetchImpl;
  #now;
  #cache = null;

  constructor({
    appId,
    appSecret,
    baseUrl = DEFAULT_BASE_URL,
    fetch: fetchImpl = globalThis.fetch,
    now = Date.now,
  } = {}) {
    const normalizedAppId = clean(appId);
    const normalizedSecret = clean(appSecret);
    if (!normalizedAppId || !normalizedSecret) {
      throw new TypeError('WPS credentials require appId and appSecret');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('WPS token provider requires fetch');
    this.#appId = normalizedAppId;
    this.#appSecret = normalizedSecret;
    this.#baseUrl = String(baseUrl).replace(/\/$/, '');
    this.#fetchImpl = fetchImpl;
    this.#now = now;
  }

  get appId() {
    return this.#appId;
  }

  get appSecret() {
    return this.#appSecret;
  }

  invalidate() {
    this.#cache = null;
  }

  async getAccessToken({ force = false } = {}) {
    if (!force && this.#cache && this.#cache.expiresAt > this.#now() + TOKEN_SKEW_MS) {
      return this.#cache.accessToken;
    }
    const token = await this.#requestToken();
    this.#cache = {
      accessToken: token.accessToken,
      expiresAt: this.#now() + (token.expiresIn * 1000),
    };
    return token.accessToken;
  }

  async verifyCredentials() {
    const token = await this.getAccessToken({ force: true });
    return Object.freeze({
      appId: this.#appId,
      tokenType: 'bearer',
      accessTokenPreview: token.length > 12 ? `${token.slice(0, 8)}••••` : '••••',
    });
  }

  async #requestToken() {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.#appId,
      client_secret: this.#appSecret,
    }).toString();
    let lastError;
    for (const path of TOKEN_PATHS) {
      try {
        const response = await this.#fetchImpl(`${this.#baseUrl}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        });
        const text = await response.text();
        let json;
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(`WPS token endpoint returned non-JSON (${response.status})`);
        }
        if (!response.ok) {
          const error = new Error(json.msg ?? json.error_description ?? `WPS token HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return parseTokenResponse(json);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error('WPS token request failed');
  }
}

export async function verifyWpsApp(options) {
  const provider = options instanceof WpsTokenProvider ? options : new WpsTokenProvider(options);
  return provider.verifyCredentials();
}
