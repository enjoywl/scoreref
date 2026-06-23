<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "./locales";

const { t, locale, setLocale } = useI18n();

const isDark = ref(true);
document.documentElement.classList.add("dark");

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("dark", isDark.value);
}

const sports = computed(() => [
  { key: "football", label: t.value("sport.football") },
]);

const activeSport = ref("football");
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

  <router-view />

  <footer class="footer">
    <div class="footer-content">
      <p class="footer-desc">This system is currently under development. Data accuracy and real-time updates are still being improved.</p>
      <p>Contact: <a href="mailto:exprify@gmail.com">exprify@gmail.com</a></p>
    </div>
  </footer>
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

.footer {
  text-align: center;
  padding: 32px 16px 24px;
  font-size: 13px;
  color: #999;
  background: #1a1a1a;
  margin-top: 40px;
  border-top: 1px solid #2a2a2a;
}

.footer-desc {
  margin: 0 0 12px;
  font-size: 12px;
  color: #aaa;
}

html.dark .footer-desc {
  color: #555;
}

.footer a {
  color: #4fc3f7;
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}

html:not(.dark) .footer {
  background: #e8e8e8;
  border-top-color: #d0d0d0;
  color: #888;
}

html.dark .footer {
  color: #666;
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
