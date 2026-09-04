/**
 * Thin HTTP client for TeamSpace REST API (:8090).
 * Supports explicit Bearer token, or autoDevLogin via POST /api/auth/dev-login.
 */

export class TeamSpaceClient {
  /**
   * @param {{
   *   baseUrl: string
   *   token?: string
   *   autoDevLogin?: boolean
   *   devUserId?: number
   *   timeoutMs?: number
   * }} config
   */
  constructor(config) {
    this.baseUrl = String(config.baseUrl || 'http://127.0.0.1:8090').replace(/\/+$/, '')
    this.token = String(config.token || '').trim()
    this.autoDevLogin = config.autoDevLogin !== false
    this.devUserId = Number(config.devUserId) || 1
    this.timeoutMs = Number(config.timeoutMs) || 15_000
    /** @type {Promise<void> | null} */
    this._loginPromise = null
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {{ body?: unknown, signal?: AbortSignal, query?: Record<string, string | number | boolean | undefined> }} [opts]
   */
  async request(method, path, opts = {}) {
    await this.ensureAuth()
    const url = this.buildUrl(path, opts.query)
    const headers = {
      Accept: 'application/json',
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }
    let body
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opts.body)
    }

    const signal = mergeAbortSignals(opts.signal, AbortSignal.timeout(this.timeoutMs))
    const res = await fetch(url, { method, headers, body, signal })
    const text = await res.text()
    const data = text ? tryParseJson(text) : null

    if (res.status === 401 && this.autoDevLogin && !opts._retried) {
      this.token = ''
      await this.ensureAuth(true)
      return this.request(method, path, { ...opts, _retried: true })
    }

    if (!res.ok) {
      const message = formatApiError(res.status, data, text)
      const err = new Error(message)
      err.status = res.status
      err.data = data
      throw err
    }
    return data
  }

  get(path, opts) {
    return this.request('GET', path, opts)
  }

  /**
   * @param {boolean} [force]
   */
  async ensureAuth(force = false) {
    if (this.token && !force) return
    if (!this.autoDevLogin) {
      throw new Error(
        'TeamSpace token 未配置。请在插件 config.token 填入 Bearer token，'
        + '或开启 autoDevLogin（需服务端 DEV_MODE）。',
      )
    }
    if (!this._loginPromise || force) {
      this._loginPromise = this.devLogin().finally(() => {
        this._loginPromise = null
      })
    }
    await this._loginPromise
  }

  async devLogin() {
    const url = `${this.baseUrl}/api/auth/dev-login`
    const signal = AbortSignal.timeout(this.timeoutMs)
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: this.devUserId }),
      signal,
    })
    const text = await res.text()
    const data = text ? tryParseJson(text) : null
    if (!res.ok) {
      throw new Error(
        `TeamSpace autoDevLogin 失败 (${res.status}): `
        + formatApiError(res.status, data, text)
        + '。请确认 server 已启动且 DEV_MODE=true，或手动配置 token。',
      )
    }
    const token = data?.token
    if (!token) {
      throw new Error('TeamSpace autoDevLogin 未返回 token')
    }
    this.token = String(token)
  }

  /**
   * @param {string} path
   * @param {Record<string, string | number | boolean | undefined>} [query]
   */
  buildUrl(path, query) {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue
        url.searchParams.set(key, String(value))
      }
    }
    return url
  }
}

function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function formatApiError(status, data, text) {
  if (data && typeof data === 'object') {
    const parts = [data.error, data.message].filter(Boolean)
    if (parts.length) return parts.join(': ')
  }
  return text?.slice(0, 300) || `HTTP ${status}`
}

/**
 * @param {AbortSignal | undefined} a
 * @param {AbortSignal} b
 */
function mergeAbortSignals(a, b) {
  if (!a) return b
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([a, b])
  }
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (a.aborted || b.aborted) {
    controller.abort()
    return controller.signal
  }
  a.addEventListener('abort', onAbort, { once: true })
  b.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}
