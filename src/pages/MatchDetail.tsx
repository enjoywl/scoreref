import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useI18n } from "../locales";
import { api } from "../lib/api";
import { matchSlug } from "../lib/slug";
import { useTimezone, formatKickoffTime, formatDateShort } from "../lib/timezone";

/* ---- Types ---- */
interface MatchInfo {
  mid: string; tnm: string; sts: number; sc: number;
  hnm: string; anm: string; hsc: number; asc: number;
  hs1: number; as1: number; snm: string; rnm: string;
  vnm: string; rfn?: string; grp?: string;
  hid: number; aid: number; tid?: number;
  hpc?: string; apc?: string; tpc?: string; tsc?: string;
  st?: string; sd?: string; wnr?: number;
}

interface Incident {
  tp: string; tm: number; at?: number; tx?: string;
  hsc?: number; asc?: number; ih?: boolean; cl?: string;
  pid?: number; pnm?: string;
  a1i?: number; a1n?: string;
  pii?: number; pin?: string; poi?: number; pon?: string; ij?: boolean;
  ln?: number; rpt?: number; pms?: number; rps?: number; rsd?: boolean; liv?: boolean;
}

interface CommentaryItem { tx: string; tp: string; ih: boolean; sq: number; pnm?: string; }

interface LineupPlayer { nm: string; sn: string; sh: number; pos: string; sub: boolean; cap?: boolean; }

interface PositionedPlayer extends LineupPlayer { _x: number; _y: number; }

interface StatItem { k: string; nm: string; hn: number; an: number; hv: string; av: string; rt: number; }

interface H2hMatch {
  mid: string; hnm: string; anm: string; hsc: number; asc: number;
  hs1: number; as1: number; hnt: number; ant: number;
  sts: number; st: string; sc: number; snm: string; tnm: string;
  rnm: string; wnr: number;
}

/* ---- Helpers ---- */
function getPlayerName(ev: Incident): string {
  return ev.pnm || ev.pin || ev.pon || "";
}

function getIncidentIcon(tp: string, cl?: string) {
  const t = (tp || "").toLowerCase();
  if (t === "period") return { icon: "", cls: "period" };
  if (t === "injurytime") return { icon: "", cls: "injury" };
  if (t === "card" && cl === "red") return { icon: "\u25AE", cls: "red" };
  if (t === "card" && cl === "yellow") return { icon: "\u25AE", cls: "yellow" };
  if (t === "goal" && cl === "own") return { icon: "\u26BD", cls: "own" };
  if (t === "goal" && cl === "penalty") return { icon: "\u26BD", cls: "penalty" };
  if (t === "goal") return { icon: "\u26BD", cls: "goal" };
  if (t === "substitution") return { icon: "\u2194", cls: "sub" };
  if (t === "vardecision") return { icon: "\u25B7", cls: "var" };
  if (t === "ingamepenalty" && cl === "missed") return { icon: "\u2715", cls: "miss" };
  if (t === "ingamepenalty" && cl === "scored") return { icon: "\u26BD", cls: "penalty" };
  if (t === "ingamepenalty") return { icon: "\u26BD", cls: "penalty" };
  return { icon: "\u25CF", cls: "other" };
}

function getPositionedPlayers(players: LineupPlayer[], side: "home" | "away"): PositionedPlayer[] {
  const field = players.filter(p => !p.sub);
  const rows: Record<number, LineupPlayer[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const p of field) {
    const ch = (p.pos || "").toUpperCase().charAt(0);
    let row = 2;
    if (ch === "G") row = 0;
    else if (ch === "D") row = 1;
    else if (ch === "M") row = 2;
    else if (ch === "F" || ch === "S") row = 3;
    rows[row].push(p);
  }
  for (const row of Object.values(rows)) {
    row.sort((a, b) => {
      const pa = (a.pos || "").toUpperCase();
      const pb = (b.pos || "").toUpperCase();
      const rank = (s: string) => s.includes("L") ? 0 : s.includes("R") ? 2 : 1;
      return rank(pa) - rank(pb);
    });
  }
  const xByRow = side === "home"
    ? [45, 170, 340, 475]
    : [955, 830, 660, 525];
  const yRange: Record<number, [number, number]> = {
    0: [325, 325], 1: [105, 545], 2: [55, 595], 3: [140, 510],
  };
  const result: PositionedPlayer[] = [];
  for (const [ri, rp] of Object.entries(rows)) {
    const row = parseInt(ri);
    const n = rp.length;
    const [y0, y1] = yRange[row];
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * i) / (n - 1);
      result.push({ ...rp[i], _x: xByRow[row], _y: Math.round(y) });
    }
  }
  return result;
}

