import { Hono } from "hono";
import { ScorerefDO } from "./do";
export { ScorerefDO };

type Env = {
  SCOREREF_DO?: DurableObjectNamespace;
  VPC_SERVICE?: {
    fetch: (url: string) => Promise<Response>;
  };
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
  SCOREREF_KV?: {
    get(key: string, type: "json"): Promise<any>;
  };
};

const app = new Hono<{ Bindings: Env }>();

const BASE = "http://106.42.192.93:8090";

const MATCH_LIST_FIELDS = [
  "mid", "cty", "lnam", "lpc", "mtim", "stat",
  "hnam", "anam", "hscr", "ascr", "hhsc", "ahsc",
  "hpc", "apc", "seas", "locn",
] as const;

function stripFields(data: any[], fields: readonly string[]) {
  return data.map((m) => {
    const item: Record<string, unknown> = {};
    for (const k of fields) {
      item[k] = m[k];
    }
    return item;
  });
}

async function fetchFromOrigin(path: string, env: Env) {
  const hasVpc = !!env.VPC_SERVICE;
  const url = `${BASE}${path}`;

  let resp: Response;
  if (hasVpc) {
    try {
      resp = await env.VPC_SERVICE!.fetch(url);
    } catch (err: any) {
      console.warn("VPC fetch failed, fallback to direct", err.message);
      resp = await fetch(url);
    }
  } else {
    resp = await fetch(url);
  }

  if (!resp.ok) {
    console.error("upstream error", { status: resp.status });
    return null;
  }

  let json: any;
  try {
    json = await resp.json();
  } catch {
    console.error("upstream returned non-JSON");
    return null;
  }
  if (json.code !== 200) return json;
  return json;
}

function isSuccess(json: any) {
  return json.code === 200 || json.code === 0;
}

const EDGE_MAX_AGE = 30;      // Trigger background refresh after 30s
const EDGE_SWR = 120;        // Keep serving stale up to 2min after expiry
const CACHE_PERSIST = 300;   // Actual Cache API TTL (prevents premature eviction)

async function cachedProxy(c: any, path: string, cacheKey: string, env: Env, pickFields?: readonly string[]) {
  const cache = caches.default;
  const ck = new Request(`https://cache.internal/${cacheKey}`);
  const cached = await cache.match(ck);

  if (cached) {
    const age = parseInt(cached.headers.get("X-Cache-Age") || "0");
    const now = Date.now();
    // If stale, revalidate in background while returning cached
    if (now - age > EDGE_MAX_AGE * 1000) {
      c.executionCtx.waitUntil(
        fetchFromOrigin(path, env).then(json => {
          if (json && isSuccess(json)) {
            if (pickFields && Array.isArray(json.data)) {
              json.data = stripFields(json.data, pickFields);
            }
            const entry = Response.json(json);
            entry.headers.set("Cache-Control", `public, max-age=${EDGE_MAX_AGE}, stale-while-revalidate=${EDGE_SWR}`);
            entry.headers.set("X-Cache-Age", String(Date.now()));
            return cache.put(ck, entry);
          }
        }).catch(() => {})
      );
    }
    const resp = new Response(cached.body, cached);
    resp.headers.set("Cache-Control", "public, max-age=10");
    return resp;
  }

  const json = await fetchFromOrigin(path, env);
  if (!json || !isSuccess(json)) {
    return c.json(json || { error: "Upstream error" }, json && isSuccess(json) ? 200 : 502);
  }

  if (pickFields && Array.isArray(json.data)) {
    json.data = stripFields(json.data, pickFields);
  }

  const cacheEntry = Response.json(json);
  cacheEntry.headers.set("Cache-Control", `public, max-age=${EDGE_MAX_AGE}, stale-while-revalidate=${EDGE_SWR}`);
  cacheEntry.headers.set("X-Cache-Age", String(Date.now()));
  c.executionCtx.waitUntil(cache.put(ck, cacheEntry));

  return Response.json(json, { headers: { "Cache-Control": "public, max-age=10" } });
}

// Browser cache TTL by status filter
function maxAgeForStatus(status: string): number {
  if (status === "1") return 5;       // Live
  if (status === "0") return 10;      // Scheduled
  if (status === "-1") return 300;    // Finished
  return 5;                           // All (conservative, includes live)
}

