const DEFAULT_TIMEOUT_MS = 30_000;

export class MimiqBackendError extends Error {
  constructor(message, { status = null, code = 'BACKEND_ERROR', detail = null } = {}) {
    super(message);
    this.name = 'MimiqBackendError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function mapStatusToCode(status, detail) {
  if (status === 402) return 'INSUFFICIENT_CREDITS';
  if (status === 404) return 'URL_UNREACHABLE';
  if (status >= 400 && status < 500) return 'INVALID_INPUT';
  if (status >= 500) return 'BACKEND_ERROR';
  if (String(detail || '').toLowerCase().includes('timeout')) return 'SIM_TIMEOUT';
  return 'BACKEND_ERROR';
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export class MimiqBackendClient {
  constructor({ baseUrl, apiKey, requestTimeoutMs = DEFAULT_TIMEOUT_MS }) {
    this.baseUrl = String(baseUrl || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');
    this.apiKey = apiKey || null;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async _request(path, { method = 'GET', body = null, timeoutMs = this.requestTimeoutMs, apiKeyOverride = null, mcpClientId = null, clientIp = null, requestId = null } = {}) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort('timeout'), timeoutMs);
    try {
      const headers = { 'Content-Type': 'application/json' };
      const effectiveKey = apiKeyOverride || this.apiKey;
      if (effectiveKey) headers['X-API-Key'] = effectiveKey;
      if (mcpClientId && !effectiveKey) headers['X-MCP-Client-Id'] = mcpClientId;
      if (clientIp) headers['X-Forwarded-For'] = clientIp;
      if (requestId) headers['X-Request-Id'] = requestId;

      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ac.signal,
      });
      const payload = await parseJsonSafe(res);
      if (!res.ok) {
        const detail = payload?.detail || payload?.error || `${res.status} ${res.statusText}`;
        throw new MimiqBackendError(detail, {
          status: res.status,
          code: mapStatusToCode(res.status, detail),
          detail,
        });
      }
      return payload;
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new MimiqBackendError(`Request timeout for ${path}`, { code: 'SIM_TIMEOUT' });
      }
      if (err instanceof MimiqBackendError) throw err;
      throw new MimiqBackendError(err?.message || 'Unknown backend error', { code: 'BACKEND_ERROR' });
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    return this._request('/health');
  }

  async getUsage({ apiKey = null, mcpClientId = null, clientIp = null, requestId = null } = {}) {
    return this._request('/usage', { apiKeyOverride: apiKey, mcpClientId, clientIp, requestId });
  }

  async generateAudience({ prompt, count, apiKey = null, mcpClientId = null, clientIp = null, requestId = null }) {
    return this._request('/personas/generate-from-prompt', {
      method: 'POST',
      body: {
        prompt,
        count,
        name: 'MCP Audience',
      },
      timeoutMs: 180_000,
      apiKeyOverride: apiKey,
      mcpClientId,
      clientIp,
      requestId,
    });
  }

  async createSimulation({ audienceId, type, content, webMode = 'quick', goal = null, context = null, maxSteps = null, apiKey = null, mcpClientId = null, clientIp = null, requestId = null }) {
    const payload = await this._request('/simulations', {
      method: 'POST',
      body: {
        project_id: 'mcp',
        audience_id: audienceId,
        type,
        content,
        web_mode: webMode,
        goal: goal || undefined,
        context: context || undefined,
        max_steps: Number.isFinite(Number(maxSteps)) ? Number(maxSteps) : undefined,
      },
      apiKeyOverride: apiKey,
      mcpClientId,
      clientIp,
      requestId,
    });
    if (!payload?.simulation_id) {
      throw new MimiqBackendError('Missing simulation_id from backend', { code: 'BACKEND_ERROR' });
    }
    return payload.simulation_id;
  }

  async getSimulation(id, { apiKey = null, mcpClientId = null, clientIp = null, requestId = null } = {}) {
    return this._request(`/simulations/${id}`, { apiKeyOverride: apiKey, mcpClientId, clientIp, requestId });
  }

  async getResults(id, { apiKey = null, mcpClientId = null, clientIp = null, requestId = null } = {}) {
    return this._request(`/simulations/${id}/results`, { apiKeyOverride: apiKey, mcpClientId, clientIp, requestId });
  }

  async pollSimulation(simulationId, { timeoutMs = 180_000, intervalMs = 600, apiKey = null, mcpClientId = null, clientIp = null, requestId = null } = {}) {
    const end = Date.now() + timeoutMs;
    let pollCount = 0;
    let consecutiveErrors = 0;
    while (Date.now() < end) {
      try {
        const state = await this.getSimulation(simulationId, { apiKey, mcpClientId, clientIp, requestId });
        consecutiveErrors = 0;
        pollCount++;
        const status = String(state?.status || '').toUpperCase();
        if (pollCount % 50 === 0) console.log(`[poll] ${simulationId.substring(0,8)} #${pollCount} status=${status}`);
        if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' || status === 'CANCELED') {
          return state;
        }
      } catch (pollErr) {
        consecutiveErrors++;
        console.error(`[poll] ${simulationId.substring(0,8)} error #${consecutiveErrors}: ${pollErr?.message} (${pollErr?.code})`);
        if (consecutiveErrors >= 5) throw pollErr;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new MimiqBackendError(`Simulation timed out after ${Math.round(timeoutMs / 1000)}s`, {
      code: 'SIM_TIMEOUT',
    });
  }

  async runSurvey({ audiencePrompt, count, question, options, context, concurrency, apiKey = null, mcpClientId = null, clientIp = null, requestId = null }) {
    return this._request('/surveys/simulate', {
      method: 'POST',
      body: {
        project_id: 'mcp',
        audience_prompt: audiencePrompt,
        count,
        question,
        options,
        context,
        concurrency,
      },
      timeoutMs: 240_000,
      apiKeyOverride: apiKey,
      mcpClientId,
      clientIp,
      requestId,
    });
  }
}
