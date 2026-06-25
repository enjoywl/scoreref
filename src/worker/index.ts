import { Hono } from "hono";

type Env = {
  VPC_SERVICE?: {
    fetch: (url: string) => Promise<Response>;
  };
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
  SCOREREF_KV?: {
    get(key: string, type: "json"): Promise<any>;
    get(keys: string[]): Promise<Map<string, string | null>>;
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

const EDGE_MAX_AGE = 30;
const EDGE_SWR = 120;

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

const BATCH_SIZE = 50;

// --- KV-backed match list fetch ---
async function fetchMatchesFromKV(date: string, status: string, env: Env) {
  const kv = env.SCOREREF_KV;
  if (!kv) return null;

  const allMeta = await kv.get("sf:all:15d:m", "json") as any[];
  if (!allMeta || !Array.isArray(allMeta)) return null;

  // Filter by date (mt is unix timestamp in seconds)
  const dateStart = Math.floor(new Date(date + "T00:00:00Z").getTime() / 1000);
  const dateEnd = dateStart + 86400;
  const matchesOnDate = allMeta.filter((m: any) => m.mt >= dateStart && m.mt < dateEnd);

  if (matchesOnDate.length === 0) return [];

  // Bulk-read match details (max BATCH_SIZE keys per batch, each batch = 1 KV op)
  const keys = matchesOnDate.map((m: any) => `${m.mid}:m`);
  const details: any[] = [];
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const map = await kv.get(batch);
    for (const key of batch) {
      const raw = map.get(key);
      details.push(raw ? JSON.parse(raw) : null);
    }
  }

  // Filter out nulls and by status
  let results = details.filter((m: any) => m !== null);
  if (status === "1") results = results.filter((m: any) => m.stat === 1);
  else if (status === "0") results = results.filter((m: any) => m.stat === 0);
  else if (status === "-1") results = results.filter((m: any) => m.stat === 3 || m.stat === -1);

  return stripFields(results, MATCH_LIST_FIELDS);
}

// --- Match list ---
app.get("/api/matches", async (c) => {
  const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
  const status = c.req.query("status") || "1";
  const cacheKey = `matches?date=${date}&status=${status}`;
  const cache = caches.default;
  const ck = new Request(`https://cache.internal/${cacheKey}`);

  // Check Cache API first
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
                "Cache-Control": `public, max-age=${EDGE_MAX_AGE}, stale-while-revalidate=${EDGE_SWR}`,
                "X-Cache-Age": String(Date.now()),
              },
            });
            await cache.put(ck, entry);
          }
        })().catch(() => {})
      );
    }
    const resp = new Response(cached.body, cached);
    resp.headers.set("Cache-Control", "public, max-age=10");
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
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=10" },
    });
  }

  // Fallback to origin
  const path = `/v2/api/soccer/match/by-status?date=${date}&status=${status}`;
  return cachedProxy(c, path, cacheKey, c.env, MATCH_LIST_FIELDS);
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

export default app;
