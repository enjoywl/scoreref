import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useI18n } from "../locales";
import { doClient } from "../lib/doClient";

/* ---- Types ---- */
interface MatchInfo {
  mid: string; lnam: string; lpc: string; mtim: number; stat: number;
  hnam: string; anam: string; hscr: number; ascr: number;
  hhsc: number; ahsc: number; hred: number; ared: number;
  hyel: number; ayel: number; hcor: number; acor: number;
  hrnk: string; arnk: string; seas: string; round: string;
  locn: string; weat: string; temp: string;
  hmgr: string; amgr: string; rfee: string;
  hpc: string; apc: string;
}

interface IncidentPlayer { na: string; sna: string; pos: string; jn: string; }

interface Incident {
  id: number; time: number; text: string; pnam: string; intp: string;
  hscr: number; ascr: number; incl: string; ihom: boolean; prd: string;
  adtm: number; reas: string; desc: string; conf: boolean;
  player: IncidentPlayer | null;
  plin: IncidentPlayer | null;
  plot: IncidentPlayer | null;
  ast1: IncidentPlayer | null;
  leng: number; resc: boolean;
}

interface CommentaryItem { text: string; type: string; ishm: boolean; seq: number; plyr?: { na: string }; }

interface LineupPlayer { player: { na: string }; shnm: number; posi: string; subs: boolean; capt: boolean; }

interface PositionedPlayer extends LineupPlayer { _x: number; _y: number; }

interface StatItem { key: string; name: string; home: string; away: string; homeValue: number; awayValue: number; renderType: number; }

interface H2hEvent {
  htea: { name: string; slug: string }; atea: { name: string; slug: string };
  hscr: { current: number; display: number; period1: number; period2: number; normaltime: number };
  ascr: { current: number; display: number; period1: number; period2: number; normaltime: number };
  tour: { name: string }; seas: { name: string };
  stat: { code: number; description: string; type: string };
  stms: number; rndi: { name: string; round: number } | null;
  wncd: number; id: number;
}

/* ---- Helpers ---- */
function getPlayerName(ev: Incident): string {
  return ev.pnam || ev.player?.na || ev.plin?.na || ev.plot?.na || "";
}

function getIncidentIcon(intp: string, incl?: string) {
  const t = (intp || "").toLowerCase();
  if (t === "period") return { icon: "", cls: "period" };
  if (t === "injurytime") return { icon: "", cls: "injury" };
  if (t === "card" && incl === "red") return { icon: "\u25AE", cls: "red" };
  if (t === "card" && incl === "yellow") return { icon: "\u25AE", cls: "yellow" };
  if (t === "goal" && incl === "own") return { icon: "\u26BD", cls: "own" };
  if (t === "goal" && incl === "penalty") return { icon: "\u26BD", cls: "penalty" };
  if (t === "goal") return { icon: "\u26BD", cls: "goal" };
  if (t === "substitution") return { icon: "\u2194", cls: "sub" };
  if (t === "vardecision") return { icon: "\u25B7", cls: "var" };
  if (t === "ingamepenalty" && incl === "missed") return { icon: "\u2715", cls: "miss" };
  if (t === "ingamepenalty" && incl === "scored") return { icon: "\u26BD", cls: "penalty" };
  if (t === "ingamepenalty") return { icon: "\u26BD", cls: "penalty" };
  return { icon: "\u25CF", cls: "other" };
}

