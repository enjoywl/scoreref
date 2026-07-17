import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useI18n } from "../locales";
import { api } from "../lib/api";
import { matchSlug } from "../lib/slug";
import { useTimezone, formatKickoffTime, formatDateShort } from "../lib/timezone";
import { TeamAvatar, LeagueAvatar } from "../components/Avatar";
import DrawPitch from "../components/DrawPitch";

/* ---- Types ---- */
interface MatchInfo {
  mid: string; tnm: string; sts: number; sc: number; cps?: number;
  ij1?: number; ij2?: number; ij3?: number; ij4?: number;
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

interface LineupPlayer { nm: string; sn: string; sh: number; pos: string; sub: boolean; cap?: boolean; pid?: number; age?: number; }

interface StatItem { k: string; nm: string; hn: number; an: number; hv: string; av: string; rt: number; }

interface H2hMatch {
  mid: string; hnm: string; anm: string; hsc: number; asc: number;
  hs1: number; as1: number; hnt: number; ant: number;
  sts: number; st: string; sc: number; snm: string; tnm: string;
  rnm: string; wnr: number;
  hid?: number; aid?: number; tid?: number;
}

/* ---- Helpers ---- */
function getPlayerName(ev: Incident): string {
  return ev.pnm || ev.pin || ev.pon || "";
}

function MatchTimeText({ time, sc }: { time: string; sc: number }) {
  if (time.endsWith("'") && sc >= 1 && sc < 100 && sc !== 31 && sc !== 32 && sc !== 33 && sc !== 34) {
    const numberPart = time.slice(0, -1);
    return <>{numberPart}<span className="animate-blink">'</span></>;
  }
  return <>{time}</>;
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

/* ---- Match table (shared by H2H / team fixtures) ---- */
function MatchTable({ matches, refTeam, navigate, timezone, t }: {
  matches: H2hMatch[];
  refTeam: string;
  navigate: (path: string) => void;
  timezone: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const headers = ["h2h.date", "h2h.tournament", "h2h.home", "h2h.score", "h2h.away", "h2h.season", "h2h.result"];
  if (!matches.length) return <div className="text-center py-8 text-text-muted text-sm">{t("empty.noMatches")}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} className="sticky top-0 py-2 px-2.5 text-[11px] font-semibold text-text-muted text-left whitespace-nowrap border-b-2 border-border bg-surface">{t(h)}</th>
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
                <td className="py-2.5 px-3 text-xs text-text-muted border-b border-border-subtle max-w-[140px] truncate">
                  <span className="flex items-center gap-1.5">
                    <LeagueAvatar id={ev.tid} name={ev.tnm || ""} className="w-[16px] h-[16px] object-contain rounded shrink-0" />
                    {ev.tnm || "-"}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center font-semibold text-text-primary border-b border-border-subtle">
                  <span className="flex items-center justify-center gap-1.5">
                    <TeamAvatar id={ev.hid} name={ev.hnm || ""} className="w-5 h-5 object-contain rounded-full shrink-0" />
                    {ev.hnm || "-"}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center border-b border-border-subtle">
                  {ev.hsc != null && ev.asc != null ? (
                    <>
                      <span className="font-bold text-text-primary tabular-nums text-sm">{ev.hsc} - {ev.asc}</span>
                      {(ev.hs1 != null || ev.as1 != null) && (
                        <span className="text-[11px] text-text-muted ml-1">({ev.hs1 ?? 0} - {ev.as1 ?? 0})</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-text-muted">{t("h2h.vs")}</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center font-semibold text-text-primary border-b border-border-subtle">
                  <span className="flex items-center justify-center gap-1.5">
                    <TeamAvatar id={ev.aid} name={ev.anm || ""} className="w-5 h-5 object-contain rounded-full shrink-0" />
                    {ev.anm || "-"}
                  </span>
                </td>
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
    fetchJSON(`/v1/api/match/${mid}/lineups`).then(d => {
      setFetched(f => ({ ...f, lineups: true }));
      if (d) {
        setLineups({
          home: (d.hm?.pl || []).map((p: Record<string, unknown>) => ({ nm: p.nm, sn: p.sn, sh: p.sh, pos: p.pos, sub: p.sub, cap: p.cap, pid: (p.pid ?? p.id) as number | undefined, age: p.age } as LineupPlayer)),
          away: (d.aw?.pl || []).map((p: Record<string, unknown>) => ({ nm: p.nm, sn: p.sn, sh: p.sh, pos: p.pos, sub: p.sub, cap: p.cap, pid: (p.pid ?? p.id) as number | undefined, age: p.age } as LineupPlayer)),
          hform: d.hm?.fm || "", aform: d.aw?.fm || "",
        });
      }
    });
  }

  // Lazy-load h2h when tab selected
  function loadH2h() {
    if (!mid || fetched.h2h) return;
    fetchJSON(`/v1/api/match/${mid}/h2h`).then(d => {
      setFetched(f => ({ ...f, h2h: true }));
      if (d) setH2h({ h2h: d.h2h || [], home: d.home || { recent: [], upcoming: [] }, away: d.away || { recent: [], upcoming: [] } });
    });
  }

  useEffect(() => {
    if (mid) loadMatchData(mid);
  }, [mid, loadMatchData]);

  // Auto-switch to lineups tab for not-started matches
  useEffect(() => {
    if (info?.sc === 0 && activeTab !== "lineups" && activeTab !== "h2h") {
      setActiveTab("lineups");
    }
    if (info?.sc === 0 && activeTab === "lineups") {
      loadLineups();
    }
  }, [info?.sc, activeTab]);

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
    const sc = info.sc;
    const nowSec = Math.floor(Date.now() / 1000);

    // Not started
    if (sc === 0) return "";

    // Postponed / Delayed
    if (sc === 60) return t("match.postponed");
    if (sc === 61) return t("match.delayed");

    // Canceled / Abandoned
    if (sc === 70) return t("match.canceled");
    if (sc === 90) return t("match.abandoned");
    if (sc === 91) return t("match.walkover");
    if (sc === 92) return t("match.retired");
    if (sc === 93) return t("match.removed");
    if (sc === 97 || sc === 98) return t("match.defaulted");

    // Breaks
    if (sc === 31) return t("match.ht");
    if (sc === 33) return t("match.et_ht");
    if (sc === 32) return t("match.awaiting_et");
    if (sc === 34) return t("match.awaiting_penalties");
    if (sc === 50) return t("match.penalties");

    // Finished
    if (sc >= 100 && sc < 110) return t("match.ft");
    if (sc === 110) return t("match.aet");
    if (sc === 120) return t("match.ap");

    // Live — compute clock from cps (current period start)
    if (sc >= 1 && sc < 100) {
      const elapsed = info.cps ? Math.max(0, Math.floor((nowSec - info.cps) / 60)) : 0;

      // 1st half
      if (sc === 6) {
        if (elapsed <= 45) return elapsed + "'";
        return "45+" + (elapsed - 45) + "'";
      }
      // 2nd half
      if (sc === 7) {
        const total = 45 + elapsed;
        if (total <= 90) return total + "'";
        return "90+" + (total - 90) + "'";
      }
      // 1st extra
      if (sc === 41) {
        const total = 90 + elapsed;
        if (total <= 105) return total + "'";
        return "105+" + (total - 105) + "'";
      }
      // 2nd extra
      if (sc === 42) {
        const total = 105 + elapsed;
        if (total <= 120) return total + "'";
        return "120+" + (total - 120) + "'";
      }
      // Fallback for other live states
      return elapsed + "'";
    }

    return info.sd || info.st || "";
  }, [info, t]);

  const allStats = useMemo(() => stats.find(s => s.pr === "ALL") || stats[0], [stats]);

  const isLive = (() => {
    const sc = info?.sc;
    if (sc == null) return false;
    if (sc <= 0) return false;
    if (sc >= 100) return false;
    // Exclude breaks, awaiting states, penalties (no running clock)
    if ([31, 32, 33, 34, 50].includes(sc)) return false;
    // Exclude postponed/delayed
    if (sc === 60 || sc === 61) return false;
    // Exclude canceled/abandoned
    if (sc === 70 || (sc >= 90 && sc <= 98)) return false;
    // Interrupted/suspended still count as live
    return true;
  })();
  const isHT = info?.sc === 31 || info?.sc === 33;
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
      {!loading && !info && <div className="text-center py-16 text-[#e53935]">{t("empty.failedToLoad")}</div>}

      {/* Content */}
      {info && (
        <>
          <Helmet>
            <title>{info.hnm} vs {info.anm} — ScoreRef</title>
            <meta name="description" content={`${info.hnm} vs ${info.anm} — ${(info.tnm)}. Live score, match stats, incidents, lineups and H2H history.`} />
            <meta property="og:title" content={`${info.hnm} vs ${info.anm} — ScoreRef`} />
            <meta property="og:description" content={`${(info.tnm)} — ${info.hnm} ${info.hsc} - ${info.asc} ${info.anm}`} />
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
                {t("matchInfo.back")}
              </button>
              <span className="flex-1 text-center text-[13px] text-text-secondary font-medium flex items-center justify-center gap-1.5">
                <LeagueAvatar id={info.tid} name={(info.tnm)} className="w-[18px] h-[18px] object-contain rounded shrink-0" />
                {(info.tnm)}
              </span>
              {info.rnm && <span className="text-xs text-text-muted shrink-0">{info.rnm}</span>}
            </div>

            {/* Teams + score */}
            <div className="flex items-center justify-between gap-3 sm:gap-5 mb-5">
              <div className="flex-1 flex flex-col items-center gap-2 sm:gap-2.5 text-center min-w-0">
                <div className="w-[56px] h-[56px] sm:w-[72px] sm:h-[72px] rounded-full bg-[#f5f5f5] dark:bg-white/5 border-2 border-[#e8e8e8] dark:border-white/10 flex items-center justify-center">
                  <TeamAvatar id={info.hid} name={info.hnm} className="w-[40px] h-[40px] sm:w-[52px] sm:h-[52px] object-contain" textClass="text-[14px] sm:text-[18px]" />
                </div>
                <span className="text-[13px] sm:text-[15px] font-bold text-text-primary max-w-[100px] sm:max-w-[180px] truncate">{info.hnm}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 sm:gap-1 shrink-0">
                <span className="text-[32px] sm:text-[42px] font-black text-text-primary tracking-[2px] sm:tracking-[3px] tabular-nums leading-none">{info.hsc} - {info.asc}</span>
                {info.sc >= 31 && <span className="text-xs sm:text-sm text-text-muted dark:text-white/40">({info.hs1} - {info.as1})</span>}
                <span className={`text-xs sm:text-sm font-bold mt-0.5 sm:mt-1 px-2.5 sm:px-3.5 py-0.5 rounded-xl
                  ${isLive ? "text-[#e53935]" : ""}
                  ${isHT ? "text-white bg-[#e6a23c]" : ""}
                  ${info.sc >= 100 ? "text-text-muted bg-surface-alt" : ""}`}
                >
                  <MatchTimeText time={matchTime} sc={info.sc} />
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-2 sm:gap-2.5 text-center min-w-0">
                <div className="w-[56px] h-[56px] sm:w-[72px] sm:h-[72px] rounded-full bg-[#f5f5f5] dark:bg-white/5 border-2 border-[#e8e8e8] dark:border-white/10 flex items-center justify-center">
                  <TeamAvatar id={info.aid} name={info.anm} className="w-[40px] h-[40px] sm:w-[52px] sm:h-[52px] object-contain" textClass="text-[14px] sm:text-[18px]" />
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
              <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">{t("matchInfo.ref")} {info.rfn || "-"}</span>
            </div>
          </div>

          {/* Match info grid — always visible */}
          {info && (
            <section className="mb-5">
              <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">{t("matchInfo.title")}</h3>
              <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden">
                {[
                  [t("matchInfo.status"), info.sd || info.st || "-"],
                  [t("matchInfo.round"), info.rnm || "-"],
                  [t("matchInfo.season"), info.snm || "-"],
                  [t("matchInfo.referee"), info.rfn || "-"],
                  ...(info.grp ? [[t("matchInfo.group"), info.grp]] : []),
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
              {(info.sc === 0
                ? [
                    { key: "lineups", label: t("tab.lineups") },
                    { key: "h2h", label: t("tab.h2h") },
                  ]
                : [
                    { key: "incidents", label: t("tab.incidents") },
                    { key: "stats", label: t("tab.stats") },
                    { key: "commentary", label: t("tab.commentary") },
                    { key: "lineups", label: t("tab.lineups") },
                    { key: "h2h", label: t("tab.h2h") },
                  ]
              ).map(tab => (
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
              <div className="flex flex-col gap-5">
                {allStats.gr.map((g: { gn: string; si: StatItem[] }) => {
                  const groupKey = `statGroups.${g.gn}`;
                  const groupNameT = t(groupKey);
                  const groupName = groupNameT !== groupKey ? groupNameT : g.gn;
                  return (
                  <div key={g.gn}>
                    <div className="text-xs text-accent font-semibold mb-2 uppercase tracking-wide">{groupName}</div>
                    {g.si.map((it: StatItem) => {
                      const max = Math.max(it.hn, it.an);
                      const hPct = max ? Math.round((it.hn / max) * 100) : 0;
                      const aPct = max ? Math.round((it.an / max) * 100) : 0;
                      const statKey = `stats.${it.k}`;
                      const statNameT = t(statKey);
                      const displayName = statNameT !== statKey ? statNameT : it.nm;
                      return (
                        <div key={it.k || it.nm} className="flex items-center gap-2.5 py-1.5">
                          <span className="text-sm font-bold text-[#1565C0] dark:text-[#64b5f6] text-right min-w-[36px] tabular-nums">{it.hv}</span>
                          <div className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                            <span className="text-[11px] text-text-muted leading-tight text-center truncate max-w-full">{displayName}</span>
                            <div className="w-full h-1.5 bg-border-light rounded-sm flex gap-0.5 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-[#1565C0] to-[#42a5f5] rounded-sm ml-auto transition-[width] duration-600" style={{ width: hPct + "%" }} />
                              <div className="h-full bg-gradient-to-r from-[#ef5350] to-[#c62828] rounded-sm transition-[width] duration-600" style={{ width: aPct + "%" }} />
                            </div>
                          </div>
                          <span className="text-sm font-bold text-[#c62828] dark:text-[#ef5350] text-left min-w-[36px] tabular-nums">{it.av}</span>
                        </div>
                      );
                    })}
                  </div>
                );
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-text-muted">{t("empty.noStats")}</div>
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
                    <div key={idx} className="text-center text-[11px] text-[#e6a23c] font-semibold py-1">{t("incidents.injuryTime", { n: ev.ln ?? 0 })}</div>
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
                                  {ev.a1n && <span className="text-[11px] text-accent">{t("incidents.assist")} {ev.a1n}</span>}
                                </>
                              ) : ev.tp === "card" ? (
                                <>
                                  <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ev.cl === "red" ? "text-[#e53935] bg-[#e53935]/10 dark:bg-[#e53935]/10 bg-[#e53935]/15" : "text-[#f4c542] bg-[#f4c542]/10 dark:bg-[#f4c542]/10 bg-[#f4c542]/15"}`}>{ev.cl === "red" ? t("incidents.redCard") : t("incidents.yellowCard")}</span>
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
                                  {ev.a1n && <span className="text-[11px] text-accent">{t("incidents.assist")} {ev.a1n}</span>}
                                </>
                              ) : ev.tp === "card" ? (
                                <>
                                  <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ev.cl === "red" ? "text-[#e53935] bg-[#e53935]/10" : "text-[#f4c542] bg-[#f4c542]/10"}`}>{ev.cl === "red" ? t("incidents.redCard") : t("incidents.yellowCard")}</span>
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
              <div className="text-center py-16 text-text-muted">{t("empty.noIncidents")}</div>
            )
          )}

          {/* === COMMENTARY TAB === */}
          {activeTab === "commentary" && (
            !fetched.commentary ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => <div key={i} className="h-4 bg-skeleton-from rounded animate-pulse" />)}
              </div>
            ) : commentary.length > 0 ? (
              <div className="relative py-1 before:absolute before:left-[70px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                {commentary.map((c) => (
                  <div
                    key={c.sq}
                    className={`flex items-start gap-3 px-2 py-3 relative group rounded-xl transition-colors hover:bg-accent/3 ${c.ih ? "" : ""}`}
                  >
                    {/* Time badge */}
                    <span className="text-[11px] font-bold text-accent bg-accent/8 min-w-[54px] text-center shrink-0 mt-0.5 py-0.5 px-1.5 rounded-md tabular-nums">
                      {c.tp}
                    </span>

                    {/* Timeline dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 relative z-10 ring-2 ring-surface ${c.pnm ? "bg-accent" : "bg-border"}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {c.pnm && (
                        <span className="text-[13px] font-semibold text-text-primary">
                          {c.pnm}
                        </span>
                      )}
                      <p className={`text-[13px] leading-relaxed ${c.pnm ? "text-text-secondary mt-0.5" : "text-text-primary"}`}>
                        {c.tx}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-text-muted">{t("empty.noCommentary")}</div>
            )
          )}

          {/* === LINEUPS TAB === */}
          {activeTab === "lineups" && (
            !fetched.lineups ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            : !lineups ? <div className="text-center py-16 text-text-muted">{t("empty.noLineupData")}</div>
            : (
              <DrawPitch
                homePlayers={lineups.home}
                awayPlayers={lineups.away}
                homeFormation={lineups.hform}
                awayFormation={lineups.aform}
                homeName={info.hnm}
                awayName={info.anm}
                substitutes={
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[900px] mx-auto w-full">
                    {([info.hnm, info.anm] as const).map((teamName, ti) => {
                      const subs = (ti === 0 ? lineups.home : lineups.away).filter(p => p.sub);
                      const label = `${teamName} — ${t("lineups.substitutes")}`;
                      return (
                        <div key={ti}>
                          <div className="text-xs text-text-secondary font-semibold mb-2">{label}</div>
                          <div className="flex flex-col gap-1.5">
                            {subs.map(p => (
                              <div key={(ti === 0 ? "hs" : "as") + p.sh}
                                className="flex items-center gap-2.5 bg-surface rounded-lg px-3 py-2 border border-border-light">
                                {/* Photo */}
                                <div className="w-7 h-7 rounded-full bg-surface-alt flex items-center justify-center shrink-0 overflow-hidden">
                                  {p.pid ? (
                                    <img
                                      src={`/v1/image/player/${p.pid}.png`}
                                      alt={p.nm}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = "none";
                                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                                      }}
                                    />
                                  ) : null}
                                  <span className={`text-[10px] font-bold text-text-muted uppercase ${p.pid ? "hidden" : ""}`}>
                                    {p.sn}
                                  </span>
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-text-muted tabular-nums w-5 text-right shrink-0">#{p.sh}</span>
                                  <span className="text-[12px] font-medium text-text-primary truncate">{p.nm}</span>
                                </div>
                                {/* Position */}
                                <span className="text-[9px] font-semibold text-text-muted bg-surface-alt px-1.5 py-0.5 rounded shrink-0 uppercase">
                                  {typeof p.pos === "string" && p.pos ? p.pos : "-"}
                                </span>
                                {/* Age */}
                                {p.age != null && (
                                  <span className="text-[10px] text-text-muted shrink-0 w-6 text-right tabular-nums">{p.age}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                }
              />
            )
          )}

          {/* === H2H TAB === */}
          {activeTab === "h2h" && (
            !fetched.h2h ? <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
            : !h2h ? <div className="text-center py-16 text-text-muted">{t("empty.noH2hData")}</div>
            : (
              <div className="flex flex-col gap-6">
                {/* Block 1: Head to Head */}
                <section>
                  <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-border">
                    <h3 className="text-[15px] font-semibold text-text-secondary">
                      {t("h2h.headToHead")}
                      {h2h.h2h.length > 0 && <span className="text-xs text-text-muted font-normal ml-2">({t("h2h.matches", { n: h2h.h2h.length })})</span>}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">{t("h2h.show")}</span>
                      <select value={h2hLimit} onChange={(e) => setH2hLimit(Number(e.target.value))}
                        className="text-xs bg-surface-muted text-text-primary border border-border rounded-md px-2 py-1 outline-none cursor-pointer">
                        {[6, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <MatchTable matches={h2h.h2h.slice(0, h2hLimit)} refTeam={info.hnm} navigate={navigate} timezone={timezone} t={t} />
                </section>

                {/* Block 2: Home team fixtures */}
                <section>
                  <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-border">
                    <h3 className="text-[15px] font-semibold text-text-secondary">{info.hnm}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">{t("h2h.show")}</span>
                      <select value={h2hLimit} onChange={(e) => setH2hLimit(Number(e.target.value))}
                        className="text-xs bg-surface-muted text-text-primary border border-border rounded-md px-2 py-1 outline-none cursor-pointer">
                        {[6, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex bg-surface-muted rounded-md p-0.5 w-fit">
                      {[
                        { key: "recent" as const, label: `${t("h2h.finished")} (${h2h.home.recent.length})` },
                        { key: "upcoming" as const, label: `${t("h2h.upcoming")} (${h2h.home.upcoming.length})` },
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
                    timezone={timezone}
                    t={t}
                  />
                </section>

                {/* Block 3: Away team fixtures */}
                <section>
                  <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-border">
                    <h3 className="text-[15px] font-semibold text-text-secondary">{info.anm}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">{t("h2h.show")}</span>
                      <select value={h2hLimit} onChange={(e) => setH2hLimit(Number(e.target.value))}
                        className="text-xs bg-surface-muted text-text-primary border border-border rounded-md px-2 py-1 outline-none cursor-pointer">
                        {[6, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex bg-surface-muted rounded-md p-0.5 w-fit">
                      {[
                        { key: "recent" as const, label: `${t("h2h.finished")} (${h2h.away.recent.length})` },
                        { key: "upcoming" as const, label: `${t("h2h.upcoming")} (${h2h.away.upcoming.length})` },
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
                    timezone={timezone}
                    t={t}
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
