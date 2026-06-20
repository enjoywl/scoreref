import { Hono } from "hono";

type Env = {
  VPC_SERVICE: {
    fetch: (url: string) => Promise<Response>;
  };
};

const app = new Hono<{ Bindings: Env }>();

app.get("/api/matches", async (c) => {
  const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
  const status = c.req.query("status") || "1";

  const url = `http://scoreref.com:9080/v2/api/soccer/match/by-status?date=${date}&status=${status}`;

  const resp = await c.env.VPC_SERVICE.fetch(url);
  if (!resp.ok) {
    return c.json({ error: "Failed to fetch matches" }, 502);
  }

  const data = await resp.json();
  return c.json(data);
});

export default app;

