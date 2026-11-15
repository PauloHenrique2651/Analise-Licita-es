// Prepara o banco local de homologação: compatibilidade Supabase, migrações e usuário de teste.
// Uso: npm run db:setup   (requer `docker compose up -d`)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

// Migrações usam a conexão direta (sem PgBouncer) quando LOCAL_DATABASE_ADMIN_URL existe.
const databaseUrl = process.env.LOCAL_DATABASE_ADMIN_URL ?? process.env.LOCAL_DATABASE_URL;
if (!databaseUrl) {
  console.error("Defina LOCAL_DATABASE_URL no .env.local.");
  process.exit(1);
}

async function connectWithRetry() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt === 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Banco indisponível.");
}

async function main() {
  const root = process.cwd();
  const client = await connectWithRetry();
  try {
    await client.query(await readFile(path.join(root, "local-db", "bootstrap.sql"), "utf8"));
    console.log("✓ compatibilidade aplicada");

    const migrationsDir = path.join(root, "supabase", "migrations");
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    const { rows } = await client.query<{ version: string }>("select version from local_meta.schema_migrations");
    const applied = new Set(rows.map((row) => row.version));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into local_meta.schema_migrations (version) values ($1)", [file]);
        await client.query("commit");
        console.log(`✓ ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Falha na migração ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Como no Supabase, os papéis da API enxergam o schema public; o RLS decide as linhas. Views materializadas não herdam o default.
    await client.query("grant select on all tables in schema public to authenticated; grant all on all tables in schema public to service_role");
    await client.query(await readFile(path.join(root, "local-db", "security.sql"), "utf8"));
    console.log("✓ permissões endurecidas (local-db/security.sql)");
    const email = process.env.LOCAL_DEV_USER_EMAIL?.trim().toLowerCase();
    const password = process.env.LOCAL_DEV_USER_PASSWORD;
    if (email && password) {
      const existing = await client.query("select id from auth.users where email = $1", [email]);
      if (existing.rowCount === 0) {
        await client.query(
          `insert into auth.users (email, encrypted_password, raw_user_meta_data)
           values ($1, crypt($2, gen_salt('bf')), $3::jsonb)`,
          [email, password, JSON.stringify({ display_name: "Usuário de homologação", company_name: "Empresa de homologação" })],
        );
        console.log(`✓ usuário de teste criado (${email})`);
      } else {
        console.log(`• usuário de teste já existe (${email})`);
      }
    }
    console.log("Banco local pronto.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
