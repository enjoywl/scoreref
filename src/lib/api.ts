export interface MatchListItem {
  mid: string; cty: string; lnam: string; lpc: string; mtim: number;
  stat: number; hnam: string; anam: string; hscr: number; ascr: number;
  hhsc: number; ahsc: number; hpc: string; apc: string; seas: string; locn?: string;
}

export interface MatchInfo {
  mid: string; lnam: string; lpc: string; mtim: number; stat: number;
  hnam: string; anam: string; hscr: number; ascr: number;
  hhsc: number; ahsc: number; hred: number; ared: number;
  hyel: number; ayel: number; hcor: number; acor: number;
  hrnk: string; arnk: string; seas: string; round: string;
  locn: string; weat: string; temp: string;
  hmgr: string; amgr: string; rfee: string;
  hpc: string; apc: string;
}

export interface MatchDetail {
  info: MatchInfo;
  incidents: any[];
}

export interface ApiState {
  lists: Record<string, MatchListItem[]>;
  details: Record<string, MatchDetail>;
}

type Listener = (state: ApiState) => void;

class ApiClient {
  private state: ApiState = { lists: {}, details: {} };
  private listeners = new Set<Listener>();

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

  async fetchMatches(date: string, status: string): Promise<MatchListItem[]> {
    const res = await fetch(`/api/matches?date=${date}&status=${status}`);
    const json = await res.json();
    if (json.code === 200 && Array.isArray(json.data)) {
      this.state.lists[`${date}:${status}`] = json.data;
      this.notify();
      return json.data;
    }
    return [];
  }

  async fetchDetail(mid: string): Promise<MatchDetail | null> {
    const res = await fetch(`/api/match/${mid}/full`);
    const json = await res.json();
    if (json.code === 200 && json.data) {
      this.state.details[mid] = json.data;
      this.notify();
      return json.data;
    }
    return null;
  }
}

export const api = new ApiClient();
