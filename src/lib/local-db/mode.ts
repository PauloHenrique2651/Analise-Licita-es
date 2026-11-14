// Backend de dados ativo. "local" = Postgres em Docker (homologação); padrão = Supabase.
export function isLocalBackend() {
  return process.env.NEXT_PUBLIC_DATA_BACKEND === "local";
}
