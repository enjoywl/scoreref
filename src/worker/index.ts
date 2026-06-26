import { Hono } from "hono";

type Env = {
  VPC_SERVICE?: Fetcher;
  ASSETS?: Fetcher;
  API_SERVER?: string;
};

const app = new Hono<{ Bindings: Env }>();

function buildProxyHeaders(original: Headers): Headers {
  const h = new Headers();
  for (const [k, v] of original.entries()) {
    const lk = k.toLowerCase();
    if (lk === "host") continue;       // use backend host
    if (lk.startsWith("cf-")) continue; // strip CF headers
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

  // VPC_SERVICE resolves the VPC name (e.g. cloudflared tunnel); no public DNS fallback
  if (c.env.VPC_SERVICE) return c.env.VPC_SERVICE.fetch(req);

  // local dev — direct fetch to localhost
  return fetch(req);
}

// HTTP API proxy — all /api/* straight to backend
app.all("/api/*", async (c) => proxy(c));

// Static assets fallback
app.all("*", async (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return new Response("Not found", { status: 404 });
});

export default app;