// --- KV-backed match list fetch ---
async function fetchMatchesFromKV(date: string, status: string, env: Env) {
  const kv = env.SCOREREF_KV;
  if (!kv) return null;

  // Single key per day, contains full match data array
  const matches = await kv.get(`sf:d:${date}:v`, "json") as any[];
  if (!matches || !Array.isArray(matches)) return null;
  if (matches.length === 0) return [];

  // Filter by status
  let results = matches;
  if (status === "1") results = results.filter((m: any) => m.stat === 1);
  else if (status === "0") results = results.filter((m: any) => m.stat === 0);
  else if (status === "-1") results = results.filter((m: any) => m.stat === 3 || m.stat === -1);

  return stripFields(results, MATCH_LIST_FIELDS);
}

// --- Match list ---
app.get("/api/matches", async (c) => {
  const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
  const status = c.req.query("status") ?? "1";
  const maxAge = maxAgeForStatus(status);

  // Only route live match (status=1) to DO — real-time data matters.
  // Scheduled (0) and finished (-1) use Cache/KV to avoid DO cold start penalty.
  if (status === "1") {
    const doBinding = c.env.SCOREREF_DO;
    if (doBinding) {
      try {
        const id = doBinding.idFromName("default");
        const stub = doBinding.get(id);
        const doResp = await stub.fetch(`https://do.internal/matches?date=${date}&status=1`);
        if (doResp.ok) {
          const json = await doResp.json() as any;
          if (json.code === 200 && json.data?.length > 0) {
            return Response.json(json, {
              headers: { "Cache-Control": `public, max-age=${maxAge}` },
            });
          }
        }
      } catch { /* DO unavailable, fall through */ }
    }
  }

  const cacheKey = `matches?date=${date}&status=${status}`;
  const cache = caches.default;
  const ck = new Request(`https://cache.internal/${cacheKey}`);

  // Check Cache API next
  const cached = await cache.match(ck);
  if (cached) {
    const age = parseInt(cached.headers.get("X-Cache-Age") || "0");
    if (Date.now() - age > EDGE_MAX_AGE * 1000) {
      c.executionCtx.waitUntil(
        (async () => {
          const data = await fetchMatchesFromKV(date, status, c.env);
          if (data) {
            const entry = new Response(JSON.stringify({ code: 200, data }), {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${CACHE_PERSIST}`,
                "X-Cache-Age": String(Date.now()),
              },
            });
            await cache.put(ck, entry);
          }
        })().catch(() => {})
      );
    }
    const resp = new Response(cached.body, cached);
    resp.headers.set("Cache-Control", `public, max-age=${maxAge}`);
    return resp;
  }

  // Try KV first
  const data = await fetchMatchesFromKV(date, status, c.env);
  if (data) {
    const cacheEntry = new Response(JSON.stringify({ code: 200, data }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${EDGE_MAX_AGE}, stale-while-revalidate=${EDGE_SWR}`,
        "X-Cache-Age": String(Date.now()),
      },
    });
    c.executionCtx.waitUntil(cache.put(ck, cacheEntry));
    return new Response(JSON.stringify({ code: 200, data }), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
    });
  }

  // Fallback to origin (no duplicate cache check)
  const path = `/v2/api/soccer/match/by-status?date=${date}&status=${status}`;
  const json = await fetchFromOrigin(path, c.env);
  if (!json || !isSuccess(json)) {
    return c.json(json || { error: "Upstream error" }, json && isSuccess(json) ? 200 : 502);
  }
  if (MATCH_LIST_FIELDS && Array.isArray(json.data)) {
    json.data = stripFields(json.data, MATCH_LIST_FIELDS);
  }
  const cacheEntry = Response.json(json);
  cacheEntry.headers.set("Cache-Control", `public, max-age=${EDGE_MAX_AGE}, stale-while-revalidate=${EDGE_SWR}`);
  cacheEntry.headers.set("X-Cache-Age", String(Date.now()));
  c.executionCtx.waitUntil(cache.put(ck, cacheEntry));
  return Response.json(json, { headers: { "Cache-Control": `public, max-age=${maxAge}` } });
});

// --- Match detail APIs ---
app.get("/api/match/:mid/info", (c) => {
  const mid = c.req.param("mid");
  return cachedProxy(c, `/v2/api/soccer/match/match-info?matchId=${mid}`, `info/${mid}`, c.env);
});

app.get("/api/match/:mid/incidents", (c) => {
  const mid = c.req.param("mid");
  return cachedProxy(c, `/v2/api/soccer/match/incidents?matchId=${mid}`, `incidents/${mid}`, c.env);
});

app.get("/api/match/:mid/lineups", (c) => {
  const mid = c.req.param("mid");
  return cachedProxy(c, `/v2/api/soccer/match/lineups?matchId=${mid}`, `lineups/${mid}`, c.env);
});

app.get("/api/match/:mid/h2h", (c) => {
  const mid = c.req.param("mid");
  return cachedProxy(c, `/v2/api/soccer/match/h2h?matchId=${mid}`, `h2h/${mid}`, c.env);
});

app.get("/api/match/:mid/livetext", (c) => {
  const mid = c.req.param("mid");
  return cachedProxy(c, `/v2/api/soccer/match/livetext?matchId=${mid}`, `livetext/${mid}`, c.env);
});

app.get("/api/match/:mid/stats", (c) => {
  const mid = c.req.param("mid");
  return cachedProxy(c, `/v2/api/soccer/match/stats?matchId=${mid}`, `stats/${mid}`, c.env);
});

// --- Aggregated detail (BFF: 1 request instead of 6) ---
app.get("/api/match/:mid/full", async (c) => {
  const mid = c.req.param("mid");

  // Try DO first (< 10ms, live match details are pushed by cron)
  const doBinding = c.env.SCOREREF_DO;
  if (doBinding) {
    try {
      const id = doBinding.idFromName("default");
      const stub = doBinding.get(id);
      const doResp = await stub.fetch(`https://do.internal/full?mid=${mid}`);
      if (doResp.ok) {
        const json = await doResp.json() as any;
        if (json.code === 200 && json.data) {
          return Response.json(json, {
            headers: { "Cache-Control": "public, max-age=10" },
          });
        }
      }
    } catch { /* DO unavailable, fall through */ }
  }

  const cacheKey = `full/${mid}`;
  const cache = caches.default;
  const ck = new Request(`https://cache.internal/${cacheKey}`);
  const cached = await cache.match(ck);

  if (cached) {
    const age = parseInt(cached.headers.get("X-Cache-Age") || "0");
    if (Date.now() - age > EDGE_MAX_AGE * 1000) {
      c.executionCtx.waitUntil(refreshFullCache(mid, c.env, cache, ck));
    }
    const resp = new Response(cached.body, cached);
    resp.headers.set("Cache-Control", "public, max-age=10");
    return resp;
  }

  const data = await fetchFullMatchData(mid, c.env);
  if (!data) {
    return c.json({ code: 502, message: "Upstream error" }, 502);
  }

  const cacheEntry = new Response(JSON.stringify({ code: 200, data }), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${EDGE_MAX_AGE}, stale-while-revalidate=${EDGE_SWR}`, "X-Cache-Age": String(Date.now()) },
  });
  c.executionCtx.waitUntil(cache.put(ck, cacheEntry));

  return new Response(JSON.stringify({ code: 200, data }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=10" },
  });
});

async function fetchFullMatchData(mid: string, env: Env) {
  const [info, inc] = await Promise.all([
    fetchFromOrigin(`/v2/api/soccer/match/match-info?matchId=${mid}`, env),
    fetchFromOrigin(`/v2/api/soccer/match/incidents?matchId=${mid}`, env),
  ]);

  if (!info || !isSuccess(info)) return null;

  return {
    info: pickInfoFields(info.data),
    incidents: inc && isSuccess(inc) ? inc.data?.incd || [] : [],
  };
}

async function refreshFullCache(mid: string, env: Env, cache: Cache, ck: Request) {
  try {
    const data = await fetchFullMatchData(mid, env);
    if (data) {
      const entry = new Response(JSON.stringify({ code: 200, data }), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${EDGE_MAX_AGE}, stale-while-revalidate=${EDGE_SWR}`, "X-Cache-Age": String(Date.now()) },
      });
      await cache.put(ck, entry);
    }
  } catch (err) {
    // silent background refresh failure
  }
}

