import { useEffect, useState } from "react";
import "./App.css";

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

interface ApiResponse {
  code: number;
  message: string;
  data: MatchData[];
}

const STATUS_MAP: Record<number, { label: string; cls: string }> = {
  1: { label: "进行中", cls: "status-live" },
  2: { label: "中场", cls: "status-ht" },
  3: { label: "已结束", cls: "status-ft" },
};

function getStatus(stat: number) {
  return STATUS_MAP[stat] || { label: "未知", cls: "" };
}

function App() {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"league" | "country">("league");

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/matches?date=${today}&status=1`)
      .then((res) => res.json())
      .then((json: ApiResponse) => {
        if (json.code === 200) {
          setMatches(json.data);
        } else {
          setError(json.message || "Failed to load");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const grouped = new Map<string, MatchData[]>();
  matches.forEach((m) => {
    const key = groupBy === "league" ? m.lnam : m.cty;
    const list = grouped.get(key) || [];
    list.push(m);
    grouped.set(key, list);
  });

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">加载失败: {error}</div>;

  return (
    <div className="app">
      <header className="header">
        <h1>live score</h1>
        <div className="controls">
          <label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as "league" | "country")}>
              <option value="league">按联赛</option>
              <option value="country">按国家</option>
            </select>
          </label>
          <span className="count">共 {matches.length} 场</span>
        </div>
      </header>

      {Array.from(grouped.entries()).map(([group, list]) => (
        <section key={group} className="group">
          <h2 className="group-title">
            {list[0]?.lpc && <img loading="lazy" decoding="async" src={list[0].lpc} alt="" className="league-logo" />}
            {group}
          </h2>
          <div className="match-list">
            {list.map((m) => {
              const s = getStatus(m.stat);
              return (
                <div key={m.mid} className="match-card">
                  <div className="match-info">
                    <span className={`status-badge ${s.cls}`}>{s.label}</span>
                    {m.locn && <span className="venue">{m.locn}</span>}
                  </div>
                  <div className="match-body">
                    <div className="team team-left">
                      <img loading="lazy" decoding="async" src={m.hpc} alt={m.hnam} className="team-logo" />
                      <span className="team-name">{m.hnam}</span>
                    </div>
                    <div className="score">
                      <span className="score-main">{m.hscr} - {m.ascr}</span>
                      <span className="score-ht">({m.hhsc} - {m.ahsc})</span>
                    </div>
                    <div className="team team-right">
                      <img loading="lazy" decoding="async" src={m.apc} alt={m.anam} className="team-logo" />
                      <span className="team-name">{m.anam}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default App;
