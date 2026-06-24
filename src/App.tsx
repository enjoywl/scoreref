import { useState, useEffect, useMemo } from "react";
import AppRouter from "./router";
import { useI18n } from "./locales";

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  function toggleTheme() {
    setIsDark(!isDark);
  }

  const sports = useMemo(
    () => [{ key: "football", label: t("sport.football") }],
    [t],
  );

  return (
    <>
      <header className="bg-app-bg px-4 pt-3 relative border-t-2 border-t-accent">
        <div className="max-w-[1200px] mx-auto">
          {/* Top row: logo + toggles */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <svg className="w-6 h-6 text-[#4fc3f7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.8 14.8 0 0 1 4 10 14.8 14.8 0 0 1-4 10A14.8 14.8 0 0 1 8 12 14.8 14.8 0 0 1 12 2z" />
                <path d="M2 12h20M2 12a14.8 14.8 0 0 0 4-4M2 12a14.8 14.8 0 0 1 4 4M22 12a14.8 14.8 0 0 1-4-4M22 12a14.8 14.8 0 0 0-4 4" />
              </svg>
              <span className="text-base font-extrabold tracking-[3px] bg-gradient-to-br from-[#4fc3f7] to-[#81d4fa] bg-clip-text text-transparent">
                SCOREREF
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleTheme}
                className="text-base text-text-muted hover:text-[#f4c542] px-1.5 py-0.5 rounded transition-colors cursor-pointer"
              >
                {isDark ? "\u2600" : "\u263E"}
              </button>
              <button
                onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}
                className="text-xs text-text-muted hover:text-accent px-2 py-0.5 rounded transition-colors cursor-pointer"
              >
                {locale === "en" ? "\u4E2D\u6587" : "EN"}
              </button>
            </div>
          </div>

          {/* Sport tabs */}
          <div className="flex gap-0">
            {sports.map((s) => (
              <button
                key={s.key}
                className="text-[13px] font-semibold text-accent pb-2 border-b-2 border-accent h-9 leading-9 cursor-pointer"
              >
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
