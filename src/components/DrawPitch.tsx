import { useState, type ReactNode } from "react";

interface Player {
  nm: string; sn: string; sh: number; pos: string; sub: boolean; cap?: boolean; pid?: number; age?: number;
}

interface PositionedPlayer extends Player {
  _x: number; _y: number;
}

/** Parse formation string like "4-2-3-1" → [4,2,3,1]. Falls back to [4,4,2]. */
function parseFormation(fm?: string): number[] {
  if (!fm) return [4, 4, 2];
  const segs = fm.split("-").map(Number).filter(n => !isNaN(n) && n > 0);
  return segs.length >= 2 ? segs : [4, 4, 2];
}

/** Position depth for sorting: lower = closer to own goal. */
function posDepth(pos: string): number {
  const s = pos.toUpperCase();
  if (s.startsWith("G")) return 0;
  if (s.startsWith("D") && !s.includes("DM")) return 1;
  if (s.includes("DM")) return 2;                       // defensive mid
  if (s.startsWith("M") && !s.includes("AM")) return 3;  // central mid
  if (s.includes("AM")) return 4;                        // attacking mid
  if (s.startsWith("F") || s.startsWith("S")) return 5;  // forward
  return 3; // default to midfield
}

function layoutPlayers(players: Player[], side: "home" | "away", formation?: string): PositionedPlayer[] {
  const field = players.filter(p => !p.sub);
  const segments = parseFormation(formation);

  // Separate GK from outfield
  const gk = field.filter(p => posDepth(p.pos) === 0);
  const outfield = field.filter(p => posDepth(p.pos) !== 0);

  // Sort outfield by position depth, then left→center→right
  outfield.sort((a, b) => {
    const da = posDepth(a.pos);
    const db = posDepth(b.pos);
    if (da !== db) return da - db;
    const lr = (s: string) => s.includes("L") ? 0 : s.includes("R") ? 2 : 1;
    return lr(a.pos) - lr(b.pos);
  });

  // Distribute outfield players into formation segments
  const rows: Player[][] = [];
  let idx = 0;
  for (const count of segments) {
    rows.push(outfield.slice(idx, idx + count));
    idx += count;
  }
  // Dump any leftover players into the last row
  if (idx < outfield.length && rows.length > 0) {
    rows[rows.length - 1].push(...outfield.slice(idx));
  }
  // Prepend GK row
  rows.unshift(gk);

  const totalRows = rows.length; // 1 (GK) + N outfield
  const isHome = side === "home";

  // X positions: GK fixed, outfield rows distributed evenly
  const gkX = isHome ? 70 : 930;
  const osStart = isHome ? 175 : 825;
  const osEnd = isHome ? 470 : 530;
  const osRows = totalRows - 1;

  function rowX(ri: number): number {
    if (ri === 0) return gkX;
    if (osRows === 1) return Math.round((osStart + osEnd) / 2);
    return Math.round(osStart + (osEnd - osStart) * (ri - 1) / (osRows - 1));
  }

  function rowYRange(ri: number): [number, number] {
    if (ri === 0) return [340, 340]; // GK centered
    // Single outfield row: narrow
    if (osRows === 1) return [160, 520];
    // Last outfield row (forwards): moderate spread
    if (ri === totalRows - 1) return [140, 540];
    // First outfield row (defenders): wide spread
    if (ri === 1) return [100, 580];
    // Middle rows: widest spread
    return [60, 620];
  }

  const result: PositionedPlayer[] = [];
  for (let ri = 0; ri < totalRows; ri++) {
    const rp = rows[ri];
    const n = rp.length;
    if (n === 0) continue;
    const x = rowX(ri);
    const [y0, y1] = rowYRange(ri);
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * i) / (n - 1);
      result.push({ ...rp[i], _x: x, _y: Math.round(y) });
    }
  }
  return result;
}

