// Types mirroring DO data structures
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

export interface DOState {
  lists: Record<string, MatchListItem[]>;
  details: Record<string, MatchDetail>;
}

type DOListener = (state: DOState) => void;

// --- IndexedDB persistence ---
const DB_NAME = "scoreref_do";
const DB_VERSION = 1;
const STORE = "cache";

function openIDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(key: string, val: any): Promise<void> {
  const db = await openIDB();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
  } catch { /* ignore */ }
}

async function idbGet(key: string): Promise<any | null> {
  const db = await openIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

// --- WebSocket client ---
class DOClient {
  private ws: WebSocket | null = null;
  private state: DOState = { lists: {}, details: {} };
  private listeners = new Set<DOListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private pendingDetails = new Map<string, Set<(d: MatchDetail | null) => void>>();
  private _connected = false;

  get connected() { return this._connected; }

  /** Start WebSocket connection + load IDB cache */
  async start(): Promise<void> {
    // Load persisted state from IndexedDB
    const [cachedLists, cachedDetails] = await Promise.all([
      idbGet("lists"),
      idbGet("details"),
    ]);
    if (cachedLists) this.state.lists = cachedLists;
    if (cachedDetails) this.state.details = cachedDetails;
    if (cachedLists || cachedDetails) this.notify();

    this.connectWS();
  }

  private connectWS() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/do/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._connected = true;
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.handleMessage(msg);
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private handleMessage(msg: any) {
    if (msg.type === "snapshot") {
      // Full state from server — replace local
      if (msg.lists) this.state.lists = msg.lists;
      if (msg.details) this.state.details = msg.details;
      this.persist();
      this.notify();
    } else if (msg.type === "update") {
      // Partial update from cron
      if (msg.lists) {
        for (const k of Object.keys(msg.lists)) {
          this.state.lists[k] = msg.lists[k];
        }
      }
      if (msg.details) {
        for (const k of Object.keys(msg.details)) {
          this.state.details[k] = msg.details[k];
        }
      }
      this.persist();
      this.notify();
    } else if (msg.type === "detail") {
      // Response to getDetail request
      if (msg.mid && msg.data) {
        this.state.details[msg.mid] = msg.data;
        this.persist();
      }
      // Resolve pending requests
      const pending = this.pendingDetails.get(msg.mid);
      if (pending) {
        this.pendingDetails.delete(msg.mid);
        const detail = msg.data || null;
        for (const resolve of pending) resolve(detail);
      }
      this.notify();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
      this.connectWS();
    }, this.reconnectDelay);
  }

  private async persist() {
    await Promise.all([
      idbPut("lists", this.state.lists),
      idbPut("details", this.state.details),
    ]);
  }

  private notify() {
    for (const cb of this.listeners) {
      try { cb(this.state); } catch { /* ignore */ }
    }
  }

  // --- Public API ---

  /** Get a match list for date+status combo (from memory) */
  getList(date: string, status: string): MatchListItem[] {
    return this.state.lists[`${date}:${status}`] || [];
  }

  /** Get match detail from memory, or request it via WebSocket */
  getDetail(mid: string): MatchDetail | null {
    return this.state.details[mid] || null;
  }

  /** Request match detail from server. Returns a promise that resolves when the response arrives. */
  requestDetail(mid: string): Promise<MatchDetail | null> {
    // Already have it
    if (this.state.details[mid]) {
      return Promise.resolve(this.state.details[mid]);
    }
    // Deduplicate in-flight requests
    const existing = this.pendingDetails.get(mid);
    if (existing) {
      return new Promise((resolve) => existing.add(resolve));
    }
    const set = new Set<(d: MatchDetail | null) => void>();
    this.pendingDetails.set(mid, set);
    const promise = new Promise<MatchDetail | null>((resolve) => set.add(resolve));

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "getDetail", mid }));
    } else {
      // WebSocket not available — fall back to HTTP after a tick
      setTimeout(() => this.fetchDetailHTTP(mid).then((d) => {
        if (d) {
          this.state.details[mid] = d;
          this.notify();
        }
        for (const resolve of set) resolve(d);
        this.pendingDetails.delete(mid);
      }), 0);
    }

    // Timeout after 10s
    const timeout = new Promise<null>((resolve) => setTimeout(() => {
      for (const r of set) r(null);
      this.pendingDetails.delete(mid);
      resolve(null);
    }, 10000));

    return Promise.race([promise, timeout]);
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(cb: DOListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** HTTP fallback: fetch match list */
  async fetchMatchesHTTP(date: string, status: string): Promise<MatchListItem[]> {
    try {
      const res = await fetch(`/api/matches?date=${date}&status=${status}`);
      const json = await res.json();
      if (json.code === 200 && Array.isArray(json.data)) {
        const key = `${date}:${status}`;
        this.state.lists[key] = json.data;
        this.persist();
        this.notify();
        return json.data;
      }
    } catch { /* fallback failed */ }
    return [];
  }

  /** HTTP fallback: fetch match detail */
  async fetchDetailHTTP(mid: string): Promise<MatchDetail | null> {
    try {
      const res = await fetch(`/api/match/${mid}/full`);
      const json = await res.json();
      if (json.code === 200 && json.data) {
        return {
          info: json.data.info,
          incidents: json.data.incidents || [],
        };
      }
    } catch { /* fallback failed */ }
    return null;
  }
}

export const doClient = new DOClient();
