<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "../locales";

interface MatchInfo {
  mid: string; lnam: string; lpc: string; mtim: number; stat: number;
  hnam: string; anam: string; hscr: number; ascr: number;
  hhsc: number; ahsc: number; hred: number; ared: number;
  hyel: number; ayel: number; hcor: number; acor: number;
  hrnk: string; arnk: string; seas: string; round: string;
  locn: string; weat: string; temp: string;
  hmgr: string; amgr: string; rfee: string;
  hpc: string; apc: string; ext: any;
}

interface IncidentPlayer {
  na: string; sna: string; pos: string; jn: string;
}

interface Incident {
  id: number; time: number; text: string; pnam: string; intp: string;
  hscr: number; ascr: number; incl: string; ihom: boolean; prd: string;
  adtm: number; reas: string; desc: string; conf: boolean;
  player: IncidentPlayer | null;
  plin: IncidentPlayer | null;
  plot: IncidentPlayer | null;
  ast1: IncidentPlayer | null;
  leng: number;
  resc: boolean;
}

interface CommentaryItem {
  text: string; type: string; ishm: boolean; seq: number;
  plyr?: { na: string };
}

interface LineupPlayer {
  player: { na: string }; shnm: number; posi: string;
  subs: boolean; capt: boolean;
}

interface PositionedPlayer extends LineupPlayer {
  _x: number;
  _y: number;
}

interface StatItem {
  key: string; name: string; home: string; away: string;
  homeValue: number; awayValue: number; renderType: number;
}

