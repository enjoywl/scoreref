import { DurableObject } from "cloudflare:workers";

interface MatchInfo {
  mid: string; lnam: string; lpc: string; mtim: number; stat: number;
  hnam: string; anam: string; hscr: number; ascr: number;
  hhsc: number; ahsc: number; hred: number; ared: number;
  hyel: number; ayel: number; hcor: number; acor: number;
  hrnk: string; arnk: string; seas: string; round: string;
  locn: string; weat: string; temp: string;
  hmgr: string; amgr: string; rfee: string;
  hpc: string; apc: string;
}

interface MatchListItem {
  mid: string; cty: string; lnam: string; lpc: string; mtim: number;
  stat: number; hnam: string; anam: string; hscr: number; ascr: number;
  hhsc: number; ahsc: number; hpc: string; apc: string; seas: string; locn?: string;
}

interface MatchDetail {
  info: MatchInfo;
  incidents: any[];
}

interface DOEnv {
  VPC_SERVICE?: { fetch(url: string): Promise<Response> };
}

const ORIGIN = "http://106.42.192.93:8090";
const REFRESH_INTERVAL = 25_000; // 25s — under 30s hibernation threshold to keep DO warm

const MATCH_LIST_FIELDS = [
  "mid", "cty", "lnam", "lpc", "mtim", "stat",
  "hnam", "anam", "hscr", "ascr", "hhsc", "ahsc",
  "hpc", "apc", "seas", "locn",
] as const;

function stripFields(data: any[], fields: readonly string[]) {
  return data.map((m) => {
    const item: Record<string, unknown> = {};
    for (const k of fields) item[k] = m[k];
    return item;
  });
}

async function fetchFromOrigin(path: string, env: DOEnv) {
  const url = `${ORIGIN}${path}`;
  let resp: Response;
  if (env.VPC_SERVICE) {
    try {
      resp = await env.VPC_SERVICE.fetch(url);
    } catch (err: any) {
      console.warn("VPC fetch failed, fallback direct", err.message);
      resp = await fetch(url);
    }
  } else {
    resp = await fetch(url);
  }
  if (!resp.ok) return null;
  try {
    const json = await resp.json() as any;
    return json.code === 200 || json.code === 0 ? json : null;
  } catch {
    return null;
  }
}

export class ScorerefDO extends DurableObject<DOEnv> {
  private lists: Map<string, MatchListItem[]> = new Map();
  private details: Map<string, MatchDetail> = new Map();

  constructor(ctx: DurableObjectState, env: DOEnv) {
    super(ctx, env);
    // Restore persisted details in background — don't block requests.
    // The alarm (set after restore) populates lists within ~1s.
    // Requests before that get empty results; callers fall back to Cache/KV/Origin.
    Promise.allSettled([
      (async () => {
        const detailKeys = await ctx.storage.list({ prefix: "D:" });
        for (const [k] of detailKeys) {
          const v = await ctx.storage.get<MatchDetail>(k);
          if (v) this.details.set(k.slice(2), v);
        }
        await ctx.storage.setAlarm(Date.now() + 1000);
      })(),
    ]);
  }

  // --- DO Alarm: self-managed periodic refresh ---
  async alarm() {
    await this.refreshMatchData();
    // Schedule next refresh
    await this.ctx.storage.setAlarm(Date.now() + REFRESH_INTERVAL);
  }

  private async refreshMatchData() {
    // 13-day window: today ± 6 days
    const dates: string[] = [];
    const now = new Date();
    for (let i = -6; i <= 6; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const lists: Record<string, MatchListItem[]> = {};
    const liveMids = new Set<string>();

    // Fetch all dates in parallel (13 concurrent requests)
    const results = await Promise.allSettled(
      dates.map(async (date) => {
        const json = await fetchFromOrigin(
          `/v2/api/soccer/match/by-status?date=${date}`, this.env);
        return { date, json };
      })
    );

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const { date, json } = r.value;
      if (!json || !Array.isArray(json.data)) continue;

      const stripped = stripFields(json.data, MATCH_LIST_FIELDS) as any[];

      // Split by status in code
      const live: typeof stripped = [];
      const scheduled: typeof stripped = [];
      const finished: typeof stripped = [];

      for (const m of stripped) {
        if (m.stat === 1) { live.push(m); liveMids.add(m.mid); }
        else if (m.stat === 0) scheduled.push(m);
        else finished.push(m);
      }

      if (live.length) lists[`${date}:1`] = live;
      if (scheduled.length) lists[`${date}:0`] = scheduled;
      if (finished.length) lists[`${date}:-1`] = finished;
    }

    // Fetch details for live matches (batched)
    const midArray = [...liveMids];
    const BATCH = 10;
    for (let i = 0; i < midArray.length; i += BATCH) {
      const batch = midArray.slice(i, i + BATCH);
      const detailResults = await Promise.allSettled(
        batch.map(async (mid) => {
          const [info, inc] = await Promise.all([
            fetchFromOrigin(`/v2/api/soccer/match/match-info?matchId=${mid}`, this.env),
            fetchFromOrigin(`/v2/api/soccer/match/incidents?matchId=${mid}`, this.env),
          ]);
          if (info?.data) {
            return { mid, detail: { info: info.data, incidents: inc?.data?.incd || [] } };
          }
          return null;
        })
      );
      for (const dr of detailResults) {
        if (dr.status === "fulfilled" && dr.value) {
          this.details.set(dr.value.mid, dr.value.detail);
        }
      }
    }

    // Update in-memory state
    for (const [key, value] of Object.entries(lists)) {
      this.lists.set(key, value);
    }

    // Persist details
    if (liveMids.size > 0) {
      const puts: Promise<void>[] = [];
      for (const mid of liveMids) {
        const detail = this.details.get(mid);
        if (detail) puts.push(this.ctx.storage.put(`D:${mid}`, detail));
      }
      await Promise.all(puts);
    }

    // Broadcast to WebSocket clients
    this.broadcast({ type: "update", lists, details: Object.fromEntries(
      [...liveMids].map(mid => [mid, this.details.get(mid)]).filter(([, v]) => v)
    ) });
  }