function PlayerPhoto({ x, y, r, pid, name, fallback }: {
  x: number; y: number; r: number; pid?: number; name: string; fallback: string;
}) {
  const [error, setError] = useState(false);

  if (!pid || error) {
    return (
      <text x={x} y={y + 1} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">{fallback}</text>
    );
  }

  return (
    <foreignObject x={x - r} y={y - r} width={r * 2} height={r * 2}>
      <div
        style={{
          width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center", background: "#2a2a3e",
        }}
        title={name}
      >
        <img
          src={`/v1/image/player/${pid}.png`}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={() => setError(true)}
        />
      </div>
    </foreignObject>
  );
}

function PlayerNode({ p, color, isHome }: { p: PositionedPlayer; color: string; isHome: boolean }) {
  const r = 21;
  const nameX = isHome ? p._x - 2 : p._x + 2;
  const nameAnchor = isHome ? "end" : "start";

  return (
    <g>
      <circle cx={p._x} cy={p._y} r={r} fill="#1a1a2e" stroke={color} strokeWidth="2.5" />
      <PlayerPhoto x={p._x} y={p._y} r={r} pid={p.pid} name={p.nm} fallback={String(p.sh)} />
      {/* Shirt number badge */}
      <rect x={p._x + r - 14} y={p._y + r - 14} width="18" height="16" rx="5" fill={color} stroke="#fff" strokeWidth="1.5" />
      <text x={p._x + r - 5} y={p._y + r - 1} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>{p.sh}</text>
      {/* Captain badge */}
      {p.cap && (
        <>
          <circle cx={p._x + r - 2} cy={p._y - r + 4} r="7" fill="#FFC107" stroke="#fff" strokeWidth="1">
            <title>Captain</title>
          </circle>
          <text x={p._x + r - 2} y={p._y - r + 5.5} textAnchor="middle" fontSize="7" fontWeight="900" fill="#000">C</text>
        </>
      )}
      {/* Name */}
      <text x={nameX} y={p._y + r + 15} textAnchor={nameAnchor} fontSize="9" fontWeight="600" fill="#fff"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>{p.sn}</text>
      <text x={nameX} y={p._y + r + 26} textAnchor={nameAnchor} fontSize="8" fill="rgba(255,255,255,0.5)"
        style={{ fontVariantNumeric: "tabular-nums" }}>#{p.sh}</text>
    </g>
  );
}