function pickInfoFields(d: any) {
  if (!d) return null;
  return {
    mid: d.mid, lnam: d.lnam, lpc: d.lpc, mtim: d.mtim, stat: d.stat,
    hnam: d.hnam, anam: d.anam, hscr: d.hscr, ascr: d.ascr,
    hhsc: d.hhsc, ahsc: d.ahsc, hred: d.hred, ared: d.ared,
    hyel: d.hyel, ayel: d.ayel, hcor: d.hcor, acor: d.acor,
    hrnk: d.hrnk, arnk: d.arnk, seas: d.seas, round: d.round,
    locn: d.locn, weat: d.weat, temp: d.temp,
    hmgr: d.hmgr, amgr: d.amgr, rfee: d.rfee,
    hpc: d.hpc, apc: d.apc,
  };
}

// --- DO proxy: WebSocket upgrade + HTTP fallback ---
app.all("/do/*", async (c) => {
  const doBinding = c.env.SCOREREF_DO;
  if (!doBinding) {
    return c.json({ code: 502, message: "Durable Object not available" }, 502);
  }
  const id = doBinding.idFromName("default");
  const stub = doBinding.get(id);
  // Rewrite /do/* → /*
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/do/, "");
  const req = new Request(url.toString(), c.req.raw);
  return stub.fetch(req);
});