  // --- Request routing ---
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return this.handleWebSocket();
    }

    // Manual refresh trigger (backup, can be called by external cron)
    if (url.pathname === "/refresh" && request.method === "POST") {
      await this.refreshMatchData();
      await this.ctx.storage.setAlarm(Date.now() + REFRESH_INTERVAL);
      return Response.json({ ok: true });
    }

    // Batch push (kept for backward compat / external push)
    if (url.pathname === "/batch" && request.method === "POST") {
      return this.handleBatch(request);
    }

    if (url.pathname === "/matches") {
      const key = `${url.searchParams.get("date") || ""}:${url.searchParams.get("status") || "1"}`;
      return Response.json({ code: 200, data: this.lists.get(key) || [] });
    }

    if (url.pathname === "/full") {
      const mid = url.searchParams.get("mid");
      if (mid) {
        let detail = this.details.get(mid);
        if (!detail) {
          detail = await this.fetchDetailFromOrigin(mid);
          if (detail) this.details.set(mid, detail);
        }
        return Response.json({ code: 200, data: detail });
      }
    }

    return new Response("Not Found", { status: 404 });
  }

  // --- WebSocket Hibernation API ---
  private handleWebSocket() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    server.send(JSON.stringify({
      type: "snapshot",
      lists: Object.fromEntries(this.lists),
      details: Object.fromEntries(this.details),
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    try {
      const req = JSON.parse(message);
      if (req.type === "getDetail" && req.mid) {
        let detail = this.details.get(req.mid);
        if (!detail) {
          detail = await this.fetchDetailFromOrigin(req.mid);
          if (detail) this.details.set(req.mid, detail);
        }
        ws.send(JSON.stringify({ type: "detail", mid: req.mid, data: detail }));
      }
    } catch { /* ignore */ }
  }

  async webSocketClose(_ws: WebSocket) { /* Hibernation API handles cleanup */ }
  async webSocketError(_ws: WebSocket, _error: Error) { /* no-op */ }

  // --- Batch update (backward compat) ---
  private async handleBatch(request: Request) {
    const body = await request.json() as {
      lists?: Record<string, MatchListItem[]>;
      details?: Record<string, MatchDetail>;
    };

    let changed = false;

    if (body.lists) {
      for (const [key, value] of Object.entries(body.lists)) {
        this.lists.set(key, value);
      }
      changed = true;
    }

    if (body.details) {
      for (const [key, value] of Object.entries(body.details)) {
        this.details.set(key, value);
      }
      changed = true;
    }

    if (changed) {
      this.broadcast({ type: "update", lists: body.lists, details: body.details });

      if (body.details) {
        const puts: Promise<void>[] = [];
        for (const [key, value] of Object.entries(body.details)) {
          puts.push(this.ctx.storage.put(`D:${key}`, value));
        }
        await Promise.all(puts);
      }
    }

    return Response.json({ ok: true });
  }

  // --- Broadcast to all WebSocket clients ---
  private broadcast(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch {}
    }
  }

  // --- Lazy fetch single match detail ---
  private async fetchDetailFromOrigin(mid: string): Promise<MatchDetail | undefined> {
    const [info, inc] = await Promise.all([
      fetchFromOrigin(`/v2/api/soccer/match/match-info?matchId=${mid}`, this.env),
      fetchFromOrigin(`/v2/api/soccer/match/incidents?matchId=${mid}`, this.env),
    ]);
    if (!info?.data) return undefined;
    return {
      info: info.data,
      incidents: inc?.data?.incd || [],
    };
  }
}
