import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en from "./en";
import zhCN from "./zh-CN";
import jp from "./jp";
import ko from "./ko";
import ar from "./ar";
import es from "./es";
import fr from "./fr";
import hi from "./hi";
import pt from "./pt";
import { api } from "../lib/api";

type Messages = typeof en;

const messages: Record<string, Messages> = {
  en,
  "zh-CN": zhCN,
  jp,
  ko,
  ar,
  es,
  fr,
  hi,
  pt,
};

// Map frontend locale codes to backend API language codes
const localeToApiLang: Record<string, string> = {
  en: "en",
  "zh-CN": "zh",
  jp: "jp",
  ko: "ko",
  ar: "ar",
  es: "es",
  fr: "fr",
  hi: "hi",
  pt: "pt",
};

export function getApiLanguage(locale: string): string {
  return localeToApiLang[locale] || "en";
}

function detectBrowserLocale(): string {
  const lang = (navigator.language || "en").toLowerCase();
  // Direct match: "en", "ko", "ar", "es", "fr", "hi", "pt"
  const direct = new Set(["ko", "ar", "es", "fr", "hi", "pt"]);
  if (direct.has(lang)) return lang;
  // Full match: "zh-CN", "zh-hans" etc.
  if (lang === "zh-cn" || lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("ja")) return "jp";
  if (lang.startsWith("en")) return "en";
  // Check navigator.languages for better fallback
  if (navigator.languages) {
    for (const l of navigator.languages) {
      const tag = l.toLowerCase();
      if (direct.has(tag)) return tag;
      if (tag === "zh-cn" || tag.startsWith("zh")) return "zh-CN";
      if (tag.startsWith("ja")) return "jp";
      if (tag.startsWith("en")) return "en";
      if (tag.startsWith("ko")) return "ko";
      if (tag.startsWith("ar")) return "ar";
      if (tag.startsWith("es")) return "es";
      if (tag.startsWith("fr")) return "fr";
      if (tag.startsWith("hi")) return "hi";
      if (tag.startsWith("pt")) return "pt";
    }
  }
  return "en";
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

interface I18nContextValue {
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (l: string) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolve(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (typeof cur !== "object" || cur === null) return path;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : path;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(detectBrowserLocale);

  // Set API language during render — must happen before child effects run,
  // otherwise the initial data fetch would use the wrong language.
  api.setLanguage(getApiLanguage(locale));

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const tmpl = resolve(messages[locale], key);
      if (tmpl !== key) return interpolate(tmpl, params);
      if (locale !== "en") {
        const fallback = resolve(messages.en, key);
        if (fallback !== key) return interpolate(fallback, params);
      }
      return key;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
