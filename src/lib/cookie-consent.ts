// Preferências de cookies (LGPD, Lei 13.709/2018, e Guia de Cookies da ANPD).
// Cookies estritamente necessários (sessão e segurança) não dependem de consentimento e não são desativáveis.
// As demais categorias começam DESLIGADAS e só são ativadas por ação afirmativa do usuário.
// Hoje o Nexo não usa cookies de estatística ou publicidade; as categorias existem para quando forem adotadas.

export const CONSENT_STORAGE_KEY = "nexo-cookie-consent";
export const CONSENT_VERSION = 1;
export const OPEN_PREFERENCES_EVENT = "nexo:open-cookie-preferences";
export const CONSENT_CHANGED_EVENT = "nexo:cookie-consent-changed";

export interface ConsentChoice {
  version: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

export function readConsent(): ConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentChoice>;
    if (parsed.version !== CONSENT_VERSION || typeof parsed.decidedAt !== "string") return null;
    return { version: CONSENT_VERSION, necessary: true, analytics: parsed.analytics === true, marketing: parsed.marketing === true, decidedAt: parsed.decidedAt };
  } catch {
    return null;
  }
}

export function saveConsent(choice: { analytics: boolean; marketing: boolean }): ConsentChoice {
  const value: ConsentChoice = { version: CONSENT_VERSION, necessary: true, analytics: choice.analytics, marketing: choice.marketing, decidedAt: new Date().toISOString() };
  try { window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value)); } catch { /* sem armazenamento: a escolha vale só nesta visita */ }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: value }));
  return value;
}

/** Use antes de carregar qualquer script de estatística: `if (hasConsent("analytics")) { ... }`. */
export function hasConsent(category: "analytics" | "marketing") {
  return readConsent()?.[category] === true;
}
