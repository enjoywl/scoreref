import { Hono } from "hono";
import { matchSlug } from "../lib/slug";

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

async function fetchMatchDetail(mid: string, env: Env): Promise<any | null> {
  const server = env.API_SERVER || "http://localhost:3000";
  const url = `${server}/v1/api/match/${mid}`;
  try {
    const res = env.API_BINDING
      ? await env.API_BINDING.fetch(new Request(url))
      : await fetch(url);
    const json: any = await res.json();
    if (json.code === 200 && json.data) return json.data;
  } catch (e: any) {
    console.error("fetch detail error:", e?.message);
  }
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// HTTP API proxy — all /v1/* straight to backend
app.all("/v1/*", async (c) => proxy(c));

// Match detail page — inject SEO meta tags for crawlers
async function serveMatchPage(c: any, mid: string) {
  const data = await fetchMatchDetail(mid, c.env);

  // Get the base HTML
  let html: string;
  if (c.env.ASSETS) {
    const assetRes = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url)));
    html = await assetRes.text();
  } else {
    return new Response("Not found", { status: 404 });
  }

  if (!data) {
    // No match data — serve base HTML with default tags
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const info = data;
  const slug = matchSlug(info.hnm, info.anm);
  const matchUrl = `https://www.scoreref.com/match/${slug}/${mid}`;
  const title = `${info.hnm} vs ${info.anm} — ScoreRef`;
  const desc = `${info.hnm} ${info.hsc} - ${info.asc} ${info.anm} — ${info.tnm}. Live football scores and match details on ScoreRef.`;
  const logo = "https://www.scoreref.com/logo.png";

  const seoHead = `
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${matchUrl}" />
<meta property="og:image" content="${logo}" />
<meta property="og:site_name" content="ScoreRef" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${logo}" />
<link rel="canonical" href="${matchUrl}" />
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SportsEvent",
  "name": `${info.hnm} vs ${info.anm}`,
  "sport": "Soccer",
  "startDate": new Date(info.sts * 1000).toISOString(),
  "homeTeam": { "@type": "SportsTeam", "name": info.hnm },
  "awayTeam": { "@type": "SportsTeam", "name": info.anm },
  "location": info.vnm ? { "@type": "Place", "name": info.vnm } : undefined,
})}
</script>`;

  // Remove existing SEO tags from base HTML, then inject generated ones
  html = html
    .replace(/<title>[^<]*<\/title>/g, "")
    .replace(/<meta\s[^>]*property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s[^>]*name="twitter:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s[^>]*name="description"[^>]*>/gi, "")
    .replace(/<link\s[^>]*rel="canonical"[^>]*>/gi, "")
    .replace(/<script\s[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace("</head>", `${seoHead}\n</head>`);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

app.get("/match/:slug/:mid", async (c) => serveMatchPage(c, c.req.param("mid")));
app.get("/match/:mid",     async (c) => serveMatchPage(c, c.req.param("mid")));

// Static assets fallback
app.all("*", async (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return new Response("Not found", { status: 404 });
});

export default app;
