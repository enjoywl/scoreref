/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from "hono";

type Env = {
  API_BINDING?: Fetcher;
  ASSETS?: Fetcher;
  API_SERVER?: string;
};

const app = new Hono<{ Bindings: Env }>();

function buildProxyHeaders(original: Headers): Headers {
  const h = new Headers();
  for (const [k, v] of original.entries()) {
    const lk = k.toLowerCase();
    if (lk === "host") continue;
    if (lk.startsWith("cf-")) continue;
    h.set(k, v);
  }
  return h;
}

async function proxy(c: any, path?: string): Promise<Response> {
  const server = c.env.API_SERVER || "http://localhost:3000";
  const url = new URL(c.req.url);
  const target = `${server}${path || url.pathname + url.search}`;

  const init: RequestInit = {
    method: c.req.method,
    headers: buildProxyHeaders(c.req.raw.headers),
    redirect: "manual",
  };
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    init.body = c.req.raw.body;
  }

  const req = new Request(target, init);

  try {
    if (c.env.API_BINDING) return await c.env.API_BINDING.fetch(req);
    return await fetch(req);
  } catch (e: any) {
    console.error("proxy error:", e?.message);
    return new Response(JSON.stringify({ code: -1, message: "backend unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// HTTP API proxy — all /v1/* straight to backend
app.all("/v1/*", async (c) => proxy(c));

// All other requests pass through to Cloudflare Assets (SPA fallback)
app.all("*", async (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return new Response("Not found", { status: 404 });
});

export default app;
