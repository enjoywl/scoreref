export interface MatchListItem {
  mid: string; cty: string; tnm: string; sts: number;
  sc: number; st?: string; sd?: string;
  hnm: string; anm: string; hsc: number; asc: number;
  hs1: number; as1: number; hid: number; aid: number; snm: string; vnm?: string;
  tid?: number; cps?: number;
}

export interface MatchInfo {
  mid: string; msl?: string; cid?: string; did?: number;
  tid?: number; tnm: string; tsl?: string; tpc?: string; tsc?: string;
  stid?: number; stnm?: string; stsl?: string; isg?: boolean; grp?: string;
  cat?: number; canm?: string; cty?: string; csl?: string;
  sid?: number; snm: string; syr?: string;
  rn?: number; rnm: string; rsl?: string;
  sc: number; sd?: string; st?: string; wnr?: number;
  sts: number; cps?: number; ij1?: number; ij2?: number; ij3?: number; ij4?: number;
  hid: number; hnm: string; hsl?: string; hsn?: string; hpc?: string; hcs?: string;
  aid: number; anm: string; asl?: string; asn?: string; apc?: string; acs?: string;
  hsc: number; hds?: number; hs1: number; hs2?: number; hnt?: number;
  he1?: number; he2?: number; hot?: number; hpn?: number;
  asc: number; ads?: number; as1: number; as2?: number; ant?: number;
  ae1?: number; ae2?: number; aot?: number; apn?: number;
  vid?: number; vnm: string; vci?: string; vlt?: number; vlg?: number;
  rid?: number; rfn?: string;
  vah?: boolean; vaa?: boolean;
  hgl?: boolean; eps?: boolean; eph?: boolean; flk?: boolean; fro?: boolean;
  ied?: boolean; cmr?: number; stp?: boolean;
  dpc?: number; dpl?: number; dol?: number; cht?: number;
  cai?: boolean; cah?: boolean; cde?: boolean;
}

export interface MatchDetail {
  info: MatchInfo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API response shape is dynamic
  incidents: any[];
}

export interface ApiState {
  lists: Record<string, MatchListItem[]>;
  details: Record<string, MatchDetail>;
}

type Listener = (state: ApiState) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw API data
function mapMatch(m: Record<string, any>): MatchListItem {
  return {
    mid: m.mid,
    cty: m.cty || "",
    tnm: m.tnm || m.stnm || "",
    sts: m.sts || 0,
    sc: m.sc || 0,
    st: m.st,
    sd: m.sd,
    hnm: m.hnm || "",
    anm: m.anm || "",
    hsc: m.hsc ?? 0,
    asc: m.asc ?? 0,
    hs1: m.hs1 ?? 0,
    as1: m.as1 ?? 0,
    hid: m.hid ?? 0,
    aid: m.aid ?? 0,
    snm: m.snm || "",
    vnm: m.vnm || "",
    tid: m.tid,
    cps: m.cps,
  };
}

class ApiClient {
  private state: ApiState = { lists: {}, details: {} };
  private listeners = new Set<Listener>();
  private lang = "en";

  getList(date: string, status: string): MatchListItem[] {
    return this.state.lists[`${date}:${status}`] || [];
  }

  getDetail(mid: string): MatchDetail | null {
    return this.state.details[mid] || null;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    for (const cb of this.listeners) {
      try { cb(this.state); } catch { /* ignore */ }
    }
  }

  start() {
    // HTTP-only mode — no WebSocket
  }

  setLanguage(lang: string) {
    if (this.lang !== lang) {
      this.state.lists = {};
      this.state.details = {};
    }
    this.lang = lang;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.lang) h["X-Language"] = this.lang;
    if (extra) Object.assign(h, extra);
    return h;
  }

  async fetchMatches(date: string, status: string, timezone?: string): Promise<MatchListItem[]> {
    const extra: Record<string, string> = {};
    if (timezone) extra["X-Timezone"] = timezone;
    try {
      const res = await fetch(`/v1/api/matches/${date}?status=${status}`, { headers: this.headers(extra) });
      if (!res.ok) return [];
      const json = await res.json();
      if (json.code === 200 && Array.isArray(json.data)) {
        const mapped = json.data.map(mapMatch);
        this.state.lists[`${date}:${status}`] = mapped;
        this.notify();
        return mapped;
      }
    } catch {
      // network error or invalid json
    }
    return [];
  }

  async fetchDetail(mid: string): Promise<MatchDetail | null> {
    try {
      const [infoRes, incRes] = await Promise.all([
        fetch(`/v1/api/match/${mid}`, { headers: this.headers() }),
        fetch(`/v1/api/match/${mid}/incidents`, { headers: this.headers() }),
      ]);
      if (!infoRes.ok) return null;
      const [infoJson, incJson] = await Promise.all([infoRes.json(), incRes.json()]);
      const info = infoJson.code === 200 ? infoJson.data : null;
      const incidents = incJson.code === 200 ? (incJson.data?.ins || []) : [];
      if (info) {
        this.state.details[mid] = { info, incidents };
        this.notify();
        return { info, incidents };
      }
    } catch {
      // network error or invalid json
    }
    return null;
  }
}

export const api = new ApiClient();