function getPositionedPlayers(players: LineupPlayer[], side: "home" | "away"): PositionedPlayer[] {
  const field = players.filter(p => !p.subs);
  const rows: Record<number, LineupPlayer[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const p of field) {
    const ch = (p.posi || "").toUpperCase().charAt(0);
    let row = 2;
    if (ch === "G") row = 0;
    else if (ch === "D") row = 1;
    else if (ch === "M") row = 2;
    else if (ch === "F" || ch === "S") row = 3;
    rows[row].push(p);
  }
  for (const row of Object.values(rows)) {
    row.sort((a, b) => {
      const pa = (a.posi || "").toUpperCase();
      const pb = (b.posi || "").toUpperCase();
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
  return players.filter(p => p.subs);
}

/* ---- Component ---- */
export default function MatchDetail() {
  const { t } = useI18n();
  const { mid } = useParams<{ mid: string }>();
  const navigate = useNavigate();

  const [info, setInfo] = useState<MatchInfo | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [commentary, setCommentary] = useState<CommentaryItem[]>([]);
  const [lineups, setLineups] = useState<{ home: LineupPlayer[]; away: LineupPlayer[]; hform: string; aform: string } | null>(null);
  const [stats, setStats] = useState<{ period: string; groups: { groupName: string; items: StatItem[] }[] }[]>([]);
  const [h2h, setH2h] = useState<H2hEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("live");
  // Track which data has been fetched (for lazy loading)
  const [fetched, setFetched] = useState({ commentary: false, stats: false, lineups: false, h2h: false });

  async function fetchJSON(url: string) {
    const res = await fetch(url);
    const json = await res.json();
    return json.code === 200 ? json.data : null;
  }

  const loadMatchData = useCallback(async (matchId: string) => {
    setActiveTab("live");
    setFetched({ commentary: false, stats: false, lineups: false, h2h: false });
    setCommentary([]);
    setStats([]);
    setLineups(null);
    setH2h([]);

    // Try DO first (instant from memory or IndexedDB)
    const doDetail = doClient.getDetail(matchId);
    if (doDetail) {
      setInfo(doDetail.info);
      setIncidents(doDetail.incidents);
      setLoading(false);
    } else {
      // Request from DO (WebSocket) or HTTP fallback
      doClient.requestDetail(matchId);
      // Also start HTTP as parallel fallback
      setLoading(true);
      const data = await fetchJSON(`/api/match/${matchId}/full`);
      if (data) {
        if (data.info) setInfo(data.info);
        if (data.incidents) setIncidents(data.incidents);
      }
      setLoading(false);
    }

    // Load commentary + stats in background (needed for Live tab)
    fetchJSON(`/api/match/${matchId}/livetext`).then(d => {
      if (d) setCommentary(d.cms || []);
      setFetched(f => ({ ...f, commentary: true }));
    });
    fetchJSON(`/api/match/${matchId}/stats`).then(d => {
      if (d) {
        setStats((d.statistics || []).map((p: any) => ({
          period: p.period,
          groups: (p.groups || []).map((g: any) => ({
            groupName: g.groupName,
            items: g.statisticsItems || [],
          })),
        })));
      }
      setFetched(f => ({ ...f, stats: true }));
    });
  }, []);

  // Lazy-load lineups when tab selected
  function loadLineups() {
    if (!mid || fetched.lineups || lineups !== null) return;
    setFetched(f => ({ ...f, lineups: true }));
    fetchJSON(`/api/match/${mid}/lineups`).then(d => {
      if (d) {
        setLineups({
          home: (d.home?.plrs || []).map((p: any) => ({ player: p.player, shnm: p.shnm, posi: p.posi, subs: p.subs, capt: p.capt })),
          away: (d.away?.plrs || []).map((p: any) => ({ player: p.player, shnm: p.shnm, posi: p.posi, subs: p.subs, capt: p.capt })),
          hform: d.home?.form || "", aform: d.away?.form || "",
        });
      }
    });
  }

  // Lazy-load h2h when tab selected
  function loadH2h() {
    if (!mid || fetched.h2h) return;
    setFetched(f => ({ ...f, h2h: true }));
    fetchJSON(`/api/match/${mid}/h2h`).then(d => {
      if (d) setH2h((d.evts || []).sort((a: any, b: any) => (b.stms || 0) - (a.stms || 0)));
    });
  }

  useEffect(() => {
    if (mid) loadMatchData(mid);
  }, [mid, loadMatchData]);

  // Connect to DO and subscribe to live updates for this match
  useEffect(() => {
    doClient.start();
  }, []);

  useEffect(() => {
    if (!mid) return;
    const unsub = doClient.subscribe((state) => {
      const detail = state.details[mid];
      if (detail) {
        setInfo((prev) => {
          // Only update if scores or stat changed (avoid flicker on identical data)
          if (!prev || prev.hscr !== detail.info.hscr || prev.ascr !== detail.info.ascr || prev.stat !== detail.info.stat) {
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
    if (info.stat === 1) {
      const elapsed = Math.floor((Date.now() - info.mtim * 1000) / 60000);
      return Math.max(0, elapsed) + "'";
    }
    if (info.stat === 2) return t("match.ht");
    if (info.stat === 3) return t("match.ft");
    return "";
  }, [info, t]);

  const allStats = useMemo(() => stats.find(s => s.period === "ALL") || stats[0], [stats]);

  const heroGradient = info?.stat === 1
    ? "bg-gradient-to-br from-[#0d47a1]/35 via-[#1565C0]/15 to-[#0d47a1]/35 border-[#4fc3f7]/25"
    : info?.stat === 2
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
          {/* Hero */}
          <div className={`mb-5 p-5 md:p-6 rounded-2xl border relative overflow-hidden before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] ${heroGradient}
            ${info.stat === 1 ? "before:bg-gradient-to-r before:from-[#1565C0] before:via-[#4fc3f7] before:to-[#1565C0]" : ""}
            ${info.stat === 2 ? "before:bg-gradient-to-r before:from-[#b8860b] before:via-[#e6a23c] before:to-[#b8860b]" : ""}
            ${info.stat === 3 ? "before:bg-[#444]" : ""}`}
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
                {info.lpc && <img src={info.lpc} alt="" className="w-[18px] h-[18px] object-contain rounded" />}
                {info.lnam}
              </span>
              {info.round && <span className="text-xs text-text-muted shrink-0">{info.round}</span>}
            </div>

            {/* Teams + score */}
            <div className="flex items-center justify-between gap-3 sm:gap-5 mb-5">
              <div className="flex-1 flex flex-col items-center gap-2 sm:gap-2.5 text-center min-w-0">
                <div className="w-[56px] h-[56px] sm:w-[72px] sm:h-[72px] rounded-full bg-[#f5f5f5] dark:bg-white/5 border-2 border-[#e8e8e8] dark:border-white/10 flex items-center justify-center">
                  <img src={info.hpc} alt={info.hnam} className="w-[40px] h-[40px] sm:w-[52px] sm:h-[52px] object-contain" />
                </div>
                <span className="text-[13px] sm:text-[15px] font-bold text-text-primary max-w-[100px] sm:max-w-[180px] truncate">{info.hnam}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 sm:gap-1 shrink-0">
                <span className="text-[32px] sm:text-[42px] font-black text-text-primary tracking-[2px] sm:tracking-[3px] tabular-nums leading-none">{info.hscr} - {info.ascr}</span>
                {info.stat >= 2 && <span className="text-xs sm:text-sm text-text-muted dark:text-white/40">({info.hhsc} - {info.ahsc})</span>}
                <span className={`text-xs sm:text-sm font-bold mt-0.5 sm:mt-1 px-2.5 sm:px-3.5 py-0.5 rounded-xl
                  ${info.stat === 1 ? "text-white bg-accent animate-pulse-ring" : ""}
                  ${info.stat === 2 ? "text-white bg-[#e6a23c]" : ""}
                  ${info.stat >= 3 ? "text-text-muted bg-surface-alt" : ""}`}
                >
                  {matchTime}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-2 sm:gap-2.5 text-center min-w-0">
                <div className="w-[56px] h-[56px] sm:w-[72px] sm:h-[72px] rounded-full bg-[#f5f5f5] dark:bg-white/5 border-2 border-[#e8e8e8] dark:border-white/10 flex items-center justify-center">
                  <img src={info.apc} alt={info.anam} className="w-[40px] h-[40px] sm:w-[52px] sm:h-[52px] object-contain" />
                </div>
                <span className="text-[13px] sm:text-[15px] font-bold text-text-primary max-w-[100px] sm:max-w-[180px] truncate">{info.anam}</span>
              </div>
            </div>

            {/* Info strip chips */}
            <div className="flex justify-center items-center gap-2 flex-wrap pt-4 border-t border-[#eee] dark:border-white/8">
              {info.seas && <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">{info.seas}</span>}
              <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">
                {new Date(info.mtim * 1000).getHours().toString().padStart(2, "0") + ":" + new Date(info.mtim * 1000).getMinutes().toString().padStart(2, "0")}
              </span>
              {info.locn && <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">{info.locn}</span>}
              {info.weat && <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">{info.weat} {info.temp}</span>}
              <span className="text-xs text-text-secondary bg-[#f0f0f0] dark:bg-white/5 px-3 py-1 rounded-xl">Ref: {info.rfee || "-"}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-border mb-5">
            <div className="flex gap-0 -mb-px">
              {[
                { key: "live", label: "Live" },
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
                  className={`text-[13px] px-4 py-2.5 font-medium transition-colors cursor-pointer border-b-2
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

          {/* === LIVE TAB === */}
          {activeTab === "live" && (
            <div className="flex flex-col gap-5">
              {/* Match info grid */}
              {info && (
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">Match Info</h3>
                  <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden">
                    {[
                      ["Red Cards", `${info.hred} - ${info.ared}`],
                      ["Yellow Cards", `${info.hyel} - ${info.ayel}`],
                      ["Corners", `${info.hcor} - ${info.acor}`],
                      ["Ranking", `${info.hrnk || "-"} / ${info.arnk || "-"}`],
                      ...(info.hmgr || info.amgr ? [["Managers", `${info.hmgr || "-"} / ${info.amgr || "-"}`]] : []),
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between py-2.5 px-3.5 bg-surface text-[13px] text-text-primary">
                        <span className="text-[12px] text-text-muted">{label}</span>
                        <span>{val}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Stats */}
              {!fetched.stats ? (
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">Stats</h3>
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-5 bg-skeleton-from rounded animate-pulse" />)}
                  </div>
                </section>
              ) : allStats && (
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">Stats</h3>
                  <div className="flex flex-col gap-4">
                    {allStats.groups.map(g => (
                      <div key={g.groupName}>
                        <div className="text-xs text-accent font-semibold mb-2 uppercase tracking-wide">{g.groupName}</div>
                        {g.items.map(it => {
                          const max = Math.max(it.homeValue, it.awayValue);
                          const hPct = max ? Math.round((it.homeValue / max) * 100) : 0;
                          const aPct = max ? Math.round((it.awayValue / max) * 100) : 0;
                          return (
                            <div key={it.key || it.name} className="flex items-center gap-2.5 py-1">
                              <span className="text-sm font-bold text-[#1565C0] dark:text-[#64b5f6] text-right min-w-[30px] tabular-nums">{it.home}</span>
                              <div className="flex-1 h-1.5 bg-border-light rounded-sm flex gap-0.5 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-[#1565C0] to-[#42a5f5] rounded-sm ml-auto transition-[width] duration-600" style={{ width: hPct + "%" }} />
                                <div className="h-full bg-gradient-to-r from-[#ef5350] to-[#c62828] rounded-sm transition-[width] duration-600" style={{ width: aPct + "%" }} />
                              </div>
                              <span className="text-sm font-bold text-[#c62828] dark:text-[#ef5350] text-left min-w-[30px] tabular-nums">{it.away}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Incidents timeline */}
              {incidents.length > 0 && (
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">Incidents</h3>
                  <div className="relative py-3 before:absolute before:left-1/2 before:top-0 before:bottom-0 before:w-0.5 before:bg-border before:-translate-x-1/2">
                    {incidents.map((ev, idx) => {
                      if (ev.intp === "period") return (
                        <div key={idx} className="flex justify-center items-center gap-3 py-2.5 my-1">
                          <span className="text-[13px] font-bold text-accent bg-accent/10 px-3.5 py-1 rounded-xl">{ev.text}</span>
                          {ev.hscr != null && <span className="text-sm font-bold text-text-primary">{ev.hscr} - {ev.ascr}</span>}
                        </div>
                      );
                      if (ev.intp === "injuryTime") return (
                        <div key={idx} className="text-center text-[11px] text-[#e6a23c] font-semibold py-1">+{ev.leng}&apos; added</div>
                      );
                      const ico = getIncidentIcon(ev.intp, ev.incl);
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
                      const barSideAway = ev.ihom ? "" : barSide;
                      const barSideHome = ev.ihom ? barSide.replace("border-l", "border-r") : "";
                      return (
                        <div key={idx} className="flex items-start mb-1">
                          {/* Home side */}
                          <div className="flex-1 flex flex-col items-end px-2 sm:px-5">
                            {ev.ihom === true && (
                              <div className={`flex items-center gap-2.5 py-2.5 px-3.5 bg-surface-elevated/85 backdrop-blur-lg border border-black/8 dark:border-white/8 rounded-[10px] max-w-[280px] relative border-l-3 ${barSideHome}`}>
                                {ico.icon && <span className="text-base shrink-0">{ico.icon}</span>}
                                <div className={`flex flex-col gap-0.5 text-right`}>
                                  {ev.intp === "goal" || ev.intp === "inGamePenalty" ? (
                                    <>
                                      <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                      {ev.ast1 && <span className="text-[11px] text-accent">A {ev.ast1.na}</span>}
                                      {ev.desc && <span className="text-[11px] text-text-muted">{ev.desc}</span>}
                                    </>
                                  ) : ev.intp === "card" ? (
                                    <>
                                      <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ev.incl === "red" ? "text-[#e53935] bg-[#e53935]/10 dark:bg-[#e53935]/10 bg-[#e53935]/15" : "text-[#f4c542] bg-[#f4c542]/10 dark:bg-[#f4c542]/10 bg-[#f4c542]/15"}`}>{ev.incl === "red" ? "Red Card" : "Yellow Card"}</span>
                                      {ev.reas && <span className="text-[11px] text-text-muted">{ev.reas}</span>}
                                    </>
                                  ) : ev.intp === "substitution" ? (
                                    <>
                                      <span className="text-[13px] text-[#4caf50] font-semibold">{ev.plin?.na}</span>
                                      <span className="text-[13px] text-[#e53935] line-through">{ev.plot?.na}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev) || ev.text}</span>
                                      {ev.desc && <span className="text-[11px] text-text-muted">{ev.desc}</span>}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Time marker */}
                          <div className="relative flex flex-col items-center min-w-[36px] py-1 z-10">
                            <div className={`w-3 h-3 rounded-full border-2 shrink-0 mt-1.5 ${dotColors[ico.cls] || dotColors.other}`} />
                            <span className="text-[11px] font-bold text-accent mt-1 tabular-nums">
                              {ev.adtm && ev.adtm < 900 ? ev.time + "+" + ev.adtm : ev.time}&apos;
                            </span>
                          </div>

                          {/* Away side */}
                          <div className="flex-1 flex flex-col items-start px-2 sm:px-5">
                            {ev.ihom === false && (
                              <div className={`flex items-center gap-2.5 py-2.5 px-3.5 bg-surface-elevated/85 backdrop-blur-lg border border-black/8 dark:border-white/8 rounded-[10px] max-w-[280px] relative ${barSideAway}`}>
                                <div className="flex flex-col gap-0.5 text-left">
                                  {ev.intp === "goal" || ev.intp === "inGamePenalty" ? (
                                    <>
                                      <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                      {ev.ast1 && <span className="text-[11px] text-accent">A {ev.ast1.na}</span>}
                                      {ev.desc && <span className="text-[11px] text-text-muted">{ev.desc}</span>}
                                    </>
                                  ) : ev.intp === "card" ? (
                                    <>
                                      <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev)}</span>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ev.incl === "red" ? "text-[#e53935] bg-[#e53935]/10" : "text-[#f4c542] bg-[#f4c542]/10"}`}>{ev.incl === "red" ? "Red Card" : "Yellow Card"}</span>
                                      {ev.reas && <span className="text-[11px] text-text-muted">{ev.reas}</span>}
                                    </>
                                  ) : ev.intp === "substitution" ? (
                                    <>
                                      <span className="text-[13px] text-[#4caf50] font-semibold">{ev.plin?.na}</span>
                                      <span className="text-[13px] text-[#e53935] line-through">{ev.plot?.na}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[13px] font-semibold text-text-primary">{getPlayerName(ev) || ev.text}</span>
                                      {ev.desc && <span className="text-[11px] text-text-muted">{ev.desc}</span>}
                                    </>
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
                </section>
              )}

              {/* Commentary */}
              {!fetched.commentary ? (
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">Commentary</h3>
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-4 bg-skeleton-from rounded animate-pulse" />)}
                  </div>
                </section>
              ) : commentary.length > 0 && (
                <section>
                  <h3 className="text-[15px] font-semibold text-text-secondary mb-3 pb-1.5 border-b border-border">Commentary</h3>
                  {commentary.map(c => (
                    <div key={c.seq} className="flex items-start gap-2.5 py-1.5 border-b border-border-subtle text-[13px]">
                      <span className="text-[11px] text-text-muted min-w-[40px] shrink-0">{c.type}</span>
                      {c.plyr?.na && <span className="text-text-primary font-medium shrink-0">{c.plyr.na}</span>}
                      <span className="text-text-muted">{c.text}</span>
                    </div>
                  ))}
                </section>
              )}
            </div>
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
                    <span className="text-sm font-bold text-text-primary">{info.hnam}</span>
                    {lineups.hform && <span className="text-xs text-accent font-semibold bg-accent/10 px-2.5 py-0.5 rounded">{lineups.hform}</span>}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-text-primary">{info.anam}</span>
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
                      <g key={"hp" + p.shnm}>
                        <circle cx={p._x} cy={p._y} r="13" fill="#1565C0" stroke="#fff" strokeWidth="2" />
                        <text x={p._x} y={p._y + 1} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>{p.shnm}</text>
                        <text x={p._x} y={p._y + 26} textAnchor="middle" fontSize="7.5" fill="#fff" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>{p.player?.na?.split(" ").pop()}</text>
                        {p.capt && <polygon points={`${p._x - 10},${p._y - 4} ${p._x + 10},${p._y - 4} ${p._x},${p._y - 11}`} fill="#FFC107" />}
                      </g>
                    ))}
                    {getPositionedPlayers(lineups.away, "away").map(p => (
                      <g key={"ap" + p.shnm}>
                        <circle cx={p._x} cy={p._y} r="13" fill="#C62828" stroke="#fff" strokeWidth="2" />
                        <text x={p._x} y={p._y + 1} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>{p.shnm}</text>
                        <text x={p._x} y={p._y + 26} textAnchor="middle" fontSize="7.5" fill="#fff" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>{p.player?.na?.split(" ").pop()}</text>
                        {p.capt && <polygon points={`${p._x - 10},${p._y - 4} ${p._x + 10},${p._y - 4} ${p._x},${p._y - 11}`} fill="#FFC107" />}
                      </g>
                    ))}
                  </svg>
                </div>

                {/* Substitutes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-text-secondary font-semibold mb-1.5">{info.hnam} — Substitutes</div>
                    <div className="flex flex-wrap gap-1 p-2 bg-surface rounded-md">
                      {getSubstitutes(lineups.home).map(p => (
                        <span key={"hs" + p.shnm} className="text-[11px] text-text-muted px-2 py-0.5 bg-surface-alt rounded">{p.shnm} {p.player?.na}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-secondary font-semibold mb-1.5">{info.anam} — Substitutes</div>
                    <div className="flex flex-wrap gap-1 p-2 bg-surface rounded-md">
                      {getSubstitutes(lineups.away).map(p => (
                        <span key={"as" + p.shnm} className="text-[11px] text-text-muted px-2 py-0.5 bg-surface-alt rounded">{p.shnm} {p.player?.na}</span>
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
            : !h2h.length ? <div className="text-center py-16 text-text-muted">No H2H data available</div>
            : (
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
                    {h2h.map((ev, i) => {
                      // Determine W/D/L from current home team perspective
                      let resultEl = <span>-</span>;
                      if (ev.wncd != null && ev.stat?.type === "finished") {
                        const isHome = info.hnam === ev.htea?.name;
                        const wdl = isHome
                          ? (ev.wncd === 1 ? "W" : ev.wncd === 2 ? "D" : "L")
                          : (ev.wncd === 1 ? "L" : ev.wncd === 2 ? "D" : "W");
                        const colorMap: Record<string, string> = {
                          W: "text-[#4caf50] bg-[#4caf50]/10",
                          D: "text-[#f4c542] bg-[#f4c542]/10",
                          L: "text-[#e53935] bg-[#e53935]/10",
                        };
                        resultEl = <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${colorMap[wdl]}`}>{wdl}</span>;
                      }
                      return (
                        <tr
                          key={ev.id}
                          onClick={() => navigate(`/match/${ev.id}`)}
                          className={`cursor-pointer transition-all hover:bg-accent/4 dark:hover:bg-accent/8 active:scale-[0.995] ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                        >
                          <td className="py-2.5 px-3 text-xs text-text-secondary border-b border-border-subtle whitespace-nowrap rounded-l-md">
                            {ev.stms ? new Date(ev.stms * 1000).toLocaleDateString() : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-text-muted border-b border-border-subtle max-w-[140px] truncate">{ev.tour?.name || "-"}</td>
                          <td className="py-2.5 px-3 text-center font-semibold text-text-primary border-b border-border-subtle">{ev.htea?.name || "-"}</td>
                          <td className="py-2.5 px-3 text-center border-b border-border-subtle">
                            {ev.hscr?.current != null && ev.ascr?.current != null ? (
                              <>
                                <span className="font-bold text-text-primary tabular-nums text-sm">{ev.hscr.current} - {ev.ascr.current}</span>
                                {(ev.hscr.period1 != null || ev.ascr.period1 != null) && (
                                  <span className="text-[11px] text-text-muted ml-1">({ev.hscr.period1 ?? 0} - {ev.ascr.period1 ?? 0})</span>
                                )}
                              </>
                            ) : <span>-</span>}
                          </td>
                          <td className="py-2.5 px-3 text-center font-semibold text-text-primary border-b border-border-subtle">{ev.atea?.name || "-"}</td>
                          <td className="py-2.5 px-3 text-xs text-text-muted border-b border-border-subtle">{ev.seas?.name || "-"}</td>
                          <td className="py-2.5 px-3 text-center border-b border-border-subtle rounded-r-md">
                            {resultEl}
                            <span className="ml-1 text-accent text-base font-bold opacity-0 group-hover:opacity-100">&rsaquo;</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
