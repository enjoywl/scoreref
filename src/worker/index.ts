import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

app.get("/api/matches", async (c) => {
  const date = c.req.query("date") || new Date().toISOString().slice(0, 10);
  const status = c.req.query("status") || "1";

  const url = `http://106.42.192.93:8090/v2/api/soccer/match/by-status?date=${date}&status=${status}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    return c.json({ error: "Failed to fetch matches" }, 502);
  }

  const data = await resp.json();
  return c.json(data);
});

export default app;

