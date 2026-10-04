#!/usr/bin/env node
import http from 'http';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import { BridgeBroker } from './bridge-broker.js';
import { MimiqBackendClient, MimiqBackendError } from './mimiq-backend-client.js';
import {
  buildMcpEnvelope,
} from './mcp-envelope.js';
import {
  adaptResultsForBehavior,
} from './scoring.js';

const PORT = Number.parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';
const MCP_PATH = process.env.MIMIQ_MCP_PATH || '/mcp';
const BACKEND_API_URL = process.env.MIMIQ_API_URL || 'http://127.0.0.1:8000/api';
const BACKEND_API_KEY = process.env.MIMIQ_API_KEY || null;
const MCP_ENABLED = String(process.env.MIMIQ_MCP_ENABLED || 'true').toLowerCase() === 'true';

// PostHog analytics; fire-and-forget via HTTP API (no npm dependency)
const PH_KEY = process.env.POSTHOG_API_KEY || '';
const PH_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

function phCapture(distinctId, event, properties = {}) {
  if (!PH_KEY) return;
  const body = {
    api_key: PH_KEY,
    event,
    properties: { ...properties, distinct_id: distinctId },
    timestamp: new Date().toISOString(),
  };
  // Forward real client IP so PostHog geo-resolves the user, not our server
  if (properties.$ip) {
    body.properties.$ip = properties.$ip;
  }
  // Include request_id if provided so events can be correlated
  if (properties.request_id) {
    body.properties.request_id = properties.request_id;
  }
  fetch(`${PH_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {}); // fire-and-forget
}

const broker = new BridgeBroker({ staleMs: 45_000 });
const backend = new MimiqBackendClient({ baseUrl: BACKEND_API_URL, apiKey: BACKEND_API_KEY });

// Simple per-IP rate limiter for tool calls (prevents free-trial abuse)
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CALLS = 10; // max tool calls per IP per minute
const rateBuckets = new Map();
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, timestamps] of rateBuckets) {
    const valid = timestamps.filter(t => t > cutoff);
    if (valid.length === 0) rateBuckets.delete(ip);
    else rateBuckets.set(ip, valid);
  }
}, 30_000);

function checkRateLimit(ip) {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const timestamps = (rateBuckets.get(ip) || []).filter(t => t > cutoff);
  if (timestamps.length >= RATE_MAX_CALLS) return false;
  timestamps.push(now);
  rateBuckets.set(ip, timestamps);
  return true;
}

const SERVER_INSTRUCTIONS = `Mimiq tests content with simulated people who have audience profiles. Their reactions help form hypotheses and find confusing steps. They are simulated, not recruited research participants.

AUTHORIZED TASKS:
- Run or repeat a test only when the user requests it or has already authorized that task, and stay within the authorized credit budget.
- If the user prohibits paid calls or requests a dry run, prepare the inputs and expected cost without calling simulation tools. Account credits still count as usage even when no payment happens immediately.
- Building or editing a page does not by itself authorize a simulated test. Suggest an applicable test and explain its cost when the task lacks that authorization.
- A standard reaction uses one credit per simulated person per run; a flow uses several credits per simulated person (the usage response gives the current number as flow_credits_per_person). A two-variant copy test uses two runs. The backend enforces the current balance and grant.

CHOOSE THE TASK:
- Pages: mimiq.test_page returns page reactions. mimiq.test_flow tries an interactive task by clicking and typing in a real browser.
- Copy: mimiq.test_copy supports one piece of copy or two variants.
- Other text: mimiq.test_text. Components: mimiq.test_component with an HTML snippet or description.
- Multiple-choice questions: mimiq.ask_audience.
- Use the intended audience and an authorized count. More simulated reactions do not establish real-world confidence.
- For interactive flows, use a target and task the user has authorized. Respect explicit boundaries such as stopping before purchases or external submissions.

PAGE ACCESS:
Mimiq needs a publicly reachable URL. Prefer the user's public preview URL. A local development server needs an explicitly authorized temporary tunnel. Explain that the page will become publicly reachable before exposing it. Do not open a tunnel, install tools or change network access merely because a page is local.
When a tunnel is authorized and available, use its public URL for the test and close it after the authorized work. If the required access is unavailable, provide the setup steps without starting a test.

RESULTS:
- Return each simulated person's recorded action, monologue, objections and what_would_help, plus aggregate counts.
- This local adapter returns raw reactions, not pre-computed verdicts. Read the reasons and distinguish observed tool output from your interpretation.
- Do not convert simulated counts into measured conversion lift, accuracy claims or proof of demand.
- Recommend a concrete follow-up based on the findings. Run it only when requested or already authorized within the user's budget.`;

const TOOL_DEFS = {
  'mimiq.test_page': {
    description: [
      'Test a web page on simulated users to find UX issues, confusing copy, and conversion blockers.',
      'Use for an authorized review of a landing page, pricing page, signup flow, or marketing page.',
      'Simulated users scroll through the entire page like real visitors; seeing hero, features, pricing, CTAs, and footer; then react honestly about what confused them, where they dropped off, and why they left.',
      'Returns: raw per-persona results with actions, monologues, objections, and suggestions.',
    ].join(' '),
    annotations: { title: 'Test Page', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri', maxLength: 2000, description: 'The URL to test. Must be publicly accessible. For local pages, use a public preview or an explicitly authorized tunnel URL.' },
        audience: { type: 'string', maxLength: 500, description: 'Who should test this page. Natural language, e.g. "startup founders in SF" or "parents shopping for kids toys". If omitted, Mimiq auto-detects the likely audience from page content.' },
        count: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Number of simulated users (default 10, max 50). More provides additional simulated reactions but takes longer.' },
        goal: { type: 'string', maxLength: 500, description: 'What the page is trying to achieve, e.g. "get visitors to sign up for the waitlist". Providing a goal helps personas evaluate the page against a specific conversion objective.' },
        timeout_seconds: { type: 'integer', minimum: 30, maximum: 900, default: 300 },
      },
      required: ['url'],
    },
  },
  'mimiq.test_flow': {
    description: [
      'Deep interactive simulation of a multi-step user flow (signup, onboarding, checkout, multi-page funnel).',
      'Each simulated persona navigates the page interactively; clicking links, filling forms, reading content, making decisions at each step.',
      'Use this for complex flows where you need to find exactly WHERE users get stuck or abandon.',
      'Slower than test_page (uses real browser sessions) but reveals step-by-step journey issues.',
      'Returns: raw per-persona journey data with step-by-step actions and drop-off points.',
    ].join(' '),
    annotations: { title: 'Test Flow', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri', maxLength: 2000, description: 'Starting URL of the flow to test. For local pages, use a public preview or an explicitly authorized tunnel URL.' },
        audience: { type: 'string', maxLength: 500, description: 'Who should test this page. Natural language, e.g. "startup founders in SF" or "parents shopping for kids toys". If omitted, Mimiq auto-detects the likely audience from page content.' },
        count: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Number of simulated users (default 5, max 10). Each runs a full interactive browser session.' },
        goal: { type: 'string', maxLength: 500, description: 'What success looks like, e.g. "complete the signup and reach the dashboard". Providing a goal helps personas evaluate the page against a specific conversion objective.' },
        max_steps: { type: 'integer', minimum: 1, maximum: 100, default: 15, description: 'Maximum navigation steps per persona (default 15).' },
        timeout_seconds: { type: 'integer', minimum: 60, maximum: 1800, default: 420 },
      },
      required: ['url'],
    },
  },
  'mimiq.test_copy': {
    description: [
      'Test copy on simulated users, or A/B test two variants head-to-head.',
      'Use when choosing between headlines, taglines, value propositions, email subject lines, CTA text, product descriptions, or any written content.',
      'For single variant: returns raw persona reactions and monologues.',
      'For two variants: returns both sets of raw results side by side for you to compare.',
    ].join(' '),
    annotations: { title: 'Test Copy', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        variant_a: { type: 'string', maxLength: 20000, description: 'The copy to test (or first variant for A/B comparison).' },
        variant_b: { type: 'string', maxLength: 20000, description: 'Optional second variant for comparison. If provided, returns both raw result sets for analysis.' },
        audience: { type: 'string', maxLength: 500, description: 'Target audience. E.g. "developers evaluating CI/CD tools". If omitted, defaults to "likely audience for this content".' },
        count: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Simulated users per variant (default 10, max 50).' },
        timeout_seconds: { type: 'integer', minimum: 30, maximum: 900, default: 180 },
      },
      required: ['variant_a'],
    },
  },
  'mimiq.test_text': {
    description: [
      'Test any text content on simulated users; positioning statements, feature descriptions, error messages, onboarding copy, instructions, announcements.',
      'Use when you want honest reactions to written content.',
      'Returns raw persona reactions, objections, and what they say would help.',
    ].join(' '),
    annotations: { title: 'Test Text', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', maxLength: 20000, description: 'The text content to test.' },
        audience: { type: 'string', maxLength: 500, description: 'Target audience. E.g. "developers evaluating CI/CD tools". If omitted, defaults to "likely audience for this content".' },
        goal: { type: 'string', maxLength: 500, description: 'What the text should achieve, e.g. "convince users to upgrade to the paid plan".' },
        count: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Number of simulated users (default 10, max 50).' },
        timeout_seconds: { type: 'integer', minimum: 30, maximum: 900, default: 180 },
      },
      required: ['text'],
    },
  },
  'mimiq.test_component': {
    annotations: { title: 'Test Component', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: [
      'Evaluate a UI component (button, card, form, modal, navigation, pricing table) by providing its HTML and/or text description.',
      'At least one of component_html or component_text must be provided.',
      'Use when you want feedback on whether a specific UI element is clear, trustworthy, and actionable.',
      'Simulated users evaluate clarity, trust signals, and whether they would interact with the component.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        component_html: { type: 'string', maxLength: 50000, description: 'The HTML of the component to evaluate.' },
        component_text: { type: 'string', maxLength: 20000, description: 'Text description of the component (alternative or supplement to HTML).' },
        audience: { type: 'string', maxLength: 500, description: 'Target audience for the component.' },
        goal: { type: 'string', maxLength: 500, description: 'What the component should achieve, e.g. "get users to click the upgrade button".' },
        count: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Number of simulated users (default 10, max 50).' },
        timeout_seconds: { type: 'integer', minimum: 30, maximum: 900, default: 180 },
      },
      required: [],
    },
  },
  'mimiq.ask_audience': {
    annotations: { title: 'Ask Audience', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: [
      'Run a survey question on a simulated audience to gauge preferences, priorities, or opinions.',
      'Provide a question and 2-10 answer options. Each simulated persona votes independently with reasoning.',
      'Use for product decisions ("which feature should we build next?"), naming ("which product name resonates?"), positioning ("which value prop is strongest?"), or any audience preference question.',
      'Returns: each respondent\'s vote and reasoning.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        audience: { type: 'string', maxLength: 500, description: 'Who to survey. E.g. "SaaS founders with 10-50 employees" or "mobile gamers aged 18-25".' },
        question: { type: 'string', minLength: 1, maxLength: 500, description: 'The survey question to ask.' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 10, description: 'Answer options (2-10 choices).' },
        count: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Number of respondents (default 10, max 50).' },
        context: { type: 'string', maxLength: 500, default: 'Product validation survey', description: 'Additional context about the survey purpose.' },
        concurrency: { type: 'integer', minimum: 1, maximum: 20, default: 6, description: 'Number of parallel survey workers (default 6). Higher values return results faster but may hit rate limits.' },
        timeout_seconds: { type: 'integer', default: 300, minimum: 30, maximum: 900 },
      },
      required: ['audience', 'question', 'options'],
    },
  },
};

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

