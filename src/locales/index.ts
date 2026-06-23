import { ref, computed, inject, type InjectionKey, type Ref, type ComputedRef } from "vue";
import en from "./en";
import zhCN from "./zh-CN";

export interface Messages {
  sport: Record<string, string>;
  groupBy: Record<string, string>;
  status: Record<string, string>;
  match: Record<string, string>;
  weekdays: string[];
  loading: string;
  error: string;
  count: string;
}

type Locale = "en" | "zh-CN";

const messages: Record<Locale, Messages> = {
  en: en as Messages,
  "zh-CN": zhCN as Messages,
};

export function t(msg: Messages, key: string, params?: Record<string, string | number>): string {
  const keys = key.split(".");
  let val: any = msg;
  for (const k of keys) {
    val = val?.[k];
  }
  if (typeof val !== "string") return key;
  if (params) {
    return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  }
  return val;
}

const I18N_KEY: InjectionKey<{
  locale: Ref<Locale>;
  t: ComputedRef<(key: string, params?: Record<string, string | number>) => string>;
  setLocale: (l: Locale) => void;
}> = Symbol("i18n");

export function createI18n() {
  const locale = ref<Locale>("en");

  const translate = computed(() => {
    const msg = messages[locale.value];
    return (key: string, params?: Record<string, string | number>) => t(msg, key, params);
  });

  function setLocale(l: Locale) {
    locale.value = l;
  }

  const i18n = { locale, t: translate, setLocale };

  return {
    install(app: any) {
      app.provide(I18N_KEY, i18n);
    },
    ...i18n,
  };
}

export function useI18n() {
  const i18n = inject(I18N_KEY);
  if (!i18n) throw new Error("i18n not provided");
  return i18n;
}
