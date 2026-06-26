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
  private ws: WebSocket | null = null;
  private state: ApiState = { lists: {}, details: {} };
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  getList(date: string, status: string): MatchListItem[] {
    return this.state.lists[`${date}:${status}`] || [];
  }

  getDetail(mid: string): MatchDetail | null {
    return this.state.details[mid] || null;
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
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
    this.connectWS();
  }

  private connectWS() {
    // Connect to same host — Vite proxies /ws to proxy-server in dev,
    // or nginx/CF routes it in production
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "snapshot") {
          if (msg.lists) this.state.lists = msg.lists;
          if (msg.details) this.state.details = msg.details;
          this.notify();
        } else if (msg.type === "update") {
          if (msg.lists) {
            for (const k of Object.keys(msg.lists)) this.state.lists[k] = msg.lists[k];
          }
          if (msg.details) {
            for (const k of Object.keys(msg.details)) this.state.details[k] = msg.details[k];
          }
          this.notify();
        } else if (msg.type === "detail") {
          if (msg.mid && msg.data) this.state.details[msg.mid] = msg.data;
          this.notify();
        }
      } catch { /* ignore */ }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
      this.connectWS();
    }, this.reconnectDelay);
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