// ---------------------------------------------------------------------------
// X-Request-Id; assign a unique ID to every inbound request for traceability
// ---------------------------------------------------------------------------
function getOrCreateRequestId(req) {
  const existing = req.headers['x-request-id'];
  if (existing && typeof existing === 'string' && existing.length <= 128) return existing;
  return randomUUID();
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function isLocalUrl(input) {
  try {
    const u = new URL(input);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}

function extractUserApiKey(req) {
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey) return xApiKey;
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim() || null;
  }
  return null;
}

function extractMcpClientId(req) {
  // Stable client ID for free-trial users (no API key).
  // The MCP client sends Mcp-Session-Id per session. We use it as a fingerprint
  // so the same client keeps the same credit pool across calls.
  // Fall back to client IP so unauthenticated requests still get an identity.
  const sessionId = req.headers['mcp-session-id'];
  if (sessionId) return sessionId;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
  return `ip-${ip}`;
}

function authOk() {
  // All requests are allowed through; the backend handles auth.
  // Unauthenticated requests get an auto-provisioned free-trial identity.
  return true;
}

function normalizeBackendError(err) {
  if (err && typeof err === 'object' && typeof err.code === 'string') {
    return {
      code: err.code,
      message: String(err.message || err.code),
      status: Number(err.status || 500),
    };
  }
  if (err instanceof MimiqBackendError) {
    return {
      code: err.code || 'BACKEND_ERROR',
      message: err.message,
      status: err.status || 500,
    };
  }
  return { code: 'BACKEND_ERROR', message: err?.message || 'Unknown error', status: 500 };
}

function toInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function requireUrl(value, field = 'url') {
  const str = String(value || '').trim();
  if (!str) throw { code: 'INVALID_INPUT', message: `${field} is required` };
  let parsed;
  try {
    parsed = new URL(str);
  } catch {
    throw { code: 'INVALID_INPUT', message: `${field} must be a valid URL` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw { code: 'INVALID_INPUT', message: `${field} must be an http(s) URL` };
  }
  // Block private/internal IPs (SSRF protection)
  const hostname = parsed.hostname.toLowerCase();
  const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal', '169.254.169.254'];
  if (BLOCKED_HOSTS.includes(hostname)) {
    throw { code: 'INVALID_INPUT', message: 'Internal/private URLs are not allowed. Use a public URL or cloudflared tunnel for localhost.' };
  }
  // Block private IP ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)) {
    throw { code: 'INVALID_INPUT', message: 'Private IP addresses are not allowed. Use cloudflared tunnel for local development.' };
  }
  return parsed.toString();
}

function requireString(value, field, { maxLength = 4000 } = {}) {
  const str = String(value || '').trim();
  if (!str) throw { code: 'INVALID_INPUT', message: `${field} is required` };
  if (str.length > maxLength) {
    throw { code: 'INVALID_INPUT', message: `${field} exceeds max length ${maxLength}` };
  }
  return str;
}

function requireOptions(value) {
  if (!Array.isArray(value)) throw { code: 'INVALID_INPUT', message: 'options must be an array' };
  const seen = new Set();
  const options = [];
  for (const raw of value) {
    const option = String(raw || '').trim();
    if (!option) continue;
    if (option.length > 120) {
      throw { code: 'INVALID_INPUT', message: 'each option must be <= 120 chars' };
    }
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }
  if (options.length < 2 || options.length > 10) {
    throw { code: 'INVALID_INPUT', message: 'options must contain 2 to 10 non-empty values' };
  }
  return options;
}

async function withRetries(fn, { retries = 2, delayMs = 400 } = {}) {
  let lastErr = null;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function resolveSimulationUrl({ url, bridgeId }) {
  if (!isLocalUrl(url)) return { url, notes: [] };
  const requestedBridge = bridgeId || null;
  const activeBridges = broker.listActiveBridges();
  const chosenBridge = requestedBridge
    ? activeBridges.find((b) => b.bridge_id === requestedBridge)
    : activeBridges[0];

  if (!chosenBridge) {
    return {
      error: {
        code: 'BRIDGE_OFFLINE',
        message: 'No active local bridge available for localhost URL',
      },
    };
  }

  const job = broker.enqueueTunnelJob({
    local_url: url,
    bridge_id: chosenBridge.bridge_id,
    ttl_seconds: 20 * 60,
  });
  const wait = await broker.waitForCompletion(job.job_id, { timeoutMs: 45_000, pollMs: 300 });
  if (wait.status === 'completed' && wait.result?.public_url) {
    const original = new URL(url);
    const tunneled = `${wait.result.public_url}${original.pathname || ''}${original.search || ''}${original.hash || ''}`;
    return {
      url: tunneled,
      notes: [`Localhost URL tunneled via bridge ${chosenBridge.bridge_id}`],
    };
  }
  return {
    error: {
      code: 'BRIDGE_OFFLINE',
      message: wait.status === 'failed'
        ? `Bridge failed: ${wait.error || 'unknown'}`
        : 'Bridge tunnel request timed out',
    },
  };
}

async function preflightCreditCheck({ count, mode, apiKey, mcpClientId, clientIp, requestId }) {
  try {
    const usage = await backend.getUsage({ apiKey, mcpClientId, clientIp, requestId });
    const remaining = usage?.remaining_personas ?? Infinity;
    // The flow price lives on the backend; 5 is only the fallback for an older backend.
    const perFlowPerson = Number(usage?.flow_credits_per_person) || 5;
    const cost = mode === 'e2e' ? count * perFlowPerson : count;
    if (remaining < cost) {
      phCapture(apiKey || mcpClientId || 'anon', 'mcp:credits_insufficient', {
        remaining,
        requested: cost,
        has_api_key: !!apiKey,
        $ip: clientIp,
      });
      return {
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: `Requested ${cost} persona credits but only ${remaining} remaining. Sign up at https://www.mimiqai.com/app/usage to buy more credits.`,
        },
      };
    }
  } catch {
    // If usage check fails, let the simulation proceed; the backend will enforce anyway
  }
  return null;
}