interface H2hEvent {
  htea: { name: string; slug: string }; atea: { name: string; slug: string };
  hscr: { current: number; display: number; period1: number; period2: number; normaltime: number };
  ascr: { current: number; display: number; period1: number; period2: number; normaltime: number };
  evst: any;
  tour: { name: string }; seas: { name: string };
  stat: { code: number; description: string; type: string };
  stms: number; rndi: { name: string; round: number } | null;
  wncd: number; cid: string; id: number; slug: string;
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const info = ref<MatchInfo | null>(null);
const incidents = ref<Incident[]>([]);
const commentary = ref<CommentaryItem[]>([]);
const lineups = ref<{ home: LineupPlayer[]; away: LineupPlayer[]; hform: string; aform: string } | null>(null);
const stats = ref<{ period: string; groups: { groupName: string; items: StatItem[] }[] }[]>([]);
const h2h = ref<H2hEvent[]>([]);
const loading = ref(true);
const activeTab = ref("live");

const statusCls: Record<number, string> = { 1: "live", 2: "ht", 3: "ft" };

async function fetchData(mid: string, api: string) {
  const res = await fetch(`/api/match/${mid}/${api}`);
  const json = await res.json();
  return (json.code === 200 || json.code === 0) ? json.data : null;
}

async function loadMatchData(mid: string) {
  loading.value = true;
  activeTab.value = "live";

  const [data, inc, com, ln, st, h2] = await Promise.all([
    fetchData(mid, "info"),
    fetchData(mid, "incidents"),
    fetchData(mid, "livetext"),
    fetchData(mid, "lineups"),
    fetchData(mid, "stats"),
    fetchData(mid, "h2h"),
  ]);
  if (data) info.value = data;
  if (inc?.incd) incidents.value = inc.incd;
  if (com?.cms) commentary.value = com.cms;
  if (ln) {
    const homePlayers = (ln.home?.plrs || []).map((p: any) => ({
      player: p.player, shnm: p.shnm, posi: p.posi, subs: p.subs, capt: p.capt,
    }));
    const awayPlayers = (ln.away?.plrs || []).map((p: any) => ({
      player: p.player, shnm: p.shnm, posi: p.posi, subs: p.subs, capt: p.capt,
    }));
    lineups.value = {
      home: homePlayers,
      away: awayPlayers,
      hform: ln.home?.form || "",
      aform: ln.away?.form || "",
    };
  }
  if (st?.statistics) {
    stats.value = st.statistics.map((period: any) => ({
      period: period.period,
      groups: (period.groups || []).map((g: any) => ({
        groupName: g.groupName,
        items: g.statisticsItems || [],
      })),
    }));
  }
  if (h2?.evts) {
    h2h.value = h2.evts.sort((a: any, b: any) => (b.stms || 0) - (a.stms || 0));
  }

  loading.value = false;
}

onMounted(() => {
  loadMatchData(route.params.mid as string);
});

watch(() => route.params.mid, (newMid) => {
  if (newMid) loadMatchData(newMid as string);
});

function goBack() {
  router.back();
}

function goH2hDetail(h2hId: number) {
  router.push({ name: "detail", params: { mid: String(h2hId) } });
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

function getStatusLabel(s: number) {
  if (s === 1) return t.value("match.live");
  if (s === 2) return t.value("match.ht");
  if (s === 3) return t.value("match.ft");
  if (s === 0) return t.value("status.scheduled");
  if (s === -1) return t.value("status.finished");
  return t.value("match.unknown");
}

const matchTime = computed(() => {
  if (!info.value) return "";
  if (info.value.stat === 1) {
    const elapsed = Math.floor((Date.now() - info.value.mtim * 1000) / 60000);
    return Math.max(0, elapsed) + "'";
  }
  return getStatusLabel(info.value.stat);
});

const allStats = computed(() => {
  return stats.value.find(s => s.period === "ALL") || stats.value[0];
});

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
  // SVG viewBox: 1000 x 650. Home (left half, attacks right), Away (right half, attacks left)
  // x positions: G→near goal, D→defensive line, M→midfield, F→near center
  // y positions: GK centered, D compact, M wide, F medium spread
  const xByRow = side === "home"
    ? [45, 170, 340, 475]   // G, D, M, F — all in left half
    : [955, 830, 660, 525]; // G, D, M, F — all in right half
  const yRange: Record<number, [number, number]> = {
    0: [325, 325],   // GK centered
    1: [105, 545],   // D compact
    2: [55, 595],    // M wide
    3: [140, 510],   // F medium
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

function getPlayerName(ev: Incident): string {
  return ev.pnam || ev.player?.na || ev.plin?.na || ev.plot?.na || "";
}

function getIncidentIcon(intp: string, incl?: string) {
  const t = (intp || "").toLowerCase();
  if (t === "period") return { icon: "", cls: "period" };
  if (t === "injurytime") return { icon: "", cls: "injury" };
  if (t === "card" && incl === "red") return { icon: "▮", cls: "red" };
  if (t === "card" && incl === "yellow") return { icon: "▮", cls: "yellow" };
  if (t === "goal" && incl === "own") return { icon: "⚽", cls: "own" };
  if (t === "goal" && incl === "penalty") return { icon: "⚽", cls: "penalty" };
  if (t === "goal") return { icon: "⚽", cls: "goal" };
  if (t === "substitution") return { icon: "↔", cls: "sub" };
  if (t === "vardecision") return { icon: "▷", cls: "var" };
  if (t === "ingamepenalty" && incl === "missed") return { icon: "✕", cls: "miss" };
  if (t === "ingamepenalty" && incl === "scored") return { icon: "⚽", cls: "penalty" };
  if (t === "ingamepenalty") return { icon: "⚽", cls: "penalty" };
  return { icon: "●", cls: "other" };
}
</script>

<template>
  <div class="detail-page">
    <div v-if="loading" class="loading">{{ t('loading') }}</div>
    <template v-else-if="info">
      <div class="match-hero">
        <!-- Top bar: back + league + round -->
        <div class="hero-top">
          <span class="back-btn" @click="goBack">&larr; Back</span>
          <span class="hero-league">{{ info.lnam }}</span>
          <span class="round" v-if="info.round">{{ info.round }}</span>
        </div>

        <!-- Teams + score -->
        <div class="hero-main">
          <div class="hero-team hero-home">
            <img :src="info.hpc" :alt="info.hnam" class="hero-logo" />
            <span class="hero-name">{{ info.hnam }}</span>
          </div>
          <div class="hero-score">
            <div class="hero-score-main">{{ info.hscr }} - {{ info.ascr }}</div>
            <div class="hero-score-sub">({{ info.hhsc }} - {{ info.ahsc }})</div>
            <div :class="['hero-status', statusCls[info.stat]]">{{ matchTime }}</div>
          </div>
          <div class="hero-team hero-away">
            <img :src="info.apc" :alt="info.anam" class="hero-logo" />
            <span class="hero-name">{{ info.anam }}</span>
          </div>
        </div>

        <!-- Match info strip -->
        <div class="hero-info-strip">
          <span class="hi-item" v-if="info.seas">{{ info.seas }}</span>
          <span class="hi-sep" v-if="info.seas">·</span>
          <span class="hi-item">{{ formatTime(info.mtim) }}</span>
          <span class="hi-sep">·</span>
          <span class="hi-item" v-if="info.locn">{{ info.locn }}</span>
          <span class="hi-sep" v-if="info.locn">·</span>
          <span class="hi-item" v-if="info.weat">{{ info.weat }} {{ info.temp }}</span>
          <span class="hi-sep" v-if="!info.locn && !info.weat">·</span>
          <span class="hi-item">Ref: {{ info.rfee || '-' }}</span>
        </div>
      </div>

      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane label="Live" name="live">
          <!-- Match Info -->
          <section v-if="info.hrnk || info.rfee" class="section">
            <h3 class="section-title">Match Info</h3>
            <div class="info-grid">
              <div class="info-item"><span class="info-label">Red Cards</span><span>{{ info.hred }} - {{ info.ared }}</span></div>
              <div class="info-item"><span class="info-label">Yellow Cards</span><span>{{ info.hyel }} - {{ info.ayel }}</span></div>
              <div class="info-item"><span class="info-label">Corners</span><span>{{ info.hcor }} - {{ info.acor }}</span></div>
              <div class="info-item"><span class="info-label">Ranking</span><span>{{ info.hrnk || '-' }} / {{ info.arnk || '-' }}</span></div>
              <div class="info-item" v-if="info.hmgr || info.amgr"><span class="info-label">Managers</span><span>{{ info.hmgr || '-' }} / {{ info.amgr || '-' }}</span></div>
            </div>
          </section>

          <!-- Stats -->
          <section v-if="allStats" class="section">
            <h3 class="section-title">Stats</h3>
            <div class="stats-bar-list">
              <div v-for="g in allStats.groups" :key="g.groupName" class="stats-group">
                <div class="stats-group-name">{{ g.groupName }}</div>
                <div v-for="it in g.items" :key="it.key || it.name" class="stats-bar-row">
                  <span class="stats-val stats-home">{{ it.home }}</span>
                  <span class="stats-name">{{ it.name }}</span>
                  <span class="stats-val stats-away">{{ it.away }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Incidents Timeline -->
          <section v-if="incidents.length" class="section">
            <h3 class="section-title">Incidents</h3>
            <div class="timeline">
              <template v-for="ev in incidents" :key="ev.id || ev.time + ev.intp + Math.random()">
                <!-- Period separator (HT/FT) -->
                <div v-if="ev.intp === 'period'" class="tl-period">
                  <span class="tl-period-text">{{ ev.text }}</span>
                  <span v-if="ev.hscr != null" class="tl-period-score">{{ ev.hscr }} - {{ ev.ascr }}</span>
                </div>

                <!-- Injury time announcement -->
                <div v-else-if="ev.intp === 'injuryTime'" class="tl-injury">
                  +{{ ev.leng }}' added
                </div>

                <!-- Regular event row -->
                <div v-else class="tl-row">
                  <div class="tl-side tl-home">
                    <div v-if="ev.ihom === true" class="tl-bubble" :class="'tl-bubble--' + getIncidentIcon(ev.intp, ev.incl).cls">
                      <span v-if="getIncidentIcon(ev.intp, ev.incl).icon" class="tl-icon">{{ getIncidentIcon(ev.intp, ev.incl).icon }}</span>
                      <div class="tl-info">
                        <!-- Goal: player + assist -->
                        <template v-if="ev.intp === 'goal' || ev.intp === 'inGamePenalty'">
                          <span class="tl-player">{{ getPlayerName(ev) }}</span>
                          <span v-if="ev.ast1" class="tl-assist">🅰 {{ ev.ast1.na }}</span>
                          <span v-if="ev.desc" class="tl-desc">{{ ev.desc }}</span>
                        </template>
                        <!-- Card: player + reason -->
                        <template v-else-if="ev.intp === 'card'">
                          <span class="tl-player">{{ getPlayerName(ev) }}</span>
                          <span class="tl-card-type" :class="'card--' + ev.incl">{{ ev.incl === 'red' ? 'Red Card' : 'Yellow Card' }}</span>
                          <span v-if="ev.reas" class="tl-desc">{{ ev.reas }}</span>
                        </template>
                        <!-- Substitution: in / out -->
                        <template v-else-if="ev.intp === 'substitution'">
                          <span class="tl-player tl-sub-in">{{ ev.plin?.na }}</span>
                          <span class="tl-player tl-sub-out">{{ ev.plot?.na }}</span>
                        </template>
                        <!-- VAR -->
                        <template v-else-if="ev.intp === 'varDecision'">
                          <span class="tl-player">{{ getPlayerName(ev) }}</span>
                          <span class="tl-desc">{{ ev.incl }}</span>
                        </template>
                        <!-- Other -->
                        <template v-else>
                          <span class="tl-player">{{ getPlayerName(ev) || ev.text }}</span>
                          <span v-if="ev.desc" class="tl-desc">{{ ev.desc }}</span>
                        </template>
                      </div>
                    </div>
                  </div>

                  <div class="tl-marker">
                    <span class="tl-dot"></span>
                    <span class="tl-time-text">{{ ev.adtm && ev.adtm < 900 ? ev.time + '+' + ev.adtm : ev.time }}'</span>
                  </div>

                  <div class="tl-side tl-away">
                    <div v-if="ev.ihom === false" class="tl-bubble" :class="'tl-bubble--' + getIncidentIcon(ev.intp, ev.incl).cls">
                      <span v-if="getIncidentIcon(ev.intp, ev.incl).icon" class="tl-icon">{{ getIncidentIcon(ev.intp, ev.incl).icon }}</span>
                      <div class="tl-info">
                        <!-- Goal: player + assist -->
                        <template v-if="ev.intp === 'goal' || ev.intp === 'inGamePenalty'">
                          <span class="tl-player">{{ getPlayerName(ev) }}</span>
                          <span v-if="ev.ast1" class="tl-assist">🅰 {{ ev.ast1.na }}</span>
                          <span v-if="ev.desc" class="tl-desc">{{ ev.desc }}</span>
                        </template>
                        <!-- Card: player + reason -->
                        <template v-else-if="ev.intp === 'card'">
                          <span class="tl-player">{{ getPlayerName(ev) }}</span>
                          <span class="tl-card-type" :class="'card--' + ev.incl">{{ ev.incl === 'red' ? 'Red Card' : 'Yellow Card' }}</span>
                          <span v-if="ev.reas" class="tl-desc">{{ ev.reas }}</span>
                        </template>
                        <!-- Substitution: in / out -->
                        <template v-else-if="ev.intp === 'substitution'">
                          <span class="tl-player tl-sub-in">{{ ev.plin?.na }}</span>
                          <span class="tl-player tl-sub-out">{{ ev.plot?.na }}</span>
                        </template>
                        <!-- VAR -->
                        <template v-else-if="ev.intp === 'varDecision'">
                          <span class="tl-player">{{ getPlayerName(ev) }}</span>
                          <span class="tl-desc">{{ ev.incl }}</span>
                        </template>
                        <!-- Other -->
                        <template v-else>
                          <span class="tl-player">{{ getPlayerName(ev) || ev.text }}</span>
                          <span v-if="ev.desc" class="tl-desc">{{ ev.desc }}</span>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </section>

          <!-- Commentary -->
          <section v-if="commentary.length" class="section">
            <h3 class="section-title">Commentary</h3>
            <div v-for="c in commentary" :key="c.seq" class="comm-row">
              <span class="comm-type">{{ c.type }}</span>
              <span class="comm-player" v-if="c.plyr?.na">{{ c.plyr.na }}</span>
              <span class="comm-text">{{ c.text }}</span>
            </div>
          </section>
        </el-tab-pane>

        <el-tab-pane label="Lineups" name="lineups">
          <div v-if="!lineups" class="empty">No lineup data</div>
          <div v-else class="lineups-page">
            <!-- Team headers -->
            <div class="lineups-headers">
              <div class="lineups-header-item">
                <span class="lh-name">{{ info.hnam }}</span>
                <span v-if="lineups.hform" class="lh-form">{{ lineups.hform }}</span>
              </div>
              <div class="lineups-header-item">
                <span class="lh-name">{{ info.anam }}</span>
                <span v-if="lineups.aform" class="lh-form">{{ lineups.aform }}</span>
              </div>
            </div>

            <!-- SVG Pitch -->
            <div class="pitch-svg-wrap">
              <svg viewBox="0 0 1000 650" class="pitch-svg" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grassStripes" patternUnits="userSpaceOnUse" width="50" height="650">
                    <rect x="0" y="0" width="25" height="650" fill="rgba(255,255,255,0.025)" />
                  </pattern>
                </defs>

                <!-- Grass base -->
                <rect x="0" y="0" width="1000" height="650" rx="8" fill="#388E3C" />
                <rect x="0" y="0" width="1000" height="650" rx="8" fill="url(#grassStripes)" />

                <!-- Field border -->
                <rect x="6" y="6" width="988" height="638" rx="4" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2.5" />

                <!-- Center line -->
                <line x1="500" y1="6" x2="500" y2="644" stroke="rgba(255,255,255,0.8)" stroke-width="2.5" />
                <!-- Center circle -->
                <circle cx="500" cy="325" r="90" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" />
                <!-- Center dot -->
                <circle cx="500" cy="325" r="4" fill="rgba(255,255,255,0.9)" />

                <!-- Left penalty area -->
                <rect x="6" y="130" width="160" height="390" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" />
                <!-- Left goal area -->
                <rect x="6" y="222" width="55" height="206" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" />
                <!-- Left penalty spot -->
                <circle cx="115" cy="325" r="4" fill="rgba(255,255,255,0.9)" />
                <!-- Left penalty arc -->
                <path d="M 166 285 A 90 90 0 0 1 166 365" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" />

                <!-- Right penalty area -->
                <rect x="834" y="130" width="160" height="390" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" />
                <!-- Right goal area -->
                <rect x="939" y="222" width="55" height="206" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" />
                <!-- Right penalty spot -->
                <circle cx="885" cy="325" r="4" fill="rgba(255,255,255,0.9)" />
                <!-- Right penalty arc -->
                <path d="M 834 285 A 90 90 0 0 0 834 365" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" />

                <!-- Goal nets -->
                <rect x="0" y="278" width="14" height="94" rx="2" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.7)" stroke-width="2" />
                <rect x="986" y="278" width="14" height="94" rx="2" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.7)" stroke-width="2" />

                <!-- Corner arcs -->
                <path d="M 40 6 A 34 34 0 0 0 6 40" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" />
                <path d="M 40 644 A 34 34 0 0 1 6 610" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" />
                <path d="M 960 6 A 34 34 0 0 1 994 40" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" />
                <path d="M 960 644 A 34 34 0 0 0 994 610" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2" />

                <!-- HOME players (left half, blue) -->
                <g v-for="p in getPositionedPlayers(lineups.home, 'home')" :key="'hp'+p.shnm">
                  <circle :cx="p._x" :cy="p._y" r="13" fill="#1565C0" stroke="#fff" stroke-width="2" />
                  <text :x="p._x" :y="p._y + 1" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" style="font-variant-numeric: tabular-nums;">{{ p.shnm }}</text>
                  <text :x="p._x" :y="p._y + 26" text-anchor="middle" font-size="7.5" fill="#fff" style="text-shadow: 0 1px 2px rgba(0,0,0,0.8);">{{ p.player?.na?.split(' ').pop() }}</text>
                  <polygon v-if="p.capt" :points="(p._x-10)+','+(p._y-4)+' '+(p._x+10)+','+(p._y-4)+' '+(p._x)+','+(p._y-11)" fill="#FFC107" />
                </g>

                <!-- AWAY players (right half, red) -->
                <g v-for="p in getPositionedPlayers(lineups.away, 'away')" :key="'ap'+p.shnm">
                  <circle :cx="p._x" :cy="p._y" r="13" fill="#C62828" stroke="#fff" stroke-width="2" />
                  <text :x="p._x" :y="p._y + 1" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" style="font-variant-numeric: tabular-nums;">{{ p.shnm }}</text>
                  <text :x="p._x" :y="p._y + 26" text-anchor="middle" font-size="7.5" fill="#fff" style="text-shadow: 0 1px 2px rgba(0,0,0,0.8);">{{ p.player?.na?.split(' ').pop() }}</text>
                  <polygon v-if="p.capt" :points="(p._x-10)+','+(p._y-4)+' '+(p._x+10)+','+(p._y-4)+' '+(p._x)+','+(p._y-11)" fill="#FFC107" />
                </g>
              </svg>
            </div>

            <!-- Substitutes for both teams side by side -->
            <div class="lineups-subs-wrap">
              <div class="lineups-subs">
                <div class="subs-header">{{ info.hnam }} — Substitutes</div>
                <div class="subs-list">
                  <span v-for="p in getSubstitutes(lineups.home)" :key="'hs'+p.shnm" class="sub-item">{{ p.shnm }} {{ p.player?.na }}</span>
                </div>
              </div>
              <div class="lineups-subs">
                <div class="subs-header">{{ info.anam }} — Substitutes</div>
                <div class="subs-list">
                  <span v-for="p in getSubstitutes(lineups.away)" :key="'as'+p.shnm" class="sub-item">{{ p.shnm }} {{ p.player?.na }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="H2H" name="h2h">
          <div v-if="!h2h.length" class="empty">No H2H data available</div>
          <div v-else class="h2h-table-wrap">
            <table class="h2h-table">
              <thead>
                <tr>
                  <th class="h2h-th-date">Date</th>
                  <th class="h2h-th-tour">Tournament</th>
                  <th class="h2h-th-home">Home</th>
                  <th class="h2h-th-score">Score</th>
                  <th class="h2h-th-away">Away</th>
                  <th class="h2h-th-seas">Season</th>
                  <th class="h2h-th-result">Result</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ev in h2h" :key="ev.id || ev.slug" class="h2h-tr" @click="goH2hDetail(ev.id)">
                  <td class="h2h-td-date">{{ ev.stms ? new Date(ev.stms * 1000).toLocaleDateString() : '-' }}</td>
                  <td class="h2h-td-tour">{{ ev.tour?.name || '-' }}</td>
                  <td class="h2h-td-home">{{ ev.htea?.name || '-' }}</td>
                  <td class="h2h-td-score">
                    <template v-if="ev.hscr?.current != null && ev.ascr?.current != null">
                      <span class="h2h-score-ft">{{ ev.hscr.current }} - {{ ev.ascr.current }}</span>
                      <span v-if="ev.hscr.period1 != null || ev.ascr.period1 != null" class="h2h-score-ht">({{ ev.hscr.period1 ?? 0 }} - {{ ev.ascr.period1 ?? 0 }})</span>
                    </template>
                    <template v-else>-</template>
                  </td>
                  <td class="h2h-td-away">{{ ev.atea?.name || '-' }}</td>
                  <td class="h2h-td-seas">{{ ev.seas?.name || '-' }}</td>
                  <td class="h2h-td-result">
                    <template v-if="ev.wncd != null && ev.stat?.type === 'finished'">
                      <!-- W/D/L from current home team's perspective -->
                      <template v-if="info.hnam === ev.htea?.name">
                        <span v-if="ev.wncd === 1" class="h2h-result result--w">W</span>
                        <span v-else-if="ev.wncd === 2" class="h2h-result result--d">D</span>
                        <span v-else class="h2h-result result--l">L</span>
                      </template>
                      <template v-else>
                        <span v-if="ev.wncd === 2" class="h2h-result result--d">D</span>
                        <span v-else-if="ev.wncd === 1" class="h2h-result result--l">L</span>
                        <span v-else class="h2h-result result--w">W</span>
                      </template>
                    </template>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
    <div v-else class="error">Failed to load match data</div>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}

.loading, .error, .empty {
  text-align: center;
  padding: 60px 0;
  color: #888;
  font-size: 14px;
}

.match-hero {
  margin-bottom: 20px;
  padding: 16px 20px;
  background: #1a1a1a;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
}

/* Top bar */
.hero-top {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 16px;
}
.back-btn {
  cursor: pointer;
  font-size: 13px; color: #4fc3f7;
  flex-shrink: 0;
}
.back-btn:hover { opacity: 0.8; }
.hero-league {
  font-size: 14px; color: #aaa; font-weight: 500;
  flex: 1; text-align: center;
}
.round {
  font-size: 12px; color: #666;
  flex-shrink: 0;
}

/* Teams + score */
.hero-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.hero-team { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.hero-home { text-align: center; }
.hero-away { text-align: center; }
.hero-logo { width: 48px; height: 48px; object-fit: contain; border-radius: 50%; background: #252525; }
.hero-name { font-size: 14px; font-weight: 600; color: #ddd; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hero-score { display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
.hero-score-main { font-size: 28px; font-weight: 800; color: #fff; letter-spacing: 2px; font-variant-numeric: tabular-nums; }
.hero-score-sub { font-size: 13px; color: #666; }
.hero-status { font-size: 13px; font-weight: 600; color: #888; margin-top: 2px; }
.hero-status.live { color: #4fc3f7; animation: pulse 1.5s ease-in-out infinite; }
.hero-status.ht { color: #e6a23c; }

/* Info strip */
.hero-info-strip {
  display: flex; justify-content: center; align-items: center; gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #2a2a2a;
}
.hi-item { font-size: 12px; color: #aaa; }
.hi-sep { font-size: 12px; color: #444; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.detail-tabs { --el-tabs-header-height: 36px; }
.detail-tabs :deep(.el-tabs__item) { color: #666; font-size: 13px; }
.detail-tabs :deep(.el-tabs__item.is-active) { color: #4fc3f7; }
.detail-tabs :deep(.el-tabs__active-bar) { background-color: #4fc3f7; }
.detail-tabs :deep(.el-tabs__nav-wrap::after) { background-color: #2a2a2a; height: 1px; }

.section { margin: 20px 0; }
.section-title { font-size: 15px; font-weight: 600; color: #aaa; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #2a2a2a; }

.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #2a2a2a; border-radius: 8px; overflow: hidden; }
.info-item { display: flex; justify-content: space-between; padding: 10px 14px; background: #1a1a1a; font-size: 13px; color: #ddd; }
.info-label { color: #888; font-size: 12px; }

.stats-bar-list { display: flex; flex-direction: column; gap: 16px; }
.stats-group-name { font-size: 12px; color: #4fc3f7; margin-bottom: 8px; font-weight: 600; }
.stats-bar-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.stats-name { flex: 1; text-align: center; font-size: 12px; color: #aaa; }
.stats-home { text-align: right; min-width: 30px; }
.stats-away { text-align: left; min-width: 30px; }
.stats-val { font-size: 13px; color: #ddd; font-weight: 600; }

.timeline { position: relative; padding: 12px 0; }
.timeline::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 0; bottom: 0;
  width: 2px;
  background: #2a2a2a;
  transform: translateX(-50%);
}
.tl-row { display: flex; align-items: flex-start; }
.tl-row + .tl-row { margin-top: 4px; }
.tl-side { flex: 1; padding: 0 20px; display: flex; flex-direction: column; }
.tl-home { align-items: flex-end; }
.tl-away { align-items: flex-start; }

/* Hollow dot */
.tl-marker {
  position: relative;
  display: flex; flex-direction: column; align-items: center;
  min-width: 32px; padding: 6px 0; z-index: 1;
}
.tl-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  border: 2px solid #4fc3f7;
  background: #1a1a1a;
  flex-shrink: 0;
  margin-top: 6px;
}
.tl-time-text {
  font-size: 11px; font-weight: 700; color: #4fc3f7;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}

/* Bubble card */
.tl-bubble {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: #1e1e1e;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  max-width: 280px;
  position: relative;
}
/* Arrow toward timeline */
.tl-home .tl-bubble::after {
  content: "";
  position: absolute;
  right: -7px; top: 12px;
  width: 0; height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 7px solid #2a2a2a;
}
.tl-away .tl-bubble::before {
  content: "";
  position: absolute;
  left: -7px; top: 12px;
  width: 0; height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 7px solid #2a2a2a;
}

.tl-icon { font-size: 16px; flex-shrink: 0; line-height: 1; }
.tl-info { display: flex; flex-direction: column; gap: 2px; }
.tl-home .tl-info { text-align: right; }
.tl-away .tl-info { text-align: left; }
.tl-player { font-size: 13px; color: #ddd; font-weight: 600; }
.tl-desc { font-size: 11px; color: #888; }

/* Assist */
.tl-assist { font-size: 11px; color: #4fc3f7; }

/* Card type label */
.tl-card-type { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 3px; }
.card--yellow { color: #f4c542; background: rgba(244,197,66,0.12); }
.card--red { color: #e53935; background: rgba(229,57,53,0.12); }

/* Substitution IN/OUT */
.tl-sub-in { color: #4caf50; }
.tl-sub-out { color: #e53935; text-decoration: line-through; }

/* Period separator (HT/FT) */
.tl-period {
  display: flex; justify-content: center; align-items: center; gap: 12px;
  padding: 10px 0; margin: 4px 0;
}
.tl-period-text {
  font-size: 13px; font-weight: 700; color: #4fc3f7;
  background: rgba(79,195,247,0.1); padding: 4px 14px; border-radius: 12px;
}
.tl-period-score { font-size: 14px; font-weight: 700; color: #ddd; }

/* Injury time announcement */
.tl-injury {
  text-align: center;
  font-size: 11px; color: #e6a23c; font-weight: 600;
  padding: 4px 0;
}

/* Incident type colors */
.tl-bubble--goal { border-left: 3px solid #4caf50; }
.tl-bubble--penalty { border-left: 3px solid #ff9800; }
.tl-bubble--yellow { border-left: 3px solid #f4c542; }
.tl-bubble--red { border-left: 3px solid #e53935; }
.tl-bubble--own { border-left: 3px solid #e53935; }
.tl-bubble--sub { border-left: 3px solid #42a5f5; }
.tl-bubble--var { border-left: 3px solid #ab47bc; }
.tl-bubble--miss { border-left: 3px solid #999; }
.tl-bubble--other { border-left: 3px solid #666; }

.tl-home .tl-bubble--goal,
.tl-home .tl-bubble--penalty,
.tl-home .tl-bubble--yellow,
.tl-home .tl-bubble--red,
.tl-home .tl-bubble--own,
.tl-home .tl-bubble--sub,
.tl-home .tl-bubble--var,
.tl-home .tl-bubble--miss,
.tl-home .tl-bubble--other {
  border-left: none;
  border-right: 3px solid;
}
.tl-home .tl-bubble--goal { border-right-color: #4caf50; }
.tl-home .tl-bubble--penalty { border-right-color: #ff9800; }
.tl-home .tl-bubble--yellow { border-right-color: #f4c542; }
.tl-home .tl-bubble--red { border-right-color: #e53935; }
.tl-home .tl-bubble--own { border-right-color: #e53935; }
.tl-home .tl-bubble--sub { border-right-color: #42a5f5; }
.tl-home .tl-bubble--var { border-right-color: #ab47bc; }
.tl-home .tl-bubble--miss { border-right-color: #999; }
.tl-home .tl-bubble--other { border-right-color: #666; }

.comm-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; border-bottom: 1px solid #1a1a1a; font-size: 13px; }
.comm-type { color: #888; font-size: 11px; min-width: 40px; flex-shrink: 0; }
.comm-player { color: #ddd; font-weight: 500; flex-shrink: 0; }
.comm-text { color: #ccc; }

/* H2H table */
.h2h-table-wrap { overflow-x: auto; }
.h2h-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.h2h-table thead th {
  position: sticky; top: 0;
  padding: 8px 10px; font-size: 11px; font-weight: 600;
  color: #888; text-align: left; white-space: nowrap;
  border-bottom: 2px solid #2a2a2a; background: #0f0f0f;
}
.h2h-th-home, .h2h-th-away { text-align: center; }
.h2h-th-score { text-align: center; width: 60px; }
.h2h-th-date { width: 85px; }
.h2h-th-seas { width: 65px; }
.h2h-th-result { text-align: center; width: 80px; }

.h2h-tr { transition: background 0.15s; cursor: pointer; }
.h2h-tr:hover { background: rgba(79,195,247,0.06); }
.h2h-td {
  padding: 9px 10px; border-bottom: 1px solid #1a1a1a;
  color: #ddd; white-space: nowrap;
}
.h2h-td-date { color: #aaa; font-size: 12px; }
.h2h-td-tour { color: #888; font-size: 12px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.h2h-td-home, .h2h-td-away { text-align: center; font-weight: 600; }
.h2h-td-score { text-align: center; }
.h2h-score-ft {
  font-weight: 700; color: #fff;
  font-variant-numeric: tabular-nums; font-size: 14px;
}
.h2h-score-ht {
  font-size: 11px; color: #666; margin-left: 4px;
}
.h2h-td-seas { color: #666; font-size: 12px; }
.h2h-td-result { text-align: center; }
.h2h-result {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
  color: #888; background: #252525;
}
.result--w { color: #4caf50; background: rgba(76,175,80,0.1); }
.result--l { color: #e53935; background: rgba(229,57,53,0.1); }
.result--d { color: #f4c542; background: rgba(244,197,66,0.1); }

/* ---- Lineups page ---- */
.lineups-page { display: flex; flex-direction: column; gap: 16px; }

.lineups-headers {
  display: flex; justify-content: space-between; align-items: center;
  max-width: 700px; margin: 0 auto; width: 100%;
}
.lineups-header-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.lh-name { font-size: 14px; font-weight: 700; color: #ddd; }
.lh-form {
  font-size: 12px; color: #4fc3f7; font-weight: 600;
  background: rgba(79,195,247,0.1); padding: 2px 10px; border-radius: 4px;
}

/* SVG pitch */
.pitch-svg-wrap {
  max-width: 700px;
  margin: 0 auto;
  width: 100%;
}
.pitch-svg {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}

/* ---- Substitutes ---- */
.lineups-subs-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.lineups-subs { display: flex; flex-direction: column; }
.subs-header {
  font-size: 12px; color: #aaa; font-weight: 600;
  margin-bottom: 6px;
}
.subs-list {
  display: flex; flex-wrap: wrap; gap: 4px;
  padding: 8px; background: #1a1a1a; border-radius: 6px;
}
.sub-item {
  font-size: 11px; color: #888;
  padding: 2px 8px; background: #252525; border-radius: 4px;
}
</style>

<style>
html:not(.dark) .detail-page .loading,
html:not(.dark) .detail-page .error,
html:not(.dark) .detail-page .empty { color: #999; }

html:not(.dark) .match-hero {
  background: #fff;
  border-color: #e0e0e0;
}
html:not(.dark) .hero-top { border-color: #eee; }
html:not(.dark) .hero-league { color: #666; }
html:not(.dark) .round { color: #999; }
html:not(.dark) .hero-logo { background: #f0f0f0; }
html:not(.dark) .hero-name { color: #333; }
html:not(.dark) .hero-score-main { color: #222; }
html:not(.dark) .hero-score-sub { color: #999; }
html:not(.dark) .hero-status { color: #666; }
html:not(.dark) .hero-status.live { color: #0d8cc4; }
html:not(.dark) .hero-status.ht { color: #e6a23c; }
html:not(.dark) .hero-info-strip { border-top-color: #eee; }
html:not(.dark) .hi-item { color: #666; }
html:not(.dark) .hi-sep { color: #ccc; }

html:not(.dark) .section-title {
  color: #666;
  border-bottom-color: #e0e0e0;
}

html:not(.dark) .info-grid { background: #e0e0e0; }
html:not(.dark) .info-item {
  background: #fafafa;
  color: #333;
}
html:not(.dark) .info-label { color: #999; }

html:not(.dark) .stats-group-name { color: #0d8cc4; }
html:not(.dark) .stats-name { color: #666; }
html:not(.dark) .stats-val { color: #333; }

html:not(.dark) .timeline::before { background: #e0e0e0; }
html:not(.dark) .tl-dot {
  background: #fafafa;
  border-color: #0d8cc4;
}
html:not(.dark) .tl-bubble {
  background: #fafafa;
  border-color: #e0e0e0;
}
html:not(.dark) .tl-home .tl-bubble::after { border-left-color: #e0e0e0; }
html:not(.dark) .tl-away .tl-bubble::before { border-right-color: #e0e0e0; }
html:not(.dark) .tl-player { color: #333; }
html:not(.dark) .tl-desc { color: #999; }
html:not(.dark) .tl-period-score { color: #333; }
html:not(.dark) .card--yellow { background: rgba(244,197,66,0.15); }
html:not(.dark) .card--red { background: rgba(229,57,53,0.1); }

html:not(.dark) .comm-row { border-bottom-color: #eee; }
html:not(.dark) .comm-player { color: #333; }
html:not(.dark) .comm-text { color: #555; }

html:not(.dark) .h2h-table thead th {
  color: #666; border-bottom-color: #e0e0e0; background: #fafafa;
}
html:not(.dark) .h2h-td {
  color: #333; border-bottom-color: #eee;
}
html:not(.dark) .h2h-td-date { color: #666; }
html:not(.dark) .h2h-td-tour { color: #888; }
html:not(.dark) .h2h-score-ft { color: #222; }
html:not(.dark) .h2h-score-ht { color: #999; }
html:not(.dark) .h2h-td-seas { color: #999; }
html:not(.dark) .h2h-result { background: #f0f0f0; color: #888; }
html:not(.dark) .h2h-tr:hover { background: rgba(13,140,196,0.04); }

html:not(.dark) .lh-name { color: #333; }

html:not(.dark) .subs-header { color: #666; }
html:not(.dark) .subs-list { background: #f5f5f5; }
html:not(.dark) .sub-item {
  color: #666;
  background: #e8e8e8;
}
</style>
