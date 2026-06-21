import { Hono } from "hono";

type Env = {
  VPC_SERVICE?: {
    fetch: (url: string) => Promise<Response>;
  };
};

const app = new Hono<{ Bindings: Env }>();

const CACHE_TTL = 30; // 边缘缓存 30 秒

const PICK_FIELDS = [
  "mid", "cty", "lnam", "lpc", "mtim", "stat",
  "hnam", "anam", "hscr", "ascr", "hhsc", "ahsc",
  "hpc", "apc", "seas", "locn",
] as const;

function stripFields(data: any[]) {
  return data.map((m) => {
    const item: Record<string, unknown> = {};
    for (const k of PICK_FIELDS) {
      item[k] = m[k];
    }
    return item;
  });
}

app.get("/api/matches", async (c) => {
  const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
  const status = c.req.query("status") || "1";
  const path = `/v2/api/soccer/match/by-status?date=${date}&status=${status}`;

  // --- 1. 查边缘缓存 ---
  const cacheKey = new Request(`https://cache.internal/matches?date=${date}&status=${status}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  // --- 2. 回源拉取 ---
  let sourceResp: Response;
  if (c.env.VPC_SERVICE) {
    sourceResp = await c.env.VPC_SERVICE.fetch(`http://api.sporthing.com:8090${path}`);
  } else {
    sourceResp = await fetch(`http://106.42.192.93:8090${path}`);
  }

  if (!sourceResp.ok) {
    return c.json({ error: "Failed to fetch matches" }, 502);
  }

  const json: any = await sourceResp.json();
  if (json.code !== 200) {
    return c.json(json);
  }

  // --- 3. 裁剪字段，减少传输量 ---
  json.data = stripFields(json.data);

  // --- 4. 写入缓存，返回 ---
  const result = Response.json(json);
  result.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  c.executionCtx.waitUntil(cache.put(cacheKey, result.clone()));

  return result;
});

export default app;
