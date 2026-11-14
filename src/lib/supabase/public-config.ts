// A chave publishable do Supabase foi criada para uso público no navegador.
// A proteção dos dados depende das políticas RLS; a secret key nunca entra aqui.
export const DEFAULT_SUPABASE_URL = "https://lciaajnqcvbuurajgmti.supabase.co";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xquh7Pg07TBwSuVo8_sCew_i-ErIa2s";

export const supabasePublicConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
};