async function runWebTool({ tool, url, audience, count, goal, mode, timeoutSeconds, maxSteps, bridgeId, apiKey, mcpClientId, clientIp, requestId }) {
  const start = Date.now();
  console.log(`[runWebTool] START mode=${mode} url=${url} count=${count}`);
  const creditErr = await preflightCreditCheck({ count, mode, apiKey, mcpClientId, clientIp, requestId });
  if (creditErr) { console.log(`[runWebTool] credit check failed`); return creditErr; }
  console.log(`[runWebTool] credits OK`);

  const resolved = await resolveSimulationUrl({ url, bridgeId });
  if (resolved.error) { console.log(`[runWebTool] URL resolve failed:`, resolved.error); return { error: resolved.error }; }
  console.log(`[runWebTool] URL resolved: ${resolved.url}`);

  const audienceRes = await withRetries(() => backend.generateAudience({
    prompt: audience || `Likely users of ${url}`,
    count,
    apiKey,
    mcpClientId,
    clientIp,
    requestId,
  }));
  const audienceId = audienceRes?.audience_id;
  if (!audienceId) { console.log(`[runWebTool] audience generation failed, res:`, JSON.stringify(audienceRes)?.substring(0, 200)); return { error: { code: 'BACKEND_ERROR', message: 'Audience generation failed' } }; }
  console.log(`[runWebTool] audience generated: ${audienceId}`);

  let simulationId;
  try {
    simulationId = await withRetries(() => backend.createSimulation({
    audienceId,
    type: 'WEB',
    content: resolved.url,
    webMode: mode,
    goal: goal || undefined,
    maxSteps,
    apiKey,
    mcpClientId,
    clientIp,
    requestId,
  }));
  } catch (createErr) {
    console.error(`[runWebTool] createSimulation FAILED:`, createErr?.message, createErr?.code, createErr?.status);
    throw createErr;
  }
  console.log(`[runWebTool] simulation created: ${simulationId}`);
  let state;
  try {
    state = await withRetries(() => backend.pollSimulation(simulationId, { timeoutMs: timeoutSeconds * 1000, apiKey, mcpClientId, clientIp, requestId }), {
      retries: 1,
      delayMs: 700,
    });
  } catch (pollErr) {
    console.error(`[runWebTool] pollSimulation FAILED:`, pollErr?.message, pollErr?.code, pollErr?.status);
    throw pollErr;
  }
  const status = String(state?.status || '').toUpperCase();
  console.log(`[runWebTool] simulation status: ${status}`);
  if (status !== 'COMPLETED') {
    return { error: { code: status === 'FAILED' ? 'BACKEND_ERROR' : 'SIM_TIMEOUT', message: `Simulation ${status}` } };
  }

  const payload = await withRetries(() => backend.getResults(simulationId, { apiKey, mcpClientId, clientIp, requestId }));
  const results = adaptResultsForBehavior(Array.isArray(payload?.results) ? payload.results : []);
  const envelope = buildMcpEnvelope({
    tool,
    mode,
    results,
    simulationIds: [simulationId],
    durationSeconds: Math.round((Date.now() - start) / 1000),
    extractionErrors: 0,
    notes: resolved.notes,
  });
  return { data: envelope };
}