// --- Global error handler: keep API errors as JSON ---
app.onError((err, c) => {
  console.error("Worker error", err.message);
  if (c.req.path.startsWith("/api/")) {
    return c.json({ code: 500, message: "Internal error" }, 500);
  }
  // Non-API: let static assets handle it
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text("Internal Server Error", 500);
});

// --- Fallback: non-API requests go to static assets ---
app.notFound((c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text("Not Found", 404);
});

export default {
  fetch: app.fetch.bind(app),
  scheduled: runScheduled,
};

// --- Cron trigger: push match data to DO every 60s ---
async function runScheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
  const doBinding = env.SCOREREF_DO;
  if (!doBinding) {
    console.error("Cron: SCOREREF_DO binding not available");
    return;
  }

  const id = doBinding.idFromName("default");
  const stub = doBinding.get(id);

  // 13-day window: today ± 6 days
  const dates: string[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const lists: Record<string, any[]> = {};
  const liveMids = new Set<string>();

  // One fetch per date (no status filter), split by stat in code
  const results = await Promise.allSettled(
    dates.map(async (date) => {
      const json = await fetchFromOrigin(`/v2/api/soccer/match/by-status?date=${date}`, env);
      return { date, json };
    })
  );

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { date, json } = r.value;
    if (!json || !isSuccess(json) || !Array.isArray(json.data)) continue;

    const stripped = stripFields(json.data, MATCH_LIST_FIELDS) as any[];

    // Split by status: live(1), scheduled(0), finished(3,-1)
    const live: typeof stripped = [];
    const scheduled: typeof stripped = [];
    const finished: typeof stripped = [];

    for (const m of stripped) {
      if (m.stat === 1) { live.push(m); liveMids.add(m.mid); }
      else if (m.stat === 0) scheduled.push(m);
      else finished.push(m); // stat 3 or -1
    }

    if (live.length) lists[`${date}:1`] = live;
    if (scheduled.length) lists[`${date}:0`] = scheduled;
    if (finished.length) lists[`${date}:-1`] = finished;
  }

  // Fetch details for live matches (concurrent batches of 10)
  const details: Record<string, any> = {};
  const midArray = [...liveMids];
  const BATCH = 10;
  for (let i = 0; i < midArray.length; i += BATCH) {
    const batch = midArray.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (mid) => {
        const [info, inc] = await Promise.all([
          fetchFromOrigin(`/v2/api/soccer/match/match-info?matchId=${mid}`, env),
          fetchFromOrigin(`/v2/api/soccer/match/incidents?matchId=${mid}`, env),
        ]);
        if (info && isSuccess(info) && info.data) {
          return {
            mid,
            detail: {
              info: info.data,
              incidents: inc && isSuccess(inc) ? inc.data?.incd || [] : [],
            },
          };
        }
        return null;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        details[r.value.mid] = r.value.detail;
      }
    }
  }

  // Push to DO
  try {
    const resp = await stub.fetch("https://do.internal/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lists, details }),
    });
    if (!resp.ok) {
      console.error("Cron: DO batch push failed", resp.status);
    }
  } catch (err: any) {
    console.error("Cron: DO batch push error", err.message);
  }
}