function getSubstitutes(players: LineupPlayer[]) {
  return players.filter(p => p.sub);
}

/* ---- Match table (shared by H2H / team fixtures) ---- */
function MatchTable({ matches, refTeam, navigate }: {
  matches: H2hMatch[];
  refTeam: string;
  navigate: (path: string) => void;
}) {
  if (!matches.length) return <div className="text-center py-8 text-text-muted text-sm">No matches</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            {["Date", "Tournament", "Home", "Score", "Away", "Season", "Result"].map(h => (
              <th key={h} className="sticky top-0 py-2 px-2.5 text-[11px] font-semibold text-text-muted text-left whitespace-nowrap border-b-2 border-border bg-surface">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matches.map((ev, i) => {
            let resultEl = <span>-</span>;
            if (ev.wnr != null && ev.st === "finished") {
              const isHome = refTeam === ev.hnm;
              const wdl = isHome
                ? (ev.wnr === 1 ? "W" : ev.wnr === 0 ? "D" : "L")
                : (ev.wnr === 1 ? "L" : ev.wnr === 0 ? "D" : "W");
              const colorMap: Record<string, string> = {
                W: "text-[#4caf50] bg-[#4caf50]/10",
                D: "text-[#f4c542] bg-[#f4c542]/10",
                L: "text-[#e53935] bg-[#e53935]/10",
              };
              resultEl = <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${colorMap[wdl]}`}>{wdl}</span>;
            }
            return (
              <tr
                key={ev.mid}
                onClick={() => navigate(`/match/${matchSlug(ev.hnm || "", ev.anm || "")}/${ev.mid}`)}
                className={`cursor-pointer transition-all hover:bg-accent/4 dark:hover:bg-accent/8 active:scale-[0.995] ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
              >
                <td className="py-2.5 px-3 text-xs text-text-secondary border-b border-border-subtle whitespace-nowrap rounded-l-md">
                  {ev.sts ? formatDateShort(ev.sts, timezone) : "-"}
                </td>
                <td className="py-2.5 px-3 text-xs text-text-muted border-b border-border-subtle max-w-[140px] truncate">{ev.tnm || "-"}</td>
                <td className="py-2.5 px-3 text-center font-semibold text-text-primary border-b border-border-subtle">{ev.hnm || "-"}</td>
                <td className="py-2.5 px-3 text-center border-b border-border-subtle">
                  {ev.hsc != null && ev.asc != null ? (
                    <>
                      <span className="font-bold text-text-primary tabular-nums text-sm">{ev.hsc} - {ev.asc}</span>
                      {(ev.hs1 != null || ev.as1 != null) && (
                        <span className="text-[11px] text-text-muted ml-1">({ev.hs1 ?? 0} - {ev.as1 ?? 0})</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-text-muted">vs</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center font-semibold text-text-primary border-b border-border-subtle">{ev.anm || "-"}</td>
                <td className="py-2.5 px-3 text-xs text-text-muted border-b border-border-subtle">{ev.snm || "-"}</td>
                <td className="py-2.5 px-3 text-center border-b border-border-subtle rounded-r-md">
                  {resultEl}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Component ---- */
export default function MatchDetail() {
  const { t } = useI18n();
  const { timezone } = useTimezone();
  const params = useParams<{ mid: string; slug?: string }>();
  const mid = params.mid!;
  const slug = params.slug;
  const navigate = useNavigate();

  const [info, setInfo] = useState<MatchInfo | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [commentary, setCommentary] = useState<CommentaryItem[]>([]);
  const [lineups, setLineups] = useState<{ home: LineupPlayer[]; away: LineupPlayer[]; hform: string; aform: string } | null>(null);
  const [stats, setStats] = useState<{ pr: string; gr: { gn: string; si: StatItem[] }[] }[]>([]);
  const [h2h, setH2h] = useState<{
    h2h: H2hMatch[];
    home: { recent: H2hMatch[]; upcoming: H2hMatch[] };
    away: { recent: H2hMatch[]; upcoming: H2hMatch[] };
  } | null>(null);
  const [teamTab, setTeamTab] = useState<{ home: "recent" | "upcoming"; away: "recent" | "upcoming" }>({ home: "recent", away: "recent" });
  const [h2hLimit, setH2hLimit] = useState(6);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("incidents");
  // Track which data has been fetched (for lazy loading)
  const [fetched, setFetched] = useState({ commentary: false, stats: false, lineups: false, h2h: false });

  async function fetchJSON(url: string) {
    const res = await fetch(url);
    const json = await res.json();
    return json.code === 200 ? json.data : null;
  }

  const loadMatchData = useCallback(async (matchId: string) => {
    setActiveTab("incidents");
    setFetched({ commentary: false, stats: false, lineups: false, h2h: false });
    setCommentary([]);
    setStats([]);
    setLineups(null);
    setH2h(null);

    const cached = api.getDetail(matchId);
    if (cached) {
      setInfo(cached.info);
      setIncidents(cached.incidents);
      setLoading(false);
    } else {
      setLoading(true);
      const detail = await api.fetchDetail(matchId);
      if (detail) {
        setInfo(detail.info);
        setIncidents(detail.incidents);
      }
      setLoading(false);
    }

    // Load commentary + stats in background (needed for Live tab)
    fetchJSON(`/v1/api/match/${matchId}/comments`).then(d => {
      if (d) setCommentary(Array.isArray(d) ? d : d.cms || []);
      setFetched(f => ({ ...f, commentary: true }));
    });
    fetchJSON(`/v1/api/match/${matchId}/statistics`).then(d => {
      if (d) setStats(d.prs || []);
      setFetched(f => ({ ...f, stats: true }));
    });
  }, []);

  // Lazy-load lineups when tab selected
  function loadLineups() {
    if (!mid || fetched.lineups || lineups !== null) return;
    setFetched(f => ({ ...f, lineups: true }));
    fetchJSON(`/v1/api/match/${mid}/lineups`).then(d => {
      if (d) {
        setLineups({
          home: (d.hm?.pl || []).map((p: Record<string, unknown>) => ({ nm: p.nm, sn: p.sn, sh: p.sh, pos: p.pos, sub: p.sub, cap: p.cap } as LineupPlayer)),
          away: (d.aw?.pl || []).map((p: Record<string, unknown>) => ({ nm: p.nm, sn: p.sn, sh: p.sh, pos: p.pos, sub: p.sub, cap: p.cap } as LineupPlayer)),
          hform: d.hm?.fm || "", aform: d.aw?.fm || "",
        });
      }
    });
  }

  // Lazy-load h2h when tab selected
  function loadH2h() {
    if (!mid || fetched.h2h) return;
    setFetched(f => ({ ...f, h2h: true }));
    fetchJSON(`/v1/api/match/${mid}/h2h`).then(d => {
      if (d) setH2h({ h2h: d.h2h || [], home: d.home || { recent: [], upcoming: [] }, away: d.away || { recent: [], upcoming: [] } });
    });
  }

  useEffect(() => {
    if (mid) loadMatchData(mid);
  }, [mid, loadMatchData]);

  // Redirect to canonical URL with slug
  useEffect(() => {
    if (!info || !mid) return;
    const correctSlug = matchSlug(info.hnm, info.anm);
    if (slug !== correctSlug) {
      navigate(`/match/${correctSlug}/${mid}`, { replace: true });
    }
  }, [info, mid, slug, navigate]);

  useEffect(() => {
    api.start();
  }, []);

  useEffect(() => {
    if (!mid) return;
    const unsub = api.subscribe((state) => {
      const detail = state.details[mid];
      if (detail) {
        setInfo((prev) => {
          // Only update if scores or sc changed (avoid flicker on identical data)
          if (!prev || prev.hsc !== detail.info.hsc || prev.asc !== detail.info.asc || prev.sc !== detail.info.sc) {
            return detail.info;
          }
          return prev;
        });
        setIncidents(detail.incidents);
      }
    });
    return unsub;
  }, [mid]);

  const matchTime = useMemo(() => {
    if (!info) return "";
    if (info.sc >= 1 && info.sc < 100 && info.sc !== 31) {
      const elapsed = Math.floor((Date.now() - info.sts * 1000) / 60000);
      return Math.max(0, elapsed) + "'";
    }
    if (info.sc === 31) return t("match.ht");
    if (info.sc >= 100) return t("match.ft");
    return "";
  }, [info, t]);

  const allStats = useMemo(() => stats.find(s => s.pr === "ALL") || stats[0], [stats]);

  const isLive = info?.sc != null && info.sc >= 1 && info.sc < 100 && info.sc !== 31;
  const isHT = info?.sc === 31;
  const heroGradient = isLive
    ? "bg-gradient-to-br from-[#0d47a1]/35 via-[#1565C0]/15 to-[#0d47a1]/35 border-[#4fc3f7]/25"
    : isHT
      ? "bg-gradient-to-br from-[#e6a23c]/12 via-[#e6a23c]/4 to-[#e6a23c]/12 border-[#e6a23c]/20"
      : "bg-surface border-border";

  /* ---- Render ---- */
  return (
    <div className="max-w-[1200px] mx-auto p-4">
      {/* Hero skeleton while loading */}
      {loading && (
        <div className="bg-surface rounded-2xl p-4 sm:p-6 border border-border flex flex-col items-center gap-3 mb-5">
          <div className="w-[140px] sm:w-[180px] h-3.5 rounded-md animate-pulse bg-gradient-to-r from-skeleton-from via-skeleton-via to-skeleton-to bg-[length:200%_100%]" />
          <div className="w-[100px] sm:w-[120px] h-8 sm:h-9 rounded-md animate-pulse bg-gradient-to-r from-skeleton-from via-skeleton-via to-skeleton-to bg-[length:200%_100%]" />
          <div className="w-[200px] sm:w-[260px] h-3 rounded-md animate-pulse bg-gradient-to-r from-skeleton-from via-skeleton-via to-skeleton-to bg-[length:200%_100%]" />
        </div>
      )}

      {/* Error */}
      {!loading && !info && <div className="text-center py-16 text-[#e53935]">Failed to load match data</div>}

      {/* Content */}
      {info && (
        <>
          <Helmet>
            <title>{info.hnm} vs {info.anm} — ScoreRef</title>
            <meta name="description" content={`${info.hnm} vs ${info.anm} — ${info.tnm}. Live score, match stats, incidents, lineups and H2H history.`} />
            <meta property="og:title" content={`${info.hnm} vs ${info.anm} — ScoreRef`} />
            <meta property="og:description" content={`${info.tnm} — ${info.hnm} ${info.hsc} - ${info.asc} ${info.anm}`} />
            <meta property="og:type" content="article" />
            <script type="application/ld+json">
              {JSON.stringify({
                "@context": "https://schema.org",
                "@type": "SportsEvent",
                "name": `${info.hnm} vs ${info.anm}`,
                "sport": "Soccer",
                "startDate": new Date(info.sts * 1000).toISOString(),
                "homeTeam": { "@type": "SportsTeam", "name": info.hnm },
                "awayTeam": { "@type": "SportsTeam", "name": info.anm },
                "location": info.vnm ? { "@type": "Place", "name": info.vnm } : undefined,
              })}
            </script>
          </Helmet>

          {/* Hero */}
          <div className={`mb-5 p-5 md:p-6 rounded-2xl border relative overflow-hidden before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] ${heroGradient}
            ${isLive ? "before:bg-gradient-to-r before:from-[#1565C0] before:via-[#4fc3f7] before:to-[#1565C0]" : ""}
            ${isHT ? "before:bg-gradient-to-r before:from-[#b8860b] before:via-[#e6a23c] before:to-[#b8860b]" : ""}
            ${info.sc >= 100 ? "before:bg-[#444]" : ""}`}
          >
            {/* Top bar */}
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
                className="text-xs font-semibold text-accent bg-accent/8 dark:bg-accent/10 px-3 py-1 rounded-2xl hover:bg-accent/20 transition-colors cursor-pointer"
              >
                &larr; Back
              </button>
              <span className="flex-1 text-center text-[13px] text-text-secondary font-medium flex items-center justify-center gap-1.5">
                {info.tid && <img src={`/v1/image/league/${info.tid}.png`} alt="" className="w-[18px] h-[18px] object-contain rounded" />}
                {info.tnm}
              </span>
              {info.rnm && <span className="text-xs text-text-muted shrink-0">{info.rnm}</span>}
            </div>

            {/* Teams + score */}
            <div className="flex items-center justify-between gap-3 sm:gap-5 mb-5">
              <div className="flex-1 flex flex-col items-center gap-2 sm:gap-2.5 text-center min-w-0">
                <div className="w-[56px] h-[56px] sm:w-[72px] sm:h-[72px] rounded-full bg-[#f5f5f5] dark:bg-white/5 border-2 border-[#e8e8e8] dark:border-white/10 flex items-center justify-center">
                  <img src={`/v1/image/team/${info.hid}.png`} alt={info.hnm} className="w-[40px] h-[40px] sm:w-[52px] sm:h-[52px] object-contain" />
                </div>
                <span className="text-[13px] sm:text-[15px] font-bold text-text-primary max-w-[100px] sm:max-w-[180px] truncate">{info.hnm}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 sm:gap-1 shrink-0">
                <span className="text-[32px] sm:text-[42px] font-black text-text-primary tracking-[2px] sm:tracking-[3px] tabular-nums leading-none">{info.hsc} - {info.asc}</span>
                {info.sc >= 31 && <span className="text-xs sm:text-sm text-text-muted dark:text-white/40">({info.hs1} - {info.as1})</span>}
                <span className={`text-xs sm:text-sm font-bold mt-0.5 sm:mt-1 px-2.5 sm:px-3.5 py-0.5 rounded-xl
                  ${isLive ? "text-white bg-accent animate-pulse-ring" : ""}
                  ${isHT ? "text-white bg-[#e6a23c]" : ""}
                  ${info.sc >= 100 ? "text-text-muted bg-surface-alt" : ""}`}
                >
                  {matchTime}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-2 sm:gap-2.5 text-center min-w-0">
                <div className="w-[56px] h-[56px] sm:w-[72px] sm:h-[72px] rounded-full bg-[#f5f5f5] dark:bg-white/5 border-2 border-[#e8e8e8] dark:border-white/10 flex items-center justify-center">
                  <img src={`/v1/image/team/${info.aid}.png`} alt={info.anm} className="w-[40px] h-[40px] sm:w-[52px] sm:h-[52px] object-contain" />
                </div>
                <span className="text-[13px] sm:text-[15px] font-bold text-text-primary max-w-[100px] sm:max-w-[180px] truncate">{info.anm}</span>
              </div>
            </div>

            {/* Info strip chips */}
            <div className="flex justify-center items-center gap-2 flex-wrap pt-4 border-t border-[#eee] dark:border-white/8">
              {info.snm && <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">{info.snm}</span>}
              <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">
                {formatKickoffTime(info.sts, timezone)}
              </span>
              {info.vnm && <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">{info.vnm}</span>}
              <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">Ref: {info.rfn || "-"}</span>
            </div>
          </div>

          {/* Match info grid — always visible */}
          {info && (
            <section className="mb-5">
              <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">Match Info</h3>
              <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden">
                {[
                  ["Status", info.sd || info.st || "-"],
                  ["Round", info.rnm || "-"],
                  ["Season", info.snm || "-"],
                  ["Referee", info.rfn || "-"],
                  ...(info.grp ? [["Group", info.grp]] : []),
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-2.5 px-3.5 bg-surface text-[13px] text-text-primary">
                    <span className="text-[12px] text-text-muted">{label}</span>
                    <span>{val}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tabs */}
          <div className="border-b border-border mb-5">
            <div className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
              {[
                { key: "stats", label: "Stats" },
                { key: "incidents", label: "Incidents" },
                { key: "commentary", label: "Commentary" },
                { key: "lineups", label: "Lineups" },
                { key: "h2h", label: "H2H" },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    if (tab.key === "lineups") loadLineups();
                    if (tab.key === "h2h") loadH2h();
                  }}
                  className={`text-[13px] px-4 py-2.5 font-medium transition-colors cursor-pointer border-b-2 shrink-0
                    ${activeTab === tab.key
                      ? "text-accent border-accent"
                      : "text-text-muted border-transparent hover:text-text-muted"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* === STATS TAB === */}
          {activeTab === "stats" && (
            !fetched.stats ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => <div key={i} className="h-5 bg-skeleton-from rounded animate-pulse" />)}
              </div>
            ) : allStats ? (
              <div className="flex flex-col gap-4">
                {allStats.gr.map((g: { gn: string; si: StatItem[] }) => (
                  <div key={g.gn}>
                    <div className="text-xs text-accent font-semibold mb-2 uppercase tracking-wide">{g.gn}</div>
                    {g.si.map((it: StatItem) => {
                      const max = Math.max(it.hn, it.an);
                      const hPct = max ? Math.round((it.hn / max) * 100) : 0;
                      const aPct = max ? Math.round((it.an / max) * 100) : 0;
                      return (
                        <div key={it.k || it.nm} className="flex items-center gap-2.5 py-1">
                          <span className="text-sm font-bold text-[#1565C0] dark:text-[#64b5f6] text-right min-w-[30px] tabular-nums">{it.hv}</span>
                          <div className="flex-1 h-1.5 bg-border-light rounded-sm flex gap-0.5 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#1565C0] to-[#42a5f5] rounded-sm ml-auto transition-[width] duration-600" style={{ width: hPct + "%" }} />
                            <div className="h-full bg-gradient-to-r from-[#ef5350] to-[#c62828] rounded-sm transition-[width] duration-600" style={{ width: aPct + "%" }} />
                          </div>
                          <span className="text-sm font-bold text-[#c62828] dark:text-[#ef5350] text-left min-w-[30px] tabular-nums">{it.av}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-text-muted">No stats available</div>
            )
          )}

          {/* === INCIDENTS TAB === */}
          {activeTab === "incidents" && (
            incidents.length > 0 ? (
              <div className="relative py-3 before:absolute before:left-1/2 before:top-0 before:bottom-0 before:w-0.5 before:bg-border before:-translate-x-1/2">
                {incidents.map((ev, idx) => {
                  if (ev.tp === "period") return (
                    <div key={idx} className="flex justify-center items-center gap-3 py-2.5 my-1">
                      <span className="text-[13px] font-bold text-accent bg-accent/10 px-3.5 py-1 rounded-xl">{ev.tx}</span>
                      {ev.hsc != null && <span className="text-sm font-bold text-text-primary">{ev.hsc} - {ev.asc}</span>}
                    </div>
                  );
                  if (ev.tp === "injuryTime") return (
                    <div key={idx} className="text-center text-[11px] text-[#e6a23c] font-semibold py-1">+{ev.ln}&apos; added</div>
                  );
                  const ico = getIncidentIcon(ev.tp, ev.cl);
                  const dotColors: Record<string, string> = {
                    goal: "border-[#4caf50] bg-[#4caf50] shadow-[0_0_6px_rgba(76,175,80,0.3)]",
                    penalty: "border-[#ff9800] bg-[#ff9800]",
                    yellow: "border-[#f4c542] bg-[#f4c542]",
                    red: "border-[#e53935] bg-[#e53935]",
                    own: "border-[#e53935] bg-[#e53935]",
                    sub: "border-[#42a5f5] bg-[#42a5f5]",
                    var: "border-[#ab47bc] bg-[#ab47bc]",
                    miss: "border-[#999] bg-[#999]",
                    other: "border-[#666] bg-[#666]",
                  };
                  const barSide = ico.cls === "goal" ? "border-l-[#4caf50]" : ico.cls === "red" ? "border-l-[#e53935]" : ico.cls === "yellow" ? "border-l-[#f4c542]" : ico.cls === "sub" ? "border-l-[#42a5f5]" : ico.cls === "var" ? "border-l-[#ab47bc]" : "border-l-[#666]";
                  const barSideAway = ev.ih ? "" : barSide;
                  const barSideHome = ev.ih ? barSide.replace("border-l", "border-r") : "";
                  return (
                    <div key={idx} className="flex items-start mb-1">
                      {/* Home side */}
                      <div className="flex-1 flex flex-col items-end px-2 sm:px-5">
                        {ev.ih === true && (
                          <div className={`flex items-center gap-2.5 py-2.5 px-3.5 bg-surface-elevated/85 backdrop-blur-lg border border-black/8 dark:border-white/8 rounded-[10px] max-w-[280px] relative border-l-3 ${barSideHome}`}>
                            {ico.icon && <span className="text-base shrink-0">{ico.icon}</span>}
                            <div className={`flex flex-col gap-0.5 text-right`}>
                              {ev.tp === "goal" || ev.tp === "inGamePenalty" ? (
                                <>
                                  <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                  {ev.a1n && <span className="text-[11px] text-accent">A {ev.a1n}</span>}
                                </>
                              ) : ev.tp === "card" ? (
                                <>
                                  <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ev.cl === "red" ? "text-[#e53935] bg-[#e53935]/10 dark:bg-[#e53935]/10 bg-[#e53935]/15" : "text-[#f4c542] bg-[#f4c542]/10 dark:bg-[#f4c542]/10 bg-[#f4c542]/15"}`}>{ev.cl === "red" ? "Red Card" : "Yellow Card"}</span>
                                </>
                              ) : ev.tp === "substitution" ? (
                                <>
                                  <span className="text-[13px] text-[#4caf50] font-semibold">{ev.pin}</span>
                                  <span className="text-[13px] text-[#e53935] line-through">{ev.pon}</span>
                                </>
                              ) : (
                                <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev) || ev.tx}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Time marker */}
                      <div className="relative flex flex-col items-center min-w-[36px] py-1 z-10">
                        <div className={`w-3 h-3 rounded-full border-2 shrink-0 mt-1.5 ${dotColors[ico.cls] || dotColors.other}`} />
                        <span className="text-[11px] font-bold text-accent mt-1 tabular-nums">
                          {ev.at && ev.at > 0 ? ev.tm + "+" + ev.at : ev.tm}&apos;
                        </span>
                      </div>

                      {/* Away side */}
                      <div className="flex-1 flex flex-col items-start px-2 sm:px-5">
                        {ev.ih === false && (
                          <div className={`flex items-center gap-2.5 py-2.5 px-3.5 bg-surface-elevated/85 backdrop-blur-lg border border-black/8 dark:border-white/8 rounded-[10px] max-w-[280px] relative ${barSideAway}`}>
                            <div className="flex flex-col gap-0.5 text-left">
                              {ev.tp === "goal" || ev.tp === "inGamePenalty" ? (
                                <>
                                  <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                  {ev.a1n && <span className="text-[11px] text-accent">A {ev.a1n}</span>}
                                </>
                              ) : ev.tp === "card" ? (
                                <>
                                  <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ev.cl === "red" ? "text-[#e53935] bg-[#e53935]/10" : "text-[#f4c542] bg-[#f4c542]/10"}`}>{ev.cl === "red" ? "Red Card" : "Yellow Card"}</span>
                                </>
                              ) : ev.tp === "substitution" ? (
                                <>
                                  <span className="text-[13px] text-[#4caf50] font-semibold">{ev.pin}</span>
                                  <span className="text-[13px] text-[#e53935] line-through">{ev.pon}</span>
                                </>
                              ) : (
                                <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev) || ev.tx}</span>
                              )}
                            </div>
                            {ico.icon && <span className="text-base shrink-0">{ico.icon}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-text-muted">No incidents recorded</div>
            )
          )}

          {/* === COMMENTARY TAB === */}
          {activeTab === "commentary" && (
            !fetched.commentary ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => <div key={i} className="h-4 bg-skeleton-from rounded animate-pulse" />)}
              </div>
            ) : commentary.length > 0 ? (
              <div>
                {commentary.map(c => (
                  <div key={c.sq} className="flex items-start gap-2.5 py-1.5 border-b border-border-subtle text-[13px]">
                    <span className="text-[11px] text-text-muted min-w-[40px] shrink-0">{c.tp}</span>
                    {c.pnm && <span className="text-text-primary font-medium shrink-0">{c.pnm}</span>}
                    <span className="text-text-muted">{c.tx}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-text-muted">No commentary available</div>
            )
          )}

          {/* === LINEUPS TAB === */}
          {activeTab === "lineups" && (
            !fetched.lineups ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            : !lineups ? <div className="text-center py-16 text-text-muted">No lineup data</div>
            : (
              <div className="flex flex-col gap-4">
                {/* Team headers */}
                <div className="flex justify-between items-center max-w-[700px] mx-auto w-full">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-text-primary">{info.hnm}</span>
                    {lineups.hform && <span className="text-xs text-accent font-semibold bg-accent/10 px-2.5 py-0.5 rounded">{lineups.hform}</span>}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-text-primary">{info.anm}</span>
                    {lineups.aform && <span className="text-xs text-accent font-semibold bg-accent/10 px-2.5 py-0.5 rounded">{lineups.aform}</span>}
                  </div>
                </div>

                {/* SVG Pitch */}
                <div className="max-w-[700px] mx-auto w-full">
                  <svg viewBox="0 0 1000 650" className="block w-full h-auto rounded-lg" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id="grassStripes" patternUnits="userSpaceOnUse" width="50" height="650">
                        <rect x="0" y="0" width="25" height="650" fill="rgba(255,255,255,0.025)" />
                      </pattern>
                    </defs>
                    <rect x="0" y="0" width="1000" height="650" rx="8" fill="#388E3C" />
                    <rect x="0" y="0" width="1000" height="650" rx="8" fill="url(#grassStripes)" />
                    <rect x="6" y="6" width="988" height="638" rx="4" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" />
                    <line x1="500" y1="6" x2="500" y2="644" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" />
                    <circle cx="500" cy="325" r="90" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
                    <circle cx="500" cy="325" r="4" fill="rgba(255,255,255,0.9)" />
                    <rect x="6" y="130" width="160" height="390" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
                    <rect x="6" y="222" width="55" height="206" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" />
                    <circle cx="115" cy="325" r="4" fill="rgba(255,255,255,0.9)" />
                    <path d="M 166 285 A 90 90 0 0 1 166 365" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
                    <rect x="834" y="130" width="160" height="390" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
                    <rect x="939" y="222" width="55" height="206" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" />
                    <circle cx="885" cy="325" r="4" fill="rgba(255,255,255,0.9)" />
                    <path d="M 834 285 A 90 90 0 0 0 834 365" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
                    <rect x="0" y="278" width="14" height="94" rx="2" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
                    <rect x="986" y="278" width="14" height="94" rx="2" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
                    <path d="M 40 6 A 34 34 0 0 0 6 40" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
                    <path d="M 40 644 A 34 34 0 0 1 6 610" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
                    <path d="M 960 6 A 34 34 0 0 1 994 40" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
                    <path d="M 960 644 A 34 34 0 0 0 994 610" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />

                    {getPositionedPlayers(lineups.home, "home").map(p => (
                      <g key={"hp" + p.sh}>
                        <circle cx={p._x} cy={p._y} r="13" fill="#1565C0" stroke="#fff" strokeWidth="2" />
                        <text x={p._x} y={p._y + 1} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>{p.sh}</text>
                        <text x={p._x} y={p._y + 26} textAnchor="middle" fontSize="7.5" fill="#fff" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>{p.sn}</text>
                        {p.cap && <polygon points={`${p._x - 10},${p._y - 4} ${p._x + 10},${p._y - 4} ${p._x},${p._y - 11}`} fill="#FFC107" />}
                      </g>
                    ))}
                    {getPositionedPlayers(lineups.away, "away").map(p => (
                      <g key={"ap" + p.sh}>
                        <circle cx={p._x} cy={p._y} r="13" fill="#C62828" stroke="#fff" strokeWidth="2" />
                        <text x={p._x} y={p._y + 1} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>{p.sh}</text>
                        <text x={p._x} y={p._y + 26} textAnchor="middle" fontSize="7.5" fill="#fff" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>{p.sn}</text>
                        {p.cap && <polygon points={`${p._x - 10},${p._y - 4} ${p._x + 10},${p._y - 4} ${p._x},${p._y - 11}`} fill="#FFC107" />}
                      </g>
                    ))}
                  </svg>
                </div>

                {/* Substitutes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-text-secondary font-semibold mb-1.5">{info.hnm} — Substitutes</div>
                    <div className="flex flex-wrap gap-1 p-2 bg-surface rounded-md">
                      {getSubstitutes(lineups.home).map(p => (
                        <span key={"hs" + p.sh} className="text-[11px] text-text-muted px-2 py-0.5 bg-surface-alt rounded">{p.sh} {p.nm}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-secondary font-semibold mb-1.5">{info.anm} — Substitutes</div>
                    <div className="flex flex-wrap gap-1 p-2 bg-surface rounded-md">
                      {getSubstitutes(lineups.away).map(p => (
                        <span key={"as" + p.sh} className="text-[11px] text-text-muted px-2 py-0.5 bg-surface-alt rounded">{p.sh} {p.nm}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {/* === H2H TAB === */}
          {activeTab === "h2h" && (
            !fetched.h2h ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            : !h2h ? <div className="text-center py-16 text-text-muted">No H2H data available</div>
            : (
              <div className="flex flex-col gap-6">
                {/* Limit selector */}
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-text-muted">Show:</span>
                  <select
                    value={h2hLimit}
                    onChange={(e) => setH2hLimit(Number(e.target.value))}
                    className="text-xs bg-surface-muted text-text-primary border border-border rounded-md px-2 py-1 outline-none cursor-pointer"
                  >
                    {[6, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                {/* Block 1: Head to Head */}
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">
                    Head to Head
                    {h2h.h2h.length > 0 && <span className="text-xs text-text-muted font-normal ml-2">({h2h.h2h.length} matches)</span>}
                  </h3>
                  <MatchTable matches={h2h.h2h.slice(0, h2hLimit)} refTeam={info.hnm} navigate={navigate} />
                </section>

                {/* Block 2: Home team fixtures */}
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">{info.hnm}</h3>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex bg-surface-muted rounded-md p-0.5 w-fit">
                      {[
                        { key: "recent" as const, label: `Finished (${h2h.home.recent.length})` },
                        { key: "upcoming" as const, label: `Upcoming (${h2h.home.upcoming.length})` },
                      ].map(o => (
                        <button
                          key={o.key}
                          onClick={() => setTeamTab(prev => ({ ...prev, home: o.key }))}
                          className={`text-xs px-3 py-1 rounded cursor-pointer transition-all whitespace-nowrap
                            ${teamTab.home === o.key
                              ? "bg-accent text-white font-semibold"
                              : "text-text-muted hover:text-text-primary"
                            }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <MatchTable
                    matches={h2h.home[teamTab.home].slice(0, h2hLimit)}
                    refTeam={info.hnm}
                    navigate={navigate}
                  />
                </section>

                {/* Block 3: Away team fixtures */}
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">{info.anm}</h3>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex bg-surface-muted rounded-md p-0.5 w-fit">
                      {[
                        { key: "recent" as const, label: `Finished (${h2h.away.recent.length})` },
                        { key: "upcoming" as const, label: `Upcoming (${h2h.away.upcoming.length})` },
                      ].map(o => (
                        <button
                          key={o.key}
                          onClick={() => setTeamTab(prev => ({ ...prev, away: o.key }))}
                          className={`text-xs px-3 py-1 rounded cursor-pointer transition-all whitespace-nowrap
                            ${teamTab.away === o.key
                              ? "bg-accent text-white font-semibold"
                              : "text-text-muted hover:text-text-primary"
                            }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <MatchTable
                    matches={h2h.away[teamTab.away].slice(0, h2hLimit)}
                    refTeam={info.anm}
                    navigate={navigate}
                  />
                </section>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