async function runCopyTool({ audience, count, variantA, variantB, timeoutSeconds, mode = 'text', tool = 'mimiq.test_copy', apiKey, mcpClientId, clientIp, requestId }) {
  const start = Date.now();
  const totalCount = variantB ? count * 2 : count;
  const creditErr = await preflightCreditCheck({ count: totalCount, mode: 'text', apiKey, mcpClientId, clientIp, requestId });
  if (creditErr) return creditErr;

  const audienceRes = await withRetries(() => backend.generateAudience({
    prompt: audience || 'Likely buyers for this content',
    count,
    apiKey,
    mcpClientId,
    clientIp,
    requestId,
  }));
  const audienceId = audienceRes?.audience_id;
  if (!audienceId) return { error: { code: 'BACKEND_ERROR', message: 'Audience generation failed' } };

  const runText = async (content, context) => {
    const simId = await withRetries(() => backend.createSimulation({
      audienceId,
      type: 'TEXT',
      content,
      webMode: 'quick',
      context,
      apiKey,
      mcpClientId,
      clientIp,
      requestId,
    }));
    const state = await withRetries(() => backend.pollSimulation(simId, { timeoutMs: timeoutSeconds * 1000, apiKey, mcpClientId, clientIp, requestId }), {
      retries: 1,
      delayMs: 700,
    });
    const status = String(state?.status || '').toUpperCase();
    if (status !== 'COMPLETED') {
      throw new MimiqBackendError(`TEXT simulation ${status}`, { code: status === 'FAILED' ? 'BACKEND_ERROR' : 'SIM_TIMEOUT' });
    }
    const payload = await withRetries(() => backend.getResults(simId, { apiKey, mcpClientId, clientIp, requestId }));
    const raw = Array.isArray(payload?.results) ? payload.results : [];
    return { simId, results: adaptResultsForBehavior(raw) };
  };

  const a = await runText(variantA, mode === 'component' ? 'ui component evaluation' : 'copy evaluation');
  if (!variantB) {
    const envelope = buildMcpEnvelope({
      tool,
      mode,
      results: a.results,
      simulationIds: [a.simId],
      durationSeconds: Math.round((Date.now() - start) / 1000),
      extractionErrors: 0,
      notes: [],
    });
    return { data: envelope };
  }

  const b = await runText(variantB, 'copy evaluation');
  const envA = buildMcpEnvelope({
    tool,
    mode: 'text',
    results: a.results,
    simulationIds: [a.simId],
    durationSeconds: 0,
    extractionErrors: 0,
    notes: [],
  });
  const envB = buildMcpEnvelope({
    tool,
    mode: 'text',
    results: b.results,
    simulationIds: [b.simId],
    durationSeconds: 0,
    extractionErrors: 0,
    notes: [],
  });

  return {
    data: {
      tool,
      variant_a: envA,
      variant_b: envB,
      run: {
        simulation_ids: [a.simId, b.simId],
        mode: 'ab_test',
        duration_seconds: Math.round((Date.now() - start) / 1000),
      },
    },
  };
}

async function runComponentTool({ audience, count, componentHtml, componentText, goal, timeoutSeconds, apiKey, mcpClientId, clientIp, requestId }) {
  const start = Date.now();
  const creditErr = await preflightCreditCheck({ count, mode: 'text', apiKey, mcpClientId, clientIp, requestId });
  if (creditErr) return creditErr;

  const contentParts = [];
  if (componentText) contentParts.push(`Component description:\n${componentText}`);
  if (componentHtml) contentParts.push(`Component HTML:\n${componentHtml}`);

  const evaluationGoal = goal
    ? `Evaluate this UI component: ${goal}`
    : 'Evaluate this UI component for clarity, trust, and whether you would interact with it';

  const prompt = [
    evaluationGoal,
    'You are seeing this UI component in a real application.',
    'Would you interact with it? Is the purpose clear? Does it feel trustworthy?',
    contentParts.join('\n\n'),
  ].join('\n\n');

  const audienceRes = await withRetries(() => backend.generateAudience({
    prompt: audience || 'Likely users interacting with this UI component',
    count,
    apiKey,
    mcpClientId,
    clientIp,
    requestId,
  }));
  const audienceId = audienceRes?.audience_id;
  if (!audienceId) return { error: { code: 'BACKEND_ERROR', message: 'Audience generation failed' } };

  const simId = await withRetries(() => backend.createSimulation({
    audienceId,
    type: 'TEXT',
    content: prompt,
    context: 'evaluating a UI component in an application',
    goal: '__component_evaluation__',
    apiKey,
    mcpClientId,
    clientIp,
    requestId,
  }));
  const state = await withRetries(() => backend.pollSimulation(simId, { timeoutMs: timeoutSeconds * 1000, apiKey, mcpClientId, clientIp, requestId }), {
    retries: 1,
    delayMs: 700,
  });
  const status = String(state?.status || '').toUpperCase();
  if (status !== 'COMPLETED') {
    return { error: { code: status === 'FAILED' ? 'BACKEND_ERROR' : 'SIM_TIMEOUT', message: `Simulation ${status}` } };
  }

  const payload = await withRetries(() => backend.getResults(simId, { apiKey, mcpClientId, clientIp, requestId }));
  const results = adaptResultsForBehavior(Array.isArray(payload?.results) ? payload.results : []);
  const envelope = buildMcpEnvelope({
    tool: 'mimiq.test_component',
    mode: 'component',
    results,
    simulationIds: [simId],
    durationSeconds: Math.round((Date.now() - start) / 1000),
    extractionErrors: 0,
    notes: goal ? [`goal=${goal}`] : ['component_mode=ui'],
  });
  return { data: envelope };
}

async function runSurveyTool({ audience, question, options, count, context, concurrency, apiKey, mcpClientId, clientIp, requestId }) {
  const start = Date.now();
  const creditErr = await preflightCreditCheck({ count, mode: 'text', apiKey, mcpClientId, clientIp, requestId });
  if (creditErr) return creditErr;

  const payload = await withRetries(() => backend.runSurvey({
    audiencePrompt: audience,
    count,
    question,
    options,
    context,
    concurrency,
    apiKey,
    mcpClientId,
    clientIp,
    requestId,
  }), { retries: 1, delayMs: 700 });

  const rows = adaptResultsForBehavior((payload?.results || []).map((r) => ({
    persona: r.persona || {},
    persona_id: r.persona_id || r.persona?.id || null,
    result: {
      action: r.selected_option ? 'engaged' : (r.action || 'unknown'),
      monologue: r.response_text || r.thought_process || '',
      trust_score: r.trust_score ?? null,
      selected_option: r.selected_option || null,
    },
  })));
  const extraction = payload?.summary?.extraction_stats || {};
  const extractionErrors = (extraction.parse_errors || 0) + (extraction.option_match_failures || 0) + (extraction.timeout_errors || 0);

  const envelope = buildMcpEnvelope({
    tool: 'mimiq.ask_audience',
    mode: 'survey',
    results: rows,
    simulationIds: [],
    durationSeconds: Math.round((Date.now() - start) / 1000),
    extractionErrors,
    notes: [
      `distribution=${JSON.stringify(payload?.summary?.distribution || {})}`,
      `survey_total=${payload?.summary?.total || 0}`,
    ],
  });
  return { data: envelope };
}

