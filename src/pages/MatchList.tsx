import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useI18n } from "../locales";
import { api, type MatchListItem } from "../lib/api";
import { matchSlug } from "../lib/slug";
import { useTimezone, getDateFields, formatKickoffTime, formatDateISO } from "../lib/timezone";
import { TeamAvatar, LeagueAvatar } from "../components/Avatar";

function getWeekday(day: number, t: (k: string) => string) {
  return t("weekdays." + day);
}

function buildDateOptions(status: string, t: (k: string) => string, tz: string) {
  const dates: { text: string; sub: string; value: string; isToday: boolean }[] = [];
  const now = new Date();
  let start: number, end: number;
  if (status === "-1") {
    start = -14; end = 0;  // Finished: past 14 days + today
  } else if (status === "0") {
    start = 0; end = 14;   // Scheduled: today + next 14 days
  } else {
    start = 0; end = 0;     // Live: today only
  }
  for (let i = start; i <= end; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const fields = getDateFields(d, tz);
    dates.push({
      text: getWeekday(fields.weekday, t),
      sub: fields.month + "/" + fields.day,
      value: formatDateISO(d, tz),
      isToday: i === 0,
    });
  }
  return dates;
}

function formatKickoff(ts: number, tz: string) {
  return formatKickoffTime(ts, tz);
}

