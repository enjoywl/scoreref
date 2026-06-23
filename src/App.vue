<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "./locales";

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

const { t, locale, setLocale } = useI18n();

const isDark = ref(true);

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("dark", isDark.value);
}

const statusCls: Record<number, string> = {
  1: "live",
  2: "ht",
  3: "ft",
};

const sports = computed(() => [
  { key: "football", label: t.value("sport.football") },
]);

function buildDateOptions() {
  const dates: { text: string; sub: string; value: string; isToday: boolean }[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    dates.push({
      text: getWeekday(d.getDay()),
      sub: month + "/" + day,
      value,
      isToday: i === 0,
    });
  }
  return dates;
}

function getWeekday(day: number) {
  return t.value("weekdays." + day);
}

const groupByOptions = computed(() => [
  { label: t.value("groupBy.league"), value: "league" },
  { label: t.value("groupBy.country"), value: "country" },
]);

const statusOptions = computed(() => [
  { label: t.value("status.all"), value: "" },
  { label: t.value("status.live"), value: "1" },
  { label: t.value("status.scheduled"), value: "0" },
  { label: t.value("status.finished"), value: "-1" },
]);

const activeSport = ref("football");
const matches = ref<MatchData[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const groupBy = ref<"league" | "country">("league");
const statusFilter = ref("1");
const dateOptions = buildDateOptions();
const selectedDate = ref(dateOptions[6].value);

onMounted(() => {
  fetchMatches();
});

watch([selectedDate, activeSport, statusFilter], () => {
  fetchMatches();
});

watch(locale, () => {
  dateOptions.length = 0;
  dateOptions.push(...buildDateOptions());
});

async function fetchMatches() {
  loading.value = true;
  error.value = null;
  try {
    const params = new URLSearchParams({ date: selectedDate.value });
    if (statusFilter.value) params.set("status", statusFilter.value);
    const res = await fetch(`/api/matches?${params}`);
    const json = await res.json();
    if (json.code === 200) {
      matches.value = json.data;
    } else {
      error.value = json.message || "Failed to load";
    }
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

const grouped = computed(() => {
  const map: Record<string, MatchData[]> = {};
  matches.value.forEach((m) => {
    const key = groupBy.value === "league" ? m.lnam : m.cty;
    (map[key] ||= []).push(m);
  });
  for (const list of Object.values(map)) {
    list.sort((a, b) => a.mtim - b.mtim);
  }
  return Object.entries(map);
});

function getStatusLabel(s: number) {
  if (s === 1) return t.value("match.live");
  if (s === 2) return t.value("match.ht");
  if (s === 3) return t.value("match.ft");
  return t.value("match.unknown");
}

function formatKickoff(ts: number) {
  const d = new Date(ts * 1000);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

function getMatchTime(m: MatchData) {
  if (m.stat === 1) {
    const elapsed = Math.floor((Date.now() - m.mtim * 1000) / 60000);
    return Math.max(0, elapsed) + "'";
  }
  return getStatusLabel(m.stat);
}
</script>

<template>
  <div class="banner">
    <div class="banner-content">
      <div class="banner-top">
        <div class="logo">
          <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.8 14.8 0 0 1 4 10 14.8 14.8 0 0 1-4 10A14.8 14.8 0 0 1 8 12 14.8 14.8 0 0 1 12 2z" />
            <path d="M2 12h20M2 12a14.8 14.8 0 0 0 4-4M2 12a14.8 14.8 0 0 1 4 4M22 12a14.8 14.8 0 0 1-4-4M22 12a14.8 14.8 0 0 0-4 4" />
          </svg>
          <span class="logo-text">SCOREREF</span>
        </div>
        <div class="banner-actions">
          <span class="theme-toggle" @click="toggleTheme">
            {{ isDark ? '☀' : '☾' }}
          </span>
          <span class="lang-switch" @click="setLocale(locale === 'en' ? 'zh-CN' : 'en')">
            {{ locale === 'en' ? '中文' : 'EN' }}
          </span>
        </div>
      </div>
      <el-tabs v-model="activeSport" class="sport-tabs">
        <el-tab-pane
          v-for="s in sports"
          :key="s.key"
          :label="s.label"
          :name="s.key"
        />
      </el-tabs>
    </div>
  </div>

  <div class="app">
    <div class="date-bar">
      <div
        v-for="d in dateOptions"
        :key="d.value"
        :class="['date-chip', { today: d.isToday, active: selectedDate === d.value }]"
        @click="selectedDate = d.value"
      >
        <span class="date-text">{{ d.text }}</span>
        <span class="date-sub">{{ d.sub }}</span>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <el-select
          v-model="groupBy"
          size="small"
          style="width: 110px"
        >
          <el-option
            v-for="o in groupByOptions"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>
        <div class="status-toggle">
          <span
            v-for="o in statusOptions"
            :key="o.value"
            :class="['status-opt', { active: statusFilter === o.value }]"
            @click="statusFilter = o.value"
          >{{ o.label }}</span>
        </div>
      </div>
      <span class="count">{{ t('count', { n: matches.length }) }}</span>
    </div>

    <div v-if="loading" class="loading">{{ t('loading') }}</div>
    <div v-else-if="error" class="error">{{ t('error') }}: {{ error }}</div>

    <template v-else>
    <section v-for="[group, list] in grouped" :key="group" class="group">
      <h2 class="group-title">
        <img
          v-if="list[0]?.lpc"
          :src="list[0].lpc"
          alt=""
          class="league-logo"
          loading="lazy"
          decoding="async"
        />
        {{ group }}
      </h2>

      <div class="match-list">
        <div v-for="m in list" :key="m.mid" class="match-card">
          <div class="match-body">
            <div class="match-meta">
              <span class="kickoff-time">{{ formatKickoff(m.mtim) }}</span>
              <span :class="['match-status', statusCls[m.stat]]">{{ getMatchTime(m) }}</span>
            </div>

            <div class="team team-left">
              <img :src="m.hpc" :alt="m.hnam" class="team-logo" loading="lazy" decoding="async" />
              <span class="team-name">{{ m.hnam }}</span>
            </div>

            <div class="score">
              <span class="score-main">{{ m.hscr }} - {{ m.ascr }}</span>
              <span class="score-ht">({{ m.hhsc }} - {{ m.ahsc }})</span>
            </div>

            <div class="team team-right">
              <img :src="m.apc" :alt="m.anam" class="team-logo" loading="lazy" decoding="async" />
              <span class="team-name">{{ m.anam }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    </template>
  </div>
</template>

<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
  min-height: 100vh;
  margin: 0;
}

html.dark body {
  background: #0f0f0f;
  color: #e0e0e0;
}
</style>

<style scoped>
.banner {
  background: #0f0f0f;
  padding: 12px 16px 0;
}

.banner-content {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.banner-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.logo-icon {
  width: 24px;
  height: 24px;
  color: #4fc3f7;
}

.logo-text {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 3px;
}

.sport-tabs {
  --el-tabs-header-height: 36px;
}

.sport-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.sport-tabs :deep(.el-tabs__item) {
  color: #666;
  font-size: 13px;
  font-weight: 500;
  height: 36px;
  line-height: 36px;
}

.sport-tabs :deep(.el-tabs__item.is-active) {
  color: #4fc3f7;
  font-weight: 600;
}

.sport-tabs :deep(.el-tabs__active-bar) {
  background-color: #4fc3f7;
  height: 2px;
}

.sport-tabs :deep(.el-tabs__nav-wrap::after) {
  background-color: #2a2a2a;
  height: 1px;
}

.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}

.date-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.date-bar::-webkit-scrollbar {
  display: none;
}

.date-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 52px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

.date-chip:hover {
  background: #1a1a1a;
}

.date-chip.active {
  background: #4fc3f7;
}

.date-chip.today:not(.active) {
  background: #1a2a3a;
}

.date-text {
  font-size: 12px;
  color: #888;
}

.date-chip.active .date-text {
  color: #fff;
  font-weight: 600;
}

.date-chip.today:not(.active) .date-text {
  color: #4fc3f7;
}

.date-sub {
  font-size: 11px;
  color: #666;
  margin-top: 1px;
}

.date-chip.active .date-sub {
  color: rgba(255, 255, 255, 0.8);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #2a2a2a;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-toggle {
  display: flex;
  background: #1a1a1a;
  border-radius: 6px;
  padding: 2px;
}

.status-opt {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  color: #888;
  transition: all 0.2s;
  white-space: nowrap;
}

.status-opt:hover {
  color: #ccc;
}

.status-opt.active {
  background: #4fc3f7;
  color: #fff;
  font-weight: 600;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.theme-toggle {
  font-size: 16px;
  color: #888;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
  line-height: 1;
}

.theme-toggle:hover {
  color: #f4c542;
}

.lang-switch {
  font-size: 12px;
  color: #666;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.lang-switch:hover {
  color: #4fc3f7;
}

.count {
  font-size: 13px;
  color: #888;
  background: #1a1a1a;
  padding: 4px 10px;
  border-radius: 12px;
}

.group {
  margin-bottom: 18px;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: #aaa;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.league-logo {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border-radius: 4px;
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.match-card {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 10px 14px;
  border: 1px solid #2a2a2a;
  transition: border-color 0.2s;
}

.match-card:hover {
  border-color: #444;
}

.match-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
  min-width: 55px;
}

.kickoff-time {
  font-size: 12px;
  color: #aaa;
  font-variant-numeric: tabular-nums;
}

.match-status {
  font-size: 12px;
  font-weight: 600;
  color: #888;
}

.match-status.live {
  color: #4fc3f7;
  animation: pulse 1.5s ease-in-out infinite;
}

.match-status.ht {
  color: #e6a23c;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.match-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.team {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-left {
  justify-content: flex-end;
  text-align: right;
}

.team-right {
  justify-content: flex-start;
  text-align: left;
}

.team-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
  border-radius: 50%;
  background: #252525;
  flex-shrink: 0;
}

.team-name {
  font-size: 12px;
  font-weight: 500;
  color: #ddd;
}

.score {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 65px;
  flex-shrink: 0;
}

.score-main {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1px;
  font-variant-numeric: tabular-nums;
}

.score-ht {
  font-size: 11px;
  color: #666;
  margin-top: -2px;
}

.loading {
  text-align: center;
  padding: 60px 0;
  color: #888;
  font-size: 16px;
}

.error {
  text-align: center;
  padding: 60px 0;
  color: #e53935;
  font-size: 16px;
}

@media (max-width: 600px) {
  .app {
    padding: 12px;
  }

  .date-chip {
    min-width: 44px;
    padding: 4px 8px;
  }

  .team-name {
    font-size: 11px;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .score-main {
    font-size: 16px;
  }

  .team-logo {
    width: 20px;
    height: 20px;
  }

  .match-card {
    padding: 8px 10px;
  }
}
</style>

<style>
html:not(.dark) .banner {
  background: #f5f5f5;
}

html:not(.dark) .logo-text {
  color: #333;
}

html:not(.dark) .sport-tabs .el-tabs__item {
  color: #999;
}

html:not(.dark) .sport-tabs .el-tabs__item.is-active {
  color: #0d8cc4;
}

html:not(.dark) .sport-tabs .el-tabs__nav-wrap::after {
  background-color: #e0e0e0;
}

html:not(.dark) .group-title {
  color: #666;
}

html:not(.dark) .match-card {
  background: #fff;
  border-color: #e8e8e8;
}

html:not(.dark) .match-card:hover {
  border-color: #bbb;
}

html:not(.dark) .toolbar {
  border-bottom-color: #e0e0e0;
}

html:not(.dark) .count {
  background: #eee;
  color: #666;
}

html:not(.dark) .status-toggle {
  background: #eee;
}

html:not(.dark) .status-opt {
  color: #999;
}

html:not(.dark) .status-opt:hover {
  color: #333;
}

html:not(.dark) .status-opt.active {
  background: #0d8cc4;
  color: #fff;
}

html:not(.dark) .date-chip:hover {
  background: #eee;
}

html:not(.dark) .date-chip.active {
  background: #0d8cc4;
}

html:not(.dark) .date-chip.today:not(.active) {
  background: #e3f2fd;
}

html:not(.dark) .date-chip.today:not(.active) .date-text {
  color: #0d8cc4;
}

html:not(.dark) .date-text {
  color: #999;
}

html:not(.dark) .date-sub {
  color: #aaa;
}

html:not(.dark) .kickoff-time {
  color: #666;
}

html:not(.dark) .match-status {
  color: #666;
}

html:not(.dark) .match-status.live {
  color: #0d8cc4;
}

html:not(.dark) .match-status.ht {
  color: #e6a23c;
}

html:not(.dark) .team-name {
  color: #333;
}

html:not(.dark) .team-logo {
  background: #eee;
}

html:not(.dark) .score-main {
  color: #222;
}

html:not(.dark) .score-ht {
  color: #999;
}

html:not(.dark) .loading {
  color: #999;
}

html:not(.dark) .theme-toggle {
  color: #999;
}

html:not(.dark) .theme-toggle:hover {
  color: #f4a700;
}

html:not(.dark) .lang-switch {
  color: #999;
}

html:not(.dark) .lang-switch:hover {
  color: #0d8cc4;
}
</style>