function mcpResult(id, result, sessionId) {
  return {
    status: 200,
    body: { jsonrpc: '2.0', id, result },
    headers: { 'Mcp-Session-Id': sessionId },
  };
}

function mcpError(id, code, message, sessionId) {
  return {
    status: 200,
    body: { jsonrpc: '2.0', id, error: { code, message } },
    headers: { 'Mcp-Session-Id': sessionId },
  };
}

async function handleMcp(method, params, id, userApiKey = null, mcpClientId = null, clientIp = null, requestId = null) {
  if (!MCP_ENABLED) {
    return mcpError(id, -32001, 'MCP disabled by feature flag', params?.sessionId);
  }
  const sessionId = params?.sessionId || randomUUID();

  if (method === 'initialize') {
    phCapture(mcpClientId || userApiKey || 'anon', 'mcp:session_started', {
      has_api_key: !!userApiKey,
      client_info: params?.clientInfo?.name || 'unknown',
      $ip: clientIp,
      request_id: requestId,
    });
    return mcpResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: {
        name: 'mimiq',
        version: '0.3.1',
        description: 'Test pages, copy and sign-up flows on simulated people with Mimiq MCP.',
        homepage: 'https://www.mimiqai.com/mcp',
        icon: 'https://mimiqai.com/favicon.svg',
      },
      instructions: SERVER_INSTRUCTIONS,
    }, sessionId);
  }
  if (method === 'notifications/initialized' || method === 'ping') {
    return mcpResult(id, {}, sessionId);
  }
  if (method === 'tools/list') {
    const tools = Object.entries(TOOL_DEFS).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: def.inputSchema,
      ...(def.annotations ? { annotations: def.annotations } : {}),
    }));
    return mcpResult(id, { tools }, sessionId);
  }
  // Return empty results for optional discovery methods.
  // Some clients disconnect all servers if any returns -32601 for these.
  // Optional discovery methods return empty collections for compatibility.
  if (method === 'resources/list') return mcpResult(id, { resources: [] }, sessionId);
  if (method === 'resources/templates/list') return mcpResult(id, { resourceTemplates: [] }, sessionId);
  if (method === 'prompts/list') return mcpResult(id, { prompts: [] }, sessionId);

  if (method === 'tools/call') {
    const name = String(params?.name || '');
    const args = params?.arguments || {};
    const _toolStart = Date.now();
    const _phId = userApiKey || mcpClientId || 'anon';
    try {
      let out = null;
      if (name === 'mimiq.test_page') {
        out = await runWebTool({
          tool: name,
          url: requireUrl(args.url),
          audience: args.audience ? requireString(args.audience, 'audience', { maxLength: 500 }) : undefined,
          count: toInt(args.count, 10, 1, 50),
          goal: args.goal ? requireString(args.goal, 'goal', { maxLength: 500 }) : undefined,
          mode: 'visual_journey',
          timeoutSeconds: toInt(args.timeout_seconds, 300, 30, 900),
          maxSteps: null,
          bridgeId: args.bridge_id ? String(args.bridge_id) : undefined,
          apiKey: userApiKey,
          mcpClientId,
          clientIp,
          requestId,
        });
      } else if (name === 'mimiq.test_flow') {
        out = await runWebTool({
          tool: name,
          url: requireUrl(args.url),
          audience: args.audience ? requireString(args.audience, 'audience', { maxLength: 500 }) : undefined,
          count: toInt(args.count, 5, 1, 10),
          goal: args.goal ? requireString(args.goal, 'goal', { maxLength: 500 }) : undefined,
          mode: 'e2e',
          timeoutSeconds: toInt(args.timeout_seconds, 420, 60, 1800),
          maxSteps: toInt(args.max_steps, 15, 1, 100),
          bridgeId: args.bridge_id ? String(args.bridge_id) : undefined,
          apiKey: userApiKey,
          mcpClientId,
          clientIp,
          requestId,
        });
      } else if (name === 'mimiq.test_copy') {
        out = await runCopyTool({
          audience: args.audience ? requireString(args.audience, 'audience', { maxLength: 500 }) : undefined,
          count: toInt(args.count, 10, 1, 50),
          variantA: requireString(args.variant_a, 'variant_a', { maxLength: 20_000 }),
          variantB: args.variant_b ? requireString(args.variant_b, 'variant_b', { maxLength: 20_000 }) : null,
          timeoutSeconds: toInt(args.timeout_seconds, 180, 30, 900),
          apiKey: userApiKey,
          mcpClientId,
          clientIp,
          requestId,
        });
      } else if (name === 'mimiq.test_text') {
        out = await runCopyTool({
          audience: args.audience ? requireString(args.audience, 'audience', { maxLength: 500 }) : undefined,
          count: toInt(args.count, 10, 1, 50),
          variantA: requireString(args.text, 'text', { maxLength: 20_000 }),
          variantB: null,
          timeoutSeconds: toInt(args.timeout_seconds, 180, 30, 900),
          mode: 'text',
          tool: 'mimiq.test_text',
          apiKey: userApiKey,
          mcpClientId,
          clientIp,
          requestId,
        });
      } else if (name === 'mimiq.test_component') {
        const componentHtml = args.component_html ? requireString(args.component_html, 'component_html', { maxLength: 50_000 }) : '';
        const componentText = args.component_text ? requireString(args.component_text, 'component_text', { maxLength: 20_000 }) : '';
        if (!componentHtml && !componentText) {
          throw { code: 'INVALID_INPUT', message: 'Provide component_html or component_text' };
        }
        out = await runComponentTool({
          audience: args.audience ? requireString(args.audience, 'audience', { maxLength: 500 }) : undefined,
          count: toInt(args.count, 10, 1, 50),
          componentHtml,
          componentText,
          goal: args.goal ? requireString(args.goal, 'goal', { maxLength: 500 }) : undefined,
          timeoutSeconds: toInt(args.timeout_seconds, 180, 30, 900),
          apiKey: userApiKey,
          mcpClientId,
          clientIp,
          requestId,
        });
      } else if (name === 'mimiq.ask_audience') {
        out = await runSurveyTool({
          audience: requireString(args.audience, 'audience', { maxLength: 500 }),
          question: requireString(args.question, 'question', { maxLength: 500 }),
          options: requireOptions(args.options),
          count: toInt(args.count, 10, 1, 50),
          context: args.context ? requireString(args.context, 'context', { maxLength: 500 }) : 'Product validation survey',
          concurrency: toInt(args.concurrency, 6, 1, 20),
          apiKey: userApiKey,
          mcpClientId,
          clientIp,
          requestId,
        });
      } else {
        return mcpError(id, -32601, `Unknown tool: ${name}`, sessionId);
      }

      if (out?.error) {
        const e = normalizeBackendError(out.error);
        phCapture(_phId, 'mcp:tool_error', {
          tool: name,
          error_code: e.code,
          has_api_key: !!userApiKey,
          duration_s: Math.round((Date.now() - _toolStart) / 1000),
          $ip: clientIp,
          request_id: requestId,
        });
        const errorPayload = { code: e.code, message: e.message, request_id: requestId };
        if (e.code === 'INSUFFICIENT_CREDITS') {
          errorPayload.message += '\n\nTo get more credits:\n1. Sign up at https://www.mimiqai.com/app/usage\n2. Choose a credit pack from $9 or a monthly plan\n3. Create an API key at https://www.mimiqai.com/app/settings\n4. Send Authorization: Bearer YOUR_KEY to https://mcp.mimiqai.com/mcp from your MCP client';
        }
        return mcpResult(id, {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify(errorPayload) }],
        }, sessionId);
      }
      const _toolDuration = Math.round((Date.now() - _toolStart) / 1000);
      phCapture(_phId, 'mcp:tool_called', {
        tool: name,
        persona_count: args.count || 10,
        has_api_key: !!userApiKey,
        duration_s: _toolDuration,
        audience: args.audience?.slice(0, 100),
        has_url: !!(args.url),
        is_ab_test: !!(args.variant_b),
        $ip: clientIp,
        request_id: requestId,
      });
      return mcpResult(id, {
        content: [{ type: 'text', text: JSON.stringify(out.data) }],
      }, sessionId);
    } catch (err) {
      console.error(`[MCP] Tool ${name} error:`, err?.message || err, err?.code || '', err?.status || '');
      const e = normalizeBackendError(err);
      phCapture(_phId, 'mcp:tool_error', {
        tool: name,
        error_code: e.code,
        has_api_key: !!userApiKey,
        duration_s: Math.round((Date.now() - _toolStart) / 1000),
        $ip: clientIp,
        request_id: requestId,
      });
      return mcpResult(id, {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ code: e.code, message: e.message, request_id: requestId }) }],
      }, sessionId);
    }
  }

  return mcpError(id, -32601, `Method not found: ${method}`, sessionId);
}