export default function MatchList() {
  const { t } = useI18n();
  const { timezone } = useTimezone();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leagueOpen, setLeagueOpen] = useState(false);
  const [leagueInput, setLeagueInput] = useState("");

  const today = useMemo(() => formatDateISO(new Date(), timezone), [timezone]);

  const groupBy = (searchParams.get("groupBy") as "league" | "country" | "time") || "league";
  const leagueFilter = searchParams.get("league") || "all";
  const statusFilter = searchParams.has("status") ? searchParams.get("status")! : "1";
  const dateOptions = useMemo(() => buildDateOptions(statusFilter, t, timezone), [statusFilter, t, timezone]);
  const selectedDate = statusFilter === "1" ? today : (searchParams.get("date") || today);

  function setGroupBy(val: "league" | "country" | "time") {
    setSearchParams(prev => { prev.set("groupBy", val); return prev; });
  }
  function setStatusFilter(val: string) {
    setSearchParams(prev => {
      prev.set("status", val);
      prev.delete("league");
      if (val === "1") prev.delete("date");
      else if (!prev.has("date")) prev.set("date", today);
      return prev;
    });
  }
  function setSelectedDate(val: string) {
    setSearchParams(prev => { if (val !== today) prev.set("date", val); else prev.delete("date"); return prev; });
  }
  function setLeagueFilter(val: string) {
    setSearchParams(prev => { if (val !== "all") prev.set("league", val); else prev.delete("league"); return prev; });
  }

  // Extract unique leagues from current matches, always include selected filter
  const leagues = useMemo(() => {
    const set = new Set<string>();
    matches.forEach(m => { if (m.tnm) set.add(m.tnm); });
    if (leagueFilter !== "all") set.add(leagueFilter);
    return Array.from(set).sort();
  }, [matches, leagueFilter]);

  // Filter leagues by input text
  const filteredLeagues = useMemo(() => {
    if (!leagueInput) return leagues;
    const q = leagueInput.toLowerCase();
    return leagues.filter(l => l.toLowerCase().includes(q));
  }, [leagues, leagueInput]);

  // Sync input with external leagueFilter changes
  useEffect(() => {
    setLeagueInput(leagueFilter === "all" ? "" : leagueFilter);
  }, [leagueFilter]);

  const fetchMatches = useCallback(async () => {
    const cached = api.getList(selectedDate, statusFilter);
    if (cached.length > 0) {
      setMatches(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchMatches(selectedDate, statusFilter, timezone);
      if (data.length > 0) {
        setMatches(data);
      } else {
        setError(t("empty.noMatchesForDate"));
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, statusFilter, timezone, t]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    api.start();
  }, []);

  useEffect(() => {
    const key = `${selectedDate}:${statusFilter}`;
    const unsub = api.subscribe((state) => {
      const list = state.lists[key];
      if (list && list.length > 0) {
        setMatches(list);
        setLoading(false);
        setError(null);
      }
    });
    return unsub;
  }, [selectedDate, statusFilter]);

  const grouped = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const filtered = matches.filter((m) => {
      // Drop not-started matches 30+ min past scheduled kickoff
      if (m.sc === 0 && nowSec - m.sts > 1800) return false;
      // Drop postponed / delayed
      if (m.sc === 60 || m.sc === 61) return false;
      // League filter
      if (leagueFilter !== "all" && m.tnm !== leagueFilter) return false;
      return true;
    });

    // By time: flat list sorted globally
    if (groupBy === "time") {
      const sorted = [...filtered].sort((a, b) => a.sts - b.sts);
      return sorted.length > 0 ? [["", sorted]] as [string, MatchListItem[]][] : [];
    }

    const map: Record<string, MatchListItem[]> = {};
    filtered.forEach((m) => {
      const key = groupBy === "league" ? m.tnm : m.cty;
      (map[key] ||= []).push(m);
    });
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.sts - b.sts);
    }
    return Object.entries(map).sort(([, a], [, b]) => (a[0]?.sts ?? 0) - (b[0]?.sts ?? 0));
  }, [matches, groupBy, leagueFilter]);

  function getMatchTime(m: MatchListItem) {
    const sc = m.sc;
    const nowSec = Math.floor(Date.now() / 1000);

    // Not started — show kickoff time only
    if (sc === 0) return "";

    // Postponed / Delayed
    if (sc === 60) return t("match.postponed");
    if (sc === 61) return t("match.delayed");

    // Canceled / Abandoned / Walkover / Retired
    if (sc === 70) return t("match.canceled");
    if (sc === 90) return t("match.abandoned");
    if (sc === 91) return t("match.walkover");
    if (sc === 92) return t("match.retired");
    if (sc === 93) return t("match.removed");
    if (sc === 97 || sc === 98) return t("match.defaulted");

    // Interrupted / Suspended
    if (sc === 80) return t("match.interrupted");
    if (sc === 81) return t("match.suspended");

    // Halftime / ET halftime
    if (sc === 31) return t("match.ht");
    if (sc === 33) return t("match.et_ht");

    // Awaiting extra time / penalties
    if (sc === 32) return t("match.awaiting_et");
    if (sc === 34) return t("match.penalties");
    if (sc === 50) return t("match.penalties");

    // Finished
    if (sc >= 100 && sc < 110) return t("match.ft");
    if (sc === 110) return t("match.aet");
    if (sc === 120) return t("match.ap");

    // Live — compute clock
    if (sc >= 1 && sc < 100) {
      // First half / period
      if (sc === 1 || sc === 6 || sc === 20) {
        const elapsed = Math.max(0, Math.floor((nowSec - m.sts) / 60));
        if (elapsed <= 45) return elapsed + "'";
        return "45+" + (elapsed - 45) + "'";
      }
      // Second half / period
      if (sc === 2 || sc === 7) {
        const secondHalfStart = m.sts + 45 * 60 + 15 * 60;
        const halfElapsed = Math.max(0, Math.floor((nowSec - secondHalfStart) / 60));
        const total = 45 + halfElapsed;
        if (halfElapsed <= 45) return total + "'";
        return "90+" + (halfElapsed - 45) + "'";
      }
      // Extra periods / other live states
      const elapsed = Math.max(0, Math.floor((nowSec - m.sts) / 60));
      return elapsed + "'";
    }

    return m.sd || m.st || "";
  }

  function badgeClass(sc: number): string {
    // Live in progress (exclude breaks and awaiting states)
    if (sc >= 1 && sc <= 59 && sc !== 31 && sc !== 32 && sc !== 33 && sc !== 34) return "bg-accent text-white animate-pulse-ring";
    if (sc === 80 || sc === 81) return "bg-accent text-white animate-pulse-ring";
    // HT / ET HT
    if (sc === 31 || sc === 33) return "bg-[#e6a23c] text-white";
    // Finished
    if (sc >= 100) return "bg-surface-alt text-text-muted";
    // Postponed / Delayed
    if (sc === 60 || sc === 61) return "bg-[#ff9800] text-white";
    // Canceled / Abandoned
    if (sc === 70 || (sc >= 90 && sc <= 98)) return "bg-[#e53935] text-white";
    // Not started / default
    return "bg-surface-alt text-text-muted";
  }

  function statusBorder(sc: number): string {
    if (sc === 0 || sc === 60 || sc === 61) return "def";
    if (sc === 70 || (sc >= 90 && sc <= 98)) return "cancel";
    if (sc === 80 || sc === 81) return "live";
    if (sc === 31 || sc === 33) return "ht";
    if (sc >= 100) return "ft";
    if (sc >= 1 && sc < 100) return "live";
    return "def";
  }

  const borderColor: Record<string, string> = {
    live: "border-l-[#4fc3f7] dark:border-l-[#4fc3f7] border-l-[#0d8cc4]",
    ht: "border-l-[#e6a23c]",
    ft: "border-l-[#555] dark:border-l-[#555] border-l-[#ccc]",
    def: "border-l-[#2a2a2a] dark:border-l-[#2a2a2a] border-l-[#e8e8e8]",
    cancel: "border-l-[#e53935]",
  };

  return (
    <div className="max-w-[1200px] mx-auto p-4">
      <Helmet>
        <title>Live Football Scores — ScoreRef</title>
        <meta name="description" content="Live football scores and match results. Track fixtures, results, and real-time updates for football matches worldwide." />
      </Helmet>

      {/* Status tabs */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex bg-surface-muted rounded-md p-0.5">
          {[
            { label: t("status.live"), value: "1" },
            { label: t("status.scheduled"), value: "0" },
            { label: t("status.finished"), value: "-1" },
          ].map((o) => (
            <button
              key={o.value}
              onClick={() => setStatusFilter(o.value)}
              className={`text-xs px-3 py-1 rounded cursor-pointer transition-all whitespace-nowrap
                ${statusFilter === o.value
                  ? "bg-accent text-white font-semibold"
                  : "text-text-muted hover:text-text-primary"
                }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-text-muted bg-surface-muted px-2.5 py-1 rounded-xl">
          {t("count", { n: matches.length })}
        </span>
      </div>

      {/* Date bar — hidden for Live */}
      {statusFilter !== "1" && (
        <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-none">
          {dateOptions.map((d) => (
            <button
              key={d.value}
              onClick={() => setSelectedDate(d.value)}
              className={`flex flex-col items-center min-w-[52px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors shrink-0
                ${selectedDate === d.value
                  ? "bg-accent"
                  : d.isToday
                    ? "bg-[#e3f2fd] dark:bg-[#1a2a3a]"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
            >
              <span
                className={`text-xs ${selectedDate === d.value
                  ? "text-white font-semibold"
                  : d.isToday
                    ? "text-accent"
                    : "text-text-muted"
                }`}
              >
                {d.text}
              </span>
              <span
                className={`text-[11px] mt-px ${selectedDate === d.value
                  ? "text-white/80"
                  : "text-text-muted"
                }`}
              >
                {d.sub}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-start mb-5 pb-3 border-b border-border gap-2">
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as "league" | "country")}
          className="text-xs bg-surface-muted text-text-primary border border-border rounded-md px-2.5 py-1.5 outline-none cursor-pointer w-[110px]"
        >
          <option value="league">{t("groupBy.league")}</option>
          <option value="country">{t("groupBy.country")}</option>
          <option value="time">{t("groupBy.time")}</option>
        </select>
        <div className="relative">
          <input
            type="text"
            value={leagueInput}
            placeholder={t("filter.allLeagues")}
            onFocus={() => setLeagueOpen(true)}
            onBlur={() => setTimeout(() => setLeagueOpen(false), 150)}
            onChange={(e) => { setLeagueInput(e.target.value); setLeagueOpen(true); }}
            className="text-xs bg-surface-muted text-text-primary border border-border rounded-md px-2.5 py-1.5 outline-none w-[160px]"
          />
          {leagueOpen && (
            <div className="absolute top-full left-0 mt-1 w-full max-h-[240px] overflow-y-auto bg-surface border border-border rounded-md shadow-lg z-50">
              <button
                onMouseDown={() => { setLeagueFilter("all"); setLeagueOpen(false); }}
                className={`w-full text-left text-xs px-2.5 py-1.5 hover:bg-surface-muted cursor-pointer ${leagueFilter === "all" ? "text-accent font-semibold" : "text-text-primary"}`}
              >
                {t("filter.allLeagues")}
              </button>
              {filteredLeagues.map((l) => (
                <button
                  key={l}
                  onMouseDown={() => { setLeagueFilter(l); setLeagueOpen(false); }}
                  className={`w-full text-left text-xs px-2.5 py-1.5 hover:bg-surface-muted cursor-pointer truncate ${leagueFilter === l ? "text-accent font-semibold" : "text-text-primary"}`}
                >
                  {l}
                </button>
              ))}
              {filteredLeagues.length === 0 && leagueInput && (
                <div className="text-xs text-text-muted px-2.5 py-3 text-center">{t("empty.noMatches")}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-[10px] p-3.5 border border-border-light">
              <div className="flex items-center justify-between gap-4">
                <div className="w-10 h-4 rounded-lg bg-gradient-to-r from-skeleton-from via-skeleton-via to-skeleton-to bg-[length:200%_100%] animate-shimmer rounded animate-pulse" />
                <div className="flex-1 max-w-[120px] h-4 rounded-lg bg-gradient-to-r from-skeleton-from via-skeleton-via to-skeleton-to bg-[length:200%_100%] animate-shimmer rounded animate-pulse" />
                <div className="w-[60px] h-4 rounded-lg bg-gradient-to-r from-skeleton-from via-skeleton-via to-skeleton-to bg-[length:200%_100%] animate-shimmer rounded animate-pulse" />
                <div className="flex-1 max-w-[120px] h-4 rounded-lg bg-gradient-to-r from-skeleton-from via-skeleton-via to-skeleton-to bg-[length:200%_100%] animate-shimmer rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && <div className="text-center py-16 text-[#e53935] text-base">{t("error")}: {error}</div>}

      {/* Empty state */}
      {!loading && !error && grouped.length === 0 && (
        <div className="text-center py-16 text-text-muted text-sm">{t("empty.noMatchesForDate")}</div>
      )}

      {/* Match list */}
      {!loading && !error && grouped.map(([group, list]) => (
        <section key={group || "_time"} className="mb-[18px]">
          {groupBy !== "time" && (
            <h2 className="text-[15px] font-semibold text-text-secondary mb-2.5 flex items-center gap-2">
              <LeagueAvatar id={list[0]?.tid} name={group} className="w-[22px] h-[22px] object-contain rounded shrink-0" />
              {group}
              <span className="text-[11px] text-text-muted font-normal ml-auto">{formatKickoff(list[0].sts, timezone)}</span>
            </h2>
          )}

          <div className="flex flex-col gap-1.5">
            {list.map((m) => (
              <div
                key={m.mid}
                onClick={() => navigate(`/match/${matchSlug(m.hnm, m.anm)}/${m.mid}`)}
                className={`bg-surface rounded-[10px] py-3 px-4 border border-border-light border-l-4 ${borderColor[statusBorder(m.sc)] || borderColor.def} hover:border-[#444] hover:translate-x-[3px] transition-all cursor-pointer`}
              >
                <div className="flex items-center justify-between gap-1.5 sm:gap-3">
                  {/* Meta */}
                  <div className="flex flex-col items-end gap-1 shrink-0 min-w-[42px] sm:min-w-[55px]">
                    <span className="text-[11px] sm:text-xs text-text-secondary tabular-nums">{formatKickoff(m.sts, timezone)}</span>
                    <span
                      className={`text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-[10px] ${badgeClass(m.sc)}`}
                    >
                      {getMatchTime(m)}
                    </span>
                  </div>

                  {/* Home team */}
                  <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-2.5 text-right min-w-0">
                    <TeamAvatar id={m.hid} name={m.hnm} className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full shrink-0" />
                    <span className="text-[12px] sm:text-[13px] font-medium text-text-primary max-w-[100px] sm:max-w-[140px] truncate">{m.hnm}</span>
                  </div>

                  {/* Score */}
                  <div className="flex flex-col items-center min-w-[60px] sm:min-w-[70px] shrink-0">
                    {m.sc === 0 || m.sc === 60 || m.sc === 61 ? (
                      <span className="text-sm font-semibold text-text-muted">{t("h2h.vs")}</span>
                    ) : (
                      <>
                        <span className="text-lg sm:text-xl font-extrabold text-text-primary tracking-[2px] tabular-nums">{m.hsc} - {m.asc}</span>
                        {m.sc >= 31 && (
                          <span className="text-[10px] sm:text-[11px] text-text-muted -mt-0.5">({m.hs1} - {m.as1})</span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Away team */}
                  <div className="flex-1 flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                    <TeamAvatar id={m.aid} name={m.anm} className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full shrink-0" />
                    <span className="text-[12px] sm:text-[13px] font-medium text-text-primary max-w-[100px] sm:max-w-[140px] truncate">{m.anm}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
