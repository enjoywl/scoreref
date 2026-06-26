import { Hono } from "hono";

type Env = {
  VPC_SERVICE?: Fetcher;
  ASSETS?: Fetcher;
  API_SERVER?: string;
};

const app = new Hono<{ Bindings: Env }>();

async function proxy(c: any, path?: string): Promise<Response> {
  const server = c.env.API_SERVER || "http://localhost:3000";
  const url = new URL(c.req.url);
  const target = `${server}${path || url.pathname + url.search}`;

  const req = new Request(target, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
    redirect: "manual",
  });

  if (c.env.VPC_SERVICE) {
    try {
      return await c.env.VPC_SERVICE.fetch(req);
    } catch (e) {
      console.error("VPC proxy failed, fallback to direct:", e);
    }
  }
  return fetch(req);
}

// HTTP API proxy — all /api/* straight to backend
app.all("/api/*", async (c) => proxy(c));

// WebSocket proxy
app.all("/ws", async (c) => {
  const upgrade = c.req.header("Upgrade");
  if (upgrade !== "websocket") {
    return new Response("WebSocket required", { status: 426 });
  }

  const server = (c.env.API_SERVER || "http://localhost:3000").replace("http", "ws") + "/ws";
  const [client, edge] = Object.values(new WebSocketPair());
  edge.accept();

  const backend = new WebSocket(server);

  edge.addEventListener("message", (ev) => {
    if (backend.readyState === WebSocket.OPEN) backend.send(ev.data);
  });
  backend.addEventListener("message", (ev) => {
    if (edge.readyState === WebSocket.OPEN) edge.send(ev.data);
  });

  const close = () => { edge.close(); backend.close(); };
  edge.addEventListener("close", close);
  backend.addEventListener("close", close);
  edge.addEventListener("error", close);
  backend.addEventListener("error", close);

  return new Response(null, { status: 101, webSocket: client });
});

// Static assets fallback
app.all("*", async (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return new Response("Not found", { status: 404 });
});

export default app;