// ---------------------------------------------------------------------------
// In-flight request tracking for graceful shutdown
// ---------------------------------------------------------------------------
const inFlightRequests = new Set();
let shuttingDown = false;

const server = http.createServer(async (req, res) => {
  const requestId = getOrCreateRequestId(req);
  res.setHeader('X-Request-Id', requestId);

  if (shuttingDown) {
    sendJson(res, 503, { error: 'Server is shutting down', request_id: requestId });
    return;
  }

  // Track in-flight requests for graceful shutdown
  const tracker = { req, res };
  inFlightRequests.add(tracker);
  res.on('close', () => inFlightRequests.delete(tracker));

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  try {
    if (requestUrl.pathname === '/health' && req.method === 'GET') {
      const backendHealth = await backend.health().catch(() => null);
      sendJson(res, 200, {
        status: 'ok',
        mcp_enabled: MCP_ENABLED,
        backend_reachable: Boolean(backendHealth),
        bridges_active: broker.listActiveBridges().length,
      });
      return;
    }

    if (requestUrl.pathname === MCP_PATH) {
      if (!authOk()) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
      const userApiKey = extractUserApiKey(req);
      const mcpClientId = !userApiKey ? extractMcpClientId(req) : null;
      if (req.method === 'POST') console.log(`[MCP] ${req.method} mcpClientId=${mcpClientId} apiKey=${userApiKey ? userApiKey.slice(0,4) + '***' : 'none'} session=${req.headers['mcp-session-id'] || 'none'}`);

      // Streamable HTTP: GET opens an SSE stream for server→client notifications
      if (req.method === 'GET') {
        const sid = req.headers['mcp-session-id'] || randomUUID();
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Mcp-Session-Id': sid,
        });
        // Keep-alive; this stream stays open for server-initiated messages.
        // For now, Mimiq doesn't push server→client notifications, so we just hold the connection.
        const keepAlive = setInterval(() => {
          res.write(': keep-alive\n\n');
        }, 15_000);
        req.on('close', () => clearInterval(keepAlive));
        return;
      }

      // Streamable HTTP: DELETE terminates a session
      if (req.method === 'DELETE') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        const sid = req.headers['mcp-session-id'] || randomUUID();
        const out = mcpError(null, -32700, 'Parse error', sid);
        sendJson(res, out.status, out.body, out.headers);
        return;
      }
      const id = body?.id ?? null;
      if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
        const sid = req.headers['mcp-session-id'] || randomUUID();
        const out = mcpError(id, -32600, 'Invalid Request', sid);
        sendJson(res, out.status, out.body, out.headers);
        return;
      }
      const sid = req.headers['mcp-session-id'] || randomUUID();

      // For tools/call, use SSE streaming to prevent The MCP client's 60s timeout from killing
      // long-running simulations. Send keep-alive pings while the simulation runs.
      if (body.method === 'tools/call') {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIp)) {
          phCapture(userApiKey || mcpClientId || 'anon', 'mcp:rate_limited', {
            tool: String(body.params?.name || ''),
            $ip: clientIp,
            request_id: requestId,
          });
          const errBody = { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute before trying again.', request_id: requestId }) }] } };
          sendJson(res, 200, errBody, { 'Mcp-Session-Id': sid });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Mcp-Session-Id': sid,
        });
        // Send keep-alive pings every 5s to prevent timeout
        const ping = setInterval(() => {
          if (!res.writableEnded) res.write(': ping\n\n');
        }, 5_000);
        try {
          const out = await handleMcp(body.method, { ...body.params, sessionId: sid }, id, userApiKey, mcpClientId, clientIp, requestId);
          clearInterval(ping);
          // Send the JSON-RPC result as an SSE event
          const payload = JSON.stringify(out.body);
          res.write(`event: message\ndata: ${payload}\n\n`);
        } catch (err) {
          clearInterval(ping);
          const errBody = { jsonrpc: '2.0', id, error: { code: -32603, message: err?.message || 'Internal error', data: { request_id: requestId } } };
          res.write(`event: message\ndata: ${JSON.stringify(errBody)}\n\n`);
        }
        res.end();
        return;
      }

      const nonSseIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const out = await handleMcp(body.method, { ...body.params, sessionId: sid }, id, userApiKey, mcpClientId, nonSseIp, requestId);
      sendJson(res, out.status, out.body, out.headers);
      return;
    }

    if (requestUrl.pathname.startsWith('/bridge/')) {
      if (!authOk(req)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }
      if (requestUrl.pathname === '/bridge/register') {
        sendJson(res, 200, broker.register(body || {}));
        return;
      }
      if (requestUrl.pathname === '/bridge/heartbeat') {
        const bridge = broker.heartbeat(body || {});
        if (!bridge) {
          sendJson(res, 404, { error: 'bridge_not_found' });
          return;
        }
        sendJson(res, 200, bridge);
        return;
      }
      if (requestUrl.pathname === '/bridge/jobs/claim') {
        const job = broker.claim(body || {});
        sendJson(res, 200, { job: job || null });
        return;
      }
      const completeMatch = requestUrl.pathname.match(/^\/bridge\/jobs\/([^/]+)\/complete$/);
      if (completeMatch) {
        const job = broker.complete({
          job_id: completeMatch[1],
          bridge_id: body?.bridge_id,
          public_url: body?.public_url,
          expires_at: body?.expires_at,
        });
        if (!job) {
          sendJson(res, 404, { error: 'job_not_found_or_forbidden' });
          return;
        }
        sendJson(res, 200, job);
        return;
      }
      const failMatch = requestUrl.pathname.match(/^\/bridge\/jobs\/([^/]+)\/fail$/);
      if (failMatch) {
        const job = broker.fail({
          job_id: failMatch[1],
          bridge_id: body?.bridge_id,
          error: body?.error,
        });
        if (!job) {
          sendJson(res, 404, { error: 'job_not_found_or_forbidden' });
          return;
        }
        sendJson(res, 200, job);
        return;
      }
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Internal error', request_id: requestId });
  }
});

