import { randomUUID } from 'crypto';

function nowMs() {
  return Date.now();
}

export class BridgeBroker {
  constructor({ staleMs = 45_000, terminalRetentionMs = 10 * 60 * 1000 } = {}) {
    this.staleMs = staleMs;
    this.terminalRetentionMs = terminalRetentionMs;
    this.bridges = new Map();
    this.jobs = new Map();
  }

  _isBridgeActive(bridge) {
    return bridge && (nowMs() - bridge.last_heartbeat_ms) <= this.staleMs;
  }

  _isJobExpired(job, atMs = nowMs()) {
    const ttlSeconds = Number(job?.ttl_seconds) || 1200;
    return (atMs - Number(job?.created_ms || 0)) > (ttlSeconds * 1000);
  }

  _cleanupJobs() {
    const now = nowMs();
    for (const [jobId, job] of this.jobs.entries()) {
      if ((job.status === 'queued' || job.status === 'claimed') && this._isJobExpired(job, now)) {
        job.status = 'failed';
        job.error = 'job_expired';
        job.updated_ms = now;
        this.jobs.set(jobId, job);
      }

      const isTerminal = job.status === 'completed' || job.status === 'failed';
      if (isTerminal && (now - Number(job.updated_ms || now)) > this.terminalRetentionMs) {
        this.jobs.delete(jobId);
      }
    }
  }

  listActiveBridges() {
    this._cleanupJobs();
    const out = [];
    for (const bridge of this.bridges.values()) {
      if (this._isBridgeActive(bridge)) out.push(bridge);
    }
    return out;
  }

  register({ bridge_id, ttl_seconds = 1200, version = '0.1.0' }) {
    const id = String(bridge_id || randomUUID());
    const bridge = {
      bridge_id: id,
      ttl_seconds: Number(ttl_seconds) || 1200,
      version,
      created_at: new Date().toISOString(),
      last_heartbeat_ms: nowMs(),
      active_jobs: 0,
      status: 'active',
    };
    this.bridges.set(id, bridge);
    return bridge;
  }

  heartbeat({ bridge_id, active_jobs = 0 }) {
    const id = String(bridge_id || '').trim();
    const bridge = this.bridges.get(id);
    if (!bridge) return null;
    bridge.last_heartbeat_ms = nowMs();
    bridge.active_jobs = Number(active_jobs) || 0;
    bridge.status = 'active';
    this.bridges.set(id, bridge);
    return bridge;
  }

  enqueueTunnelJob({ local_url, bridge_id = null, ttl_seconds = 1200 }) {
    this._cleanupJobs();
    const job_id = randomUUID();
    const now = nowMs();
    const ttl = Math.max(1, Math.min(24 * 60 * 60, Number(ttl_seconds) || 1200));
    const job = {
      job_id,
      job_type: 'tunnel_local_url',
      local_url,
      bridge_id: bridge_id || null,
      ttl_seconds: ttl,
      created_ms: now,
      updated_ms: now,
      status: 'queued',
      claimed_by: null,
      result: null,
      error: null,
    };
    this.jobs.set(job_id, job);
    return job;
  }

  claim({ bridge_id }) {
    this._cleanupJobs();
    const bridge = this.bridges.get(String(bridge_id || '').trim());
    if (!this._isBridgeActive(bridge)) return null;

    const queued = Array.from(this.jobs.values())
      .filter((j) => j.status === 'queued' && !this._isJobExpired(j))
      .sort((a, b) => a.created_ms - b.created_ms);

    const pick = queued.find((job) => !job.bridge_id || job.bridge_id === bridge.bridge_id);
    if (!pick) return null;
    pick.status = 'claimed';
    pick.claimed_by = bridge.bridge_id;
    pick.updated_ms = nowMs();
    this.jobs.set(pick.job_id, pick);
    return pick;
  }

  complete({ job_id, bridge_id, public_url, expires_at }) {
    this._cleanupJobs();
    const job = this.jobs.get(String(job_id || '').trim());
    if (!job) return null;
    if (job.status !== 'claimed' && job.status !== 'queued') return null;
    if (!bridge_id) return null;
    if (job.bridge_id && job.bridge_id !== bridge_id) return null;
    if (job.claimed_by && job.claimed_by !== bridge_id) return null;
    let validatedUrl = null;
    try {
      const raw = String(public_url || '').trim();
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      validatedUrl = raw;
    } catch {
      return null;
    }

    job.status = 'completed';
    job.result = {
      public_url: validatedUrl,
      expires_at: expires_at || new Date(nowMs() + (job.ttl_seconds * 1000)).toISOString(),
      bridge_id: bridge_id || null,
    };
    job.updated_ms = nowMs();
    this.jobs.set(job.job_id, job);
    return job;
  }

  fail({ job_id, bridge_id, error }) {
    this._cleanupJobs();
    const job = this.jobs.get(String(job_id || '').trim());
    if (!job) return null;
    if (job.status !== 'claimed' && job.status !== 'queued') return null;
    if (job.bridge_id && bridge_id && job.bridge_id !== bridge_id) return null;
    if (job.claimed_by && bridge_id && job.claimed_by !== bridge_id) return null;
    job.status = 'failed';
    job.error = String(error || 'bridge_job_failed');
    job.updated_ms = nowMs();
    this.jobs.set(job.job_id, job);
    return job;
  }

  async waitForCompletion(jobId, { timeoutMs = 45_000, pollMs = 300 } = {}) {
    const end = nowMs() + timeoutMs;
    while (nowMs() < end) {
      this._cleanupJobs();
      const job = this.jobs.get(jobId);
      if (!job) return { status: 'missing' };
      if (job.status === 'completed') return { status: 'completed', result: job.result, job };
      if (job.status === 'failed') return { status: 'failed', error: job.error, job };
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return { status: 'timeout' };
  }
}
