/**
 * Common interface for every AI provider.
 *
 * To add a provider, create ONE file in ./providers that default-exports a
 * subclass of AIProvider with the static metadata below and a `generate()`
 * implementation. The registry discovers it automatically.
 */

/** Normalized provider error with a human-readable message. */
export class AIError extends Error {
  /**
   * @param {'auth'|'rate_limit'|'timeout'|'network'|'bad_request'|'not_found'|'server'|'blocked'|'invalid_output'} code
   */
  constructor(code, message, { status, retryable = false, retryAfterMs } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }

  static fromHttp(status, providerMessage, retryAfter) {
    const detail = providerMessage ? ` Provider says: ${providerMessage}` : '';
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 || undefined : undefined;
    // Gemini answers 400 for invalid keys
    if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key/i.test(providerMessage || '')))
      return new AIError('auth', `Authentication failed: the API key is invalid or has no access to this model.${detail}`, { status });
    if (status === 404) return new AIError('not_found', `Model or endpoint not found: check the model name and base URL.${detail}`, { status });
    if (status === 429)
      return new AIError('rate_limit', `Rate limit or quota exceeded. Wait a moment or check your plan/billing.${detail}`, {
        status,
        retryable: true,
        retryAfterMs,
      });
    if (status === 400 || status === 422) return new AIError('bad_request', `The provider rejected the request.${detail}`, { status });
    if (status >= 500) return new AIError('server', `The provider had a temporary error (${status}).${detail}`, { status, retryable: true });
    return new AIError('server', `Unexpected response (${status}).${detail}`, { status });
  }
}

export class AIProvider {
  /** Unique adapter id stored in the DB. */
  static type = 'base';
  /** Label shown in the UI. */
  static label = 'Base provider';
  static description = '';
  /** Suggested models (the user can edit the list, names change over time). */
  static defaultModels = [];
  static defaultBaseUrl = '';
  static requiresKey = true;
  static requiresBaseUrl = false;
  static keyPlaceholder = '';

  /**
   * @param {{apiKey?:string, baseUrl?:string, model:string, temperature?:number, maxTokens?:number, timeoutMs?:number}} cfg
   */
  constructor(cfg) {
    this.apiKey = cfg.apiKey || '';
    this.baseUrl = (cfg.baseUrl || this.constructor.defaultBaseUrl).replace(/\/+$/, '');
    this.model = cfg.model || this.constructor.defaultModels[0];
    this.temperature = cfg.temperature ?? 0.7;
    this.maxTokens = cfg.maxTokens ?? 8192;
    this.timeoutMs = cfg.timeoutMs ?? 180000;
  }

  /**
   * Generate text.
   * @param {string} prompt  user prompt
   * @param {{system?:string, json?:boolean, maxTokens?:number, temperature?:number, fields?:object[], context?:object}} options
   * @returns {Promise<{text:string, usage:{inputTokens:number, outputTokens:number}, finishReason?:string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async generate(prompt, options = {}) {
    throw new Error(`${this.constructor.name}.generate() not implemented`);
  }

  /** Minimal call used by the "Test connection" button. */
  async testConnection() {
    const started = Date.now();
    const res = await this.generate('Reply with exactly the word: OK', { maxTokens: 512, json: false });
    return { ok: true, reply: res.text.trim().slice(0, 200), model: this.model, latencyMs: Date.now() - started, usage: res.usage };
  }

  /**
   * POST JSON with timeout and normalized errors.
   * If the provider rejects an optional parameter (e.g. some models refuse `temperature`),
   * the parameters listed in `droppable` are removed one by one and the call retried.
   */
  async postJson(url, { headers = {}, body, droppable = [] }) {
    const payload = { ...body };
    const remaining = droppable.filter((k) => k in payload);
    for (;;) {
      try {
        return await this.#post(url, headers, payload);
      } catch (err) {
        const param = err.code === 'bad_request' && remaining.find((k) => new RegExp(k, 'i').test(err.message));
        if (!param) throw err;
        delete payload[param];
        remaining.splice(remaining.indexOf(param), 1);
      }
    }
  }

  async #post(url, headers, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError')
        throw new AIError('timeout', `The provider did not answer within ${Math.round(this.timeoutMs / 1000)}s.`, { retryable: true });
      const host = (() => {
        try {
          return new URL(url).host;
        } catch {
          return url;
        }
      })();
      throw new AIError('network', `Cannot reach ${host} (${err.cause?.code || err.message}).`, { retryable: true });
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.type || data?.message || (typeof data?.error === 'string' ? data.error : '') || raw.slice(0, 300);
      throw AIError.fromHttp(res.status, String(msg).slice(0, 500), res.headers.get('retry-after'));
    }
    if (data == null) throw new AIError('server', 'The provider returned a non-JSON response.');
    return data;
  }

  /** Public metadata for the UI. */
  static describe() {
    return {
      type: this.type,
      label: this.label,
      description: this.description,
      defaultModels: this.defaultModels,
      defaultBaseUrl: this.defaultBaseUrl,
      requiresKey: this.requiresKey,
      requiresBaseUrl: this.requiresBaseUrl,
      keyPlaceholder: this.keyPlaceholder,
    };
  }
}