// ---------------------------------------------------------------------------
// Graceful shutdown; drain in-flight requests, close SSE connections, exit
// ---------------------------------------------------------------------------
const SHUTDOWN_TIMEOUT_MS = 30_000;

function gracefulShutdown(signal) {
  if (shuttingDown) return; // prevent double-handling
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received; draining ${inFlightRequests.size} in-flight request(s)…`);

  // Stop accepting new connections
  server.close(() => {
    console.log('[shutdown] Server closed, no new connections.');
  });

  // Wait for in-flight requests or force-exit after timeout
  const forceTimer = setTimeout(() => {
    console.log(`[shutdown] Force exit after ${SHUTDOWN_TIMEOUT_MS / 1000}s timeout (${inFlightRequests.size} requests still in flight).`);
    // Destroy remaining SSE / keep-alive connections
    for (const { res } of inFlightRequests) {
      if (!res.writableEnded) {
        try { res.end(); } catch { /* ignore */ }
      }
    }
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref(); // don't keep process alive just for this timer

  // Poll until in-flight requests drain
  const poll = setInterval(() => {
    if (inFlightRequests.size === 0) {
      clearInterval(poll);
      clearTimeout(forceTimer);
      console.log('[shutdown] All requests drained. Exiting cleanly.');
      process.exit(0);
    }
  }, 250);
  poll.unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for testing; start listening only when run directly
export { server, inFlightRequests, TOOL_DEFS, checkRateLimit, rateBuckets };

// Auto-start when run as the main script (node src/server.js)
const isMain = process.argv[1] && (
  process.argv[1].endsWith('/server.js') || process.argv[1].endsWith('\\server.js')
);
if (isMain) {
  server.listen(PORT, HOST, () => {
    console.log(`mimiq-mcp-hosted listening on ${HOST}:${PORT} (path: ${MCP_PATH})`);
  });
}
