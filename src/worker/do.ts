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

// DO env bindings — VPC for origin access
interface DOEnv {
  VPC_SERVICE?: { fetch(url: string): Promise<Response> };
}

const ORIGIN = "http://106.42.192.93:8090";

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
  // In-memory cache: matches lists + match details
  private lists: Map<string, MatchListItem[]> = new Map();   // "date:status"
  private details: Map<string, MatchDetail> = new Map();      // "mid"

  constructor(ctx: DurableObjectState, env: DOEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const [lists, details] = await Promise.all([
        ctx.storage.get<[string, MatchListItem[]][]>("lists"),
        ctx.storage.get<[string, MatchDetail][]>("details"),
      ]);
      if (lists) this.lists = new Map(lists);
      if (details) this.details = new Map(details);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      return this.handleWebSocket();
    }

    // Batch push from Cron Worker
    if (url.pathname === "/batch" && request.method === "POST") {
      return this.handleBatch(request);
    }

    // HTTP fallback: match list
    if (url.pathname === "/matches") {
      const key = `${url.searchParams.get("date") || ""}:${url.searchParams.get("status") || "1"}`;
      return Response.json({ code: 200, data: this.lists.get(key) || [] });
    }

    // HTTP fallback: match detail
    if (url.pathname === "/full") {
      const mid = url.searchParams.get("mid");
      if (mid) {
        let detail = this.details.get(mid);
        // Lazy-load from origin if not in memory
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

    // Send current full snapshot to newly connected client
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
    } catch {
      // ignore malformed messages
    }
  }

  async webSocketClose(_ws: WebSocket) {
    // no-op: Hibernation API handles cleanup
  }

  async webSocketError(_ws: WebSocket, _error: Error) {
    // no-op
  }

  // --- Batch update ---
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

      // Persist to DO storage
      const listsArr: [string, MatchListItem[]][] = [...this.lists];
      const detailsArr: [string, MatchDetail][] = [...this.details];
      await Promise.all([
        this.ctx.storage.put("lists", listsArr),
        this.ctx.storage.put("details", detailsArr),
      ]);
    }

    return Response.json({ ok: true });
  }

  // --- Broadcast to all connected WebSockets ---
  private broadcast(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch {}
    }
  }

  // --- Lazy fetch match detail from origin ---
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