function PitchMarkings() {
  const B = 8, CX = 500, CY = 340, CR = 87;
  const PA_D = 157, PA_W = 403, PA_Y = (680 - PA_W) / 2;
  const GA_D = 52, GA_W = 183, GA_Y = (680 - GA_W) / 2;
  const PS_L = B + 105, PS_R = 1000 - B - 105;
  const ARC_L_X = B + PA_D, ARC_R_X = 1000 - B - PA_D;
  const G_W = 73, G_Y = (680 - G_W) / 2, G_D = 10;
  const CA_R = 10;

  return (
    <g>
      <defs>
        <pattern id="dpStripes" patternUnits="userSpaceOnUse" width="40" height="680">
          <rect x="0" y="0" width="20" height="680" fill="rgba(255,255,255,0.02)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="1000" height="680" rx="10" fill="#2e7d32" />
      <rect x="0" y="0" width="1000" height="680" rx="10" fill="url(#dpStripes)" />
      {/* Outer border */}
      <rect x={B} y={B} width={1000 - 2 * B} height={680 - 2 * B} rx="4" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" />
      {/* Halfway line + center circle */}
      <line x1={CX} y1={B} x2={CX} y2={680 - B} stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" />
      <circle cx={CX} cy={CY} r={CR} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <circle cx={CX} cy={CY} r="3.5" fill="rgba(255,255,255,0.85)" />
      {/* Left penalty/goal areas */}
      <rect x={B} y={PA_Y} width={PA_D} height={PA_W} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <rect x={B} y={GA_Y} width={GA_D} height={GA_W} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <circle cx={PS_L} cy={CY} r="3.5" fill="rgba(255,255,255,0.85)" />
      <path d={`M ${ARC_L_X} ${CY - CR} A ${CR} ${CR} 0 0 1 ${ARC_L_X} ${CY + CR}`} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      {/* Right penalty/goal areas */}
      <rect x={1000 - B - PA_D} y={PA_Y} width={PA_D} height={PA_W} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <rect x={1000 - B - GA_D} y={GA_Y} width={GA_D} height={GA_W} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <circle cx={PS_R} cy={CY} r="3.5" fill="rgba(255,255,255,0.85)" />
      <path d={`M ${ARC_R_X} ${CY - CR} A ${CR} ${CR} 0 0 0 ${ARC_R_X} ${CY + CR}`} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      {/* Goals */}
      <rect x={B - G_D} y={G_Y} width={G_D} height={G_W} rx="2" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      <rect x={1000 - B} y={G_Y} width={G_D} height={G_W} rx="2" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      {/* Corner arcs + posts */}
      <path d={`M ${B + CA_R} ${B} A ${CA_R} ${CA_R} 0 0 0 ${B} ${B + CA_R}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <path d={`M ${B + CA_R} ${680 - B} A ${CA_R} ${CA_R} 0 0 1 ${B} ${680 - B - CA_R}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <path d={`M ${1000 - B - CA_R} ${B} A ${CA_R} ${CA_R} 0 0 1 ${1000 - B} ${B + CA_R}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <path d={`M ${1000 - B - CA_R} ${680 - B} A ${CA_R} ${CA_R} 0 0 0 ${1000 - B} ${680 - B - CA_R}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <circle cx={B} cy={B} r="2.5" fill="rgba(255,255,255,0.85)" />
      <circle cx={B} cy={680 - B} r="2.5" fill="rgba(255,255,255,0.85)" />
      <circle cx={1000 - B} cy={B} r="2.5" fill="rgba(255,255,255,0.85)" />
      <circle cx={1000 - B} cy={680 - B} r="2.5" fill="rgba(255,255,255,0.85)" />
    </g>
  );
}

export default function DrawPitch({
  homePlayers, awayPlayers, homeFormation, awayFormation, homeName, awayName, substitutes,
}: {
  homePlayers: Player[];
  awayPlayers: Player[];
  homeFormation?: string;
  awayFormation?: string;
  homeName: string;
  awayName: string;
  substitutes?: ReactNode;
}) {
  const home = layoutPlayers(homePlayers, "home", homeFormation);
  const away = layoutPlayers(awayPlayers, "away", awayFormation);

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-[900px] mx-auto w-full">
        <svg viewBox="0 0 1000 680" className="block w-full h-auto rounded-lg" xmlns="http://www.w3.org/2000/svg">
          <PitchMarkings />

          {/* Team labels — inside pitch at top */}
          <g>
            {/* Home team (left side) */}
            <text x={250} y={28} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>{homeName}</text>
            {homeFormation && (
              <text x={250} y={46} textAnchor="middle" fontSize="11" fontWeight="600" fill="rgba(255,255,255,0.7)"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{homeFormation}</text>
            )}
            {/* Away team (right side) */}
            <text x={750} y={28} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>{awayName}</text>
            {awayFormation && (
              <text x={750} y={46} textAnchor="middle" fontSize="11" fontWeight="600" fill="rgba(255,255,255,0.7)"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{awayFormation}</text>
            )}
            {/* VS divider */}
            <text x={500} y={34} textAnchor="middle" fontSize="12" fontWeight="700" fill="rgba(255,255,255,0.35)">VS</text>
          </g>

          {/* Players */}
          {home.map(p => <PlayerNode key={"hp" + p.sh} p={p} color="#1565C0" isHome />)}
          {away.map(p => <PlayerNode key={"ap" + p.sh} p={p} color="#C62828" isHome={false} />)}
        </svg>
      </div>

      {substitutes}
    </div>
  );
}
