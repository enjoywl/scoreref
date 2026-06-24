import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "../locales";

interface MatchData {
  mid: string;
  cty: string;
  lnam: string;
  lpc: string;
  mtim: number;
  stat: number;
  hnam: string;
  anam: string;
  hscr: number;
  ascr: number;
  hhsc: number;
  ahsc: number;
  hpc: string;
  apc: string;
  seas: string;
  locn?: string;
}

function getWeekday(day: number, t: (k: string) => string) {
  return t("weekdays." + day);
}

function buildDateOptions(t: (k: string) => string) {
  const dates: { text: string; sub: string; value: string; isToday: boolean }[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    dates.push({
      text: getWeekday(d.getDay(), t),
      sub: month + "/" + day,
      value,
      isToday: i === 0,
    });
  }
  return dates;
}

const statusCls: Record<number, string> = { 1: "live", 2: "ht", 3: "ft" };

function formatKickoff(ts: number) {
  const d = new Date(ts * 1000);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

export default function MatchList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateOptions = useMemo(() => buildDateOptions(t), [t]);
  const today = dateOptions[6]?.value || new Date().toISOString().slice(0, 10);

  const groupBy = (searchParams.get("groupBy") as "league" | "country") || "league";
  const statusFilter = searchParams.get("status") ?? "1";
  const selectedDate = searchParams.get("date") || today;

  function setGroupBy(val: "league" | "country") {
    setSearchParams(prev => { prev.set("groupBy", val); return prev; });
  }
  function setStatusFilter(val: string) {
    setSearchParams(prev => { if (val) prev.set("status", val); else prev.delete("status"); return prev; });
  }
  function setSelectedDate(val: string) {
    setSearchParams(prev => { if (val !== today) prev.set("date", val); else prev.delete("date"); return prev; });
  }

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/matches?${params}`, { cache: "no-cache" });
      const json = await res.json();
      if (json.code === 200) {
        setMatches(json.data);
      } else {
        setError(json.message || "Failed to load");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, statusFilter]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const grouped = useMemo(() => {
    const map: Record<string, MatchData[]> = {};
    matches.forEach((m) => {
      const key = groupBy === "league" ? m.lnam : m.cty;
      (map[key] ||= []).push(m);
    });
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.mtim - b.mtim);
    }
    return Object.entries(map);
  }, [matches, groupBy]);

  function getMatchTime(m: MatchData) {
    if (m.stat === 1) {
      const elapsed = Math.floor((Date.now() - m.mtim * 1000) / 60000);
      return Math.max(0, elapsed) + "'";
    }
    if (m.stat === 2) return t("match.ht");
    if (m.stat === 3) return t("match.ft");
    return t("match.unknown");
  }

  const borderColor: Record<string, string> = {
    live: "border-l-[#4fc3f7] dark:border-l-[#4fc3f7] border-l-[#0d8cc4]",
    ht: "border-l-[#e6a23c]",
    ft: "border-l-[#555] dark:border-l-[#555] border-l-[#ccc]",
    def: "border-l-[#2a2a2a] dark:border-l-[#2a2a2a] border-l-[#e8e8e8]",
  };

  return (
    <div className="max-w-[1200px] mx-auto p-4">
      {/* Date bar */}
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

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-border gap-2 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as "league" | "country")}
            className="text-xs bg-surface-muted text-text-primary border border-border rounded-md px-2.5 py-1.5 outline-none cursor-pointer w-[110px]"
          >
            <option value="league">{t("groupBy.league")}</option>
            <option value="country">{t("groupBy.country")}</option>
          </select>
          <div className="flex bg-surface-muted rounded-md p-0.5">
            {[
              { label: t("status.all"), value: "" },
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
        </div>
        <span className="text-[13px] text-text-muted bg-surface-muted px-2.5 py-1 rounded-xl">
          {t("count", { n: matches.length })}
        </span>
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
            {list[0]?.lpc && (
              <img src={list[0].lpc} alt="" className="w-[22px] h-[22px] object-contain rounded" loading="lazy" />
            )}
            {group}
          </h2>

          <div className="flex flex-col gap-1.5">
            {list.map((m) => (
              <div
                key={m.mid}
                onClick={() => navigate(`/match/${m.mid}`)}
                className={`bg-surface rounded-[10px] py-3 px-4 border border-border-light border-l-4 ${borderColor[statusCls[m.stat]] || borderColor.def} hover:border-[#444] hover:translate-x-[3px] transition-all cursor-pointer`}
              >
                <div className="flex items-center justify-between gap-1.5 sm:gap-3">
                  {/* Meta */}
                  <div className="flex flex-col items-end gap-1 shrink-0 min-w-[42px] sm:min-w-[55px]">
                    <span className="text-[11px] sm:text-xs text-text-secondary tabular-nums">{formatKickoff(m.mtim)}</span>
                    <span
                      className={`text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-[10px]
                        ${m.stat === 1 ? "bg-accent text-white animate-pulse-ring" : ""}
                        ${m.stat === 2 ? "bg-[#e6a23c] text-white" : ""}
                        ${m.stat === 0 ? "bg-surface-alt text-text-muted" : ""}
                        ${m.stat === 3 || m.stat === -1 ? "bg-surface-alt text-text-muted" : ""}
                      `}
                    >
                      {getMatchTime(m)}
                    </span>
                  </div>

                  {/* Home team */}
                  <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-2.5 text-right min-w-0">
                    <img src={m.hpc} alt={m.hnam} className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full bg-surface-alt shrink-0" loading="lazy" />
                    <span className="text-[12px] sm:text-[13px] font-medium text-text-primary max-w-[100px] sm:max-w-[140px] truncate">{m.hnam}</span>
                  </div>

                  {/* Score */}
                  <div className="flex flex-col items-center min-w-[60px] sm:min-w-[70px] shrink-0">
                    <span className="text-lg sm:text-xl font-extrabold text-text-primary tracking-[2px] tabular-nums">{m.hscr} - {m.ascr}</span>
                    {m.stat >= 2 && (
                      <span className="text-[10px] sm:text-[11px] text-text-muted -mt-0.5">({m.hhsc} - {m.ahsc})</span>
                    )}
                  </div>

                  {/* Away team */}
                  <div className="flex-1 flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                    <img src={m.apc} alt={m.anam} className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full bg-surface-alt shrink-0" loading="lazy" />
                    <span className="text-[12px] sm:text-[13px] font-medium text-text-primary max-w-[100px] sm:max-w-[140px] truncate">{m.anam}</span>
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
