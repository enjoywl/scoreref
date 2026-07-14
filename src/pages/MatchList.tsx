import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useI18n } from "../locales";
import { api, type MatchListItem } from "../lib/api";
import { matchSlug } from "../lib/slug";
import { useTimezone, getDateFields, formatKickoffTime, formatDateISO, TIMEZONE_OPTIONS } from "../lib/timezone";

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

function leagueLogo(tid?: number): string {
  return tid ? `/v1/image/league/${tid}.png` : "";
}

function teamLogo(teamId: number): string {
  return teamId ? `/v1/image/team/${teamId}.png` : "";
}

export default function MatchList() {
  const { t } = useI18n();
  const { timezone, setTimezone } = useTimezone();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => formatDateISO(new Date(), timezone), [timezone]);

  const groupBy = (searchParams.get("groupBy") as "league" | "country") || "league";
  const statusFilter = searchParams.has("status") ? searchParams.get("status")! : "1";
  const dateOptions = useMemo(() => buildDateOptions(statusFilter, t, timezone), [statusFilter, t, timezone]);
  const selectedDate = statusFilter === "1" ? today : (searchParams.get("date") || today);

  function setGroupBy(val: "league" | "country") {
    setSearchParams(prev => { prev.set("groupBy", val); return prev; });
  }
  function setStatusFilter(val: string) {
    setSearchParams(prev => {
      prev.set("status", val);
      if (val === "1") prev.delete("date");
      else if (!prev.has("date")) prev.set("date", today);
      return prev;
    });
  }
  function setSelectedDate(val: string) {
    setSearchParams(prev => { if (val !== today) prev.set("date", val); else prev.delete("date"); return prev; });
  }

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
        setError("No matches found");
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, statusFilter, timezone]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    api.start();
  }, []);

  useEffect(() => {
    const key = `${selectedDate}:${statusFilter}`;
    const unsub = api.subscribe((state) => {
      if (state.lists[key]) {
        setMatches(state.lists[key]);
        setLoading(false);
        setError(null);
      }
    });
    return unsub;
  }, [selectedDate, statusFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, MatchListItem[]> = {};
    matches.forEach((m) => {
      const key = groupBy === "league" ? m.tnm : m.cty;
      (map[key] ||= []).push(m);
    });
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.sts - b.sts);
    }
    return Object.entries(map);
  }, [matches, groupBy]);

  function getMatchTime(m: MatchListItem) {
    if (m.sc >= 1 && m.sc < 100 && m.sc !== 31) {
      const elapsed = Math.floor((Date.now() - m.sts * 1000) / 60000);
      return Math.max(0, elapsed) + "'";
    }
    if (m.sc === 31) return t("match.ht");
    if (m.sc >= 100) return t("match.ft");
    return t("match.unknown");
  }

  function statusBorder(sc: number): string {
    if (sc >= 1 && sc < 100 && sc !== 31) return "live";
    if (sc === 31) return "ht";
    if (sc >= 100) return "ft";
    return "def";
  }

  const borderColor: Record<string, string> = {
    live: "border-l-[#4fc3f7] dark:border-l-[#4fc3f7] border-l-[#0d8cc4]",
    ht: "border-l-[#e6a23c]",
    ft: "border-l-[#555] dark:border-l-[#555] border-l-[#ccc]",
    def: "border-l-[#2a2a2a] dark:border-l-[#2a2a2a] border-l-[#e8e8e8]",
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
        </select>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="text-xs bg-surface-muted text-text-primary border border-border rounded-md px-2.5 py-1.5 outline-none cursor-pointer max-w-[180px]"
          title={t("timezone")}
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
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

      {/* Match list */}
      {!loading && !error && grouped.map(([group, list]) => (
        <section key={group} className="mb-[18px]">
          <h2 className="text-[15px] font-semibold text-text-secondary mb-2.5 flex items-center gap-2">
            {list[0]?.tid && (
              <img src={leagueLogo(list[0].tid)} alt="" className="w-[22px] h-[22px] object-contain rounded" loading="lazy" />
            )}
            {group}
          </h2>

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
                      className={`text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-[10px]
                        ${m.sc >= 1 && m.sc < 100 && m.sc !== 31 ? "bg-accent text-white animate-pulse-ring" : ""}
                        ${m.sc === 31 ? "bg-[#e6a23c] text-white" : ""}
                        ${m.sc === 0 ? "bg-surface-alt text-text-muted" : ""}
                        ${m.sc >= 100 ? "bg-surface-alt text-text-muted" : ""}
                      `}
                    >
                      {getMatchTime(m)}
                    </span>
                  </div>

                  {/* Home team */}
                  <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-2.5 text-right min-w-0">
                    <img src={teamLogo(m.hid)} alt={m.hnm} className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full bg-surface-alt shrink-0" loading="lazy" />
                    <span className="text-[12px] sm:text-[13px] font-medium text-text-primary max-w-[100px] sm:max-w-[140px] truncate">{m.hnm}</span>
                  </div>

                  {/* Score */}
                  <div className="flex flex-col items-center min-w-[60px] sm:min-w-[70px] shrink-0">
                    <span className="text-lg sm:text-xl font-extrabold text-text-primary tracking-[2px] tabular-nums">{m.hsc} - {m.asc}</span>
                    {m.sc >= 31 && (
                      <span className="text-[10px] sm:text-[11px] text-text-muted -mt-0.5">({m.hs1} - {m.as1})</span>
                    )}
                  </div>

                  {/* Away team */}
                  <div className="flex-1 flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                    <img src={teamLogo(m.aid)} alt={m.anm} className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full bg-surface-alt shrink-0" loading="lazy" />
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
