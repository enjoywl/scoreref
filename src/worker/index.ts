import { Hono } from "hono";
import { compress } from "hono/compress";

type Env = {
  VPC_SERVICE?: {
    fetch: (url: string) => Promise<Response>;
  };
};

const app = new Hono<{ Bindings: Env }>();

app.use(compress());

const CACHE_TTL = 30;
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

  const json: any = await resp.json();
  if (json.code !== 200) return json;
  return json;
}

function isSuccess(json: any) {
  return json.code === 200 || json.code === 0;
}

async function cachedProxy(c: any, path: string, cacheKey: string, env: Env, pickFields?: readonly string[]) {
  const cache = caches.default;
  const ck = new Request(`https://cache.internal/${cacheKey}`);
  const cached = await cache.match(ck);
  if (cached) return cached;

  const json = await fetchFromOrigin(path, env);
  if (!json || !isSuccess(json)) {
    return c.json(json || { error: "Upstream error" }, json && isSuccess(json) ? 200 : 502);
  }

  if (pickFields && Array.isArray(json.data)) {
    json.data = stripFields(json.data, pickFields);
  }

  const result = Response.json(json);
  result.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  c.executionCtx.waitUntil(cache.put(ck, result.clone()));
  return result;
}

// --- Match list ---
app.get("/api/matches", async (c) => {
  const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
  const status = c.req.query("status") || "1";
  const path = `/v2/api/soccer/match/by-status?date=${date}&status=${status}`;
  return cachedProxy(c, path, `matches?date=${date}&status=${status}`, c.env, MATCH_LIST_FIELDS);
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

export default app;
