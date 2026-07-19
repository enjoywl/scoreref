import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppRouter from "./router";
import { useI18n, getApiLanguage } from "./locales";
import { useTimezone, TIMEZONE_OPTIONS } from "./lib/timezone";
import { api } from "./lib/api";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "\u4E2D\u6587" },
  { code: "jp", label: "\u65E5\u672C\u8A9E" },
  { code: "ko", label: "\uD55C\uAD6D\uC5B4" },
  { code: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629" },
  { code: "es", label: "Espa\u00F1ol" },
  { code: "fr", label: "Fran\u00E7ais" },
  { code: "hi", label: "\u0939\u093F\u0928\u094D\u0926\u0940" },
  { code: "pt", label: "Portugu\u00EAs" },
];

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const { timezone, setTimezone } = useTimezone();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    api.setLanguage(getApiLanguage(locale));
  }, [locale]);

  function toggleTheme() {
    setIsDark(!isDark);
  }

  const sports = useMemo(
    () => [{ key: "football", label: t("sport.football") }],
    [t],
  );

  return (
    <>
      <header className="bg-surface pt-3 relative shadow-sm">
        <div className="max-w-[1200px] mx-auto px-4">
          {/* Top row: logo + toggles */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-3">
              <svg className="w-7 h-7 text-[#4fc3f7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.8 14.8 0 0 1 4 10 14.8 14.8 0 0 1-4 10A14.8 14.8 0 0 1 8 12 14.8 14.8 0 0 1 12 2z" />
                <path d="M2 12h20M2 12a14.8 14.8 0 0 0 4-4M2 12a14.8 14.8 0 0 1 4 4M22 12a14.8 14.8 0 0 1-4-4M22 12a14.8 14.8 0 0 0-4 4" />
              </svg>
              <span className="text-lg font-extrabold tracking-[4px] bg-gradient-to-br from-[#4fc3f7] to-[#81d4fa] bg-clip-text text-transparent">
                SCOREREF
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="text-xs bg-transparent text-text-muted border border-border rounded px-2 py-0.5 outline-none cursor-pointer max-w-[150px]"
                title={t("timezone")}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <button
                onClick={toggleTheme}
                className="text-lg text-text-muted hover:text-[#f4c542] px-1.5 py-0.5 rounded transition-colors cursor-pointer"
              >
                {isDark ? "\u2600" : "\u263E"}
              </button>
              <select
                value={locale}
                onChange={(e) => {
                  const newLocale = e.target.value;
                  setLocale(newLocale);
                  api.setLanguage(getApiLanguage(newLocale));
                }}
                className="text-xs bg-surface-muted text-text-primary border border-border rounded px-2 py-0.5 outline-none cursor-pointer"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sport tabs */}
          <div className="flex gap-0">
            {sports.map((s) => (
              <button
                key={s.key}
                onClick={() => navigate("/?status=1")}
                className="text-sm font-semibold text-accent pb-2 border-b-2 border-accent h-10 leading-10 cursor-pointer flex items-center gap-1.5"
              >
                <svg className="w-5 h-5" viewBox="-2500 -2500 5000 5000" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <title>soccer ball</title>
                  <g stroke="currentColor" strokeWidth="200">
                    <circle fill="none" r="2376"/>
                    <path d="m-1643-1716 155 158m-550 2364c231 231 538 195 826 202m-524-2040c-491 351-610 1064-592 1060m1216-1008c-51 373 84 783 364 1220m-107-2289c157-157 466-267 873-329m-528 4112c-50 132-37 315-8 510m62-3883c282 32 792 74 1196 303m-404 2644c310 173 649 247 1060 180m-340-2008c-242 334-534 645-872 936m1109-2119c-111-207-296-375-499-534m1146 1281c100 3 197 44 290 141m-438 495c158 297 181 718 204 1140"/>
                  </g>
                  <path fill="currentColor" d="m-1624-1700c243-153 498-303 856-424 141 117 253 307 372 492-288 275-562 544-724 756-274-25-410-2-740-60 3-244 84-499 236-764zm2904-40c271 248 537 498 724 788-55 262-105 553-180 704-234-35-536-125-820-200-138-357-231-625-340-924 210-156 417-296 616-368zm-3273 3033a2376 2376 0 0 1-378-1392l59-7c54 342 124 674 311 928-36 179-2 323 51 458zm1197-1125c365 60 717 120 1060 180 106 333 120 667 156 1000-263 218-625 287-944 420-372-240-523-508-736-768 122-281 257-561 464-832zm3013 678a2376 2376 0 0 1-925 1147l-116-5c84-127 114-297 118-488 232-111 464-463 696-772 86 30 159 72 227 118zm-2287 1527a2376 2376 0 0 1-993-251c199 74 367 143 542 83 53 75 176 134 451 168z"/>
                </svg>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <AppRouter />

      <footer className="text-center py-8 px-4 text-[13px] text-text-muted bg-surface mt-10 border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-xs text-text-muted mb-3">
            This system is currently under development. Data accuracy and real-time updates are still being improved.
          </p>
          <p>
            Contact:{" "}
            <a href="mailto:exprify@gmail.com" className="text-accent no-underline hover:underline">
              exprify@gmail.com
            </a>
          </p>
        </div>
      </footer>
    </>
  );
}
