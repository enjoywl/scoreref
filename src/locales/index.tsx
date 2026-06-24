import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en from "./en";
import zhCN from "./zh-CN";

type Messages = typeof en;

const messages: Record<string, Messages> = { en, "zh-CN": zhCN };

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

function resolve(obj: any, path: string): string {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    cur = cur?.[p];
  }
  return typeof cur === "string" ? cur : path;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState("en");

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
