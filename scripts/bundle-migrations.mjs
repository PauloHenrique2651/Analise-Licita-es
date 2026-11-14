// Junta todas as migrações em um único arquivo SQL para colar no SQL Editor do Supabase.
// Uso: npm run db:bundle  ->  supabase/schema-bundle.sql
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
const parts = files.map((file) => `-- ==== ${file} ====\n${readFileSync(path.join(dir, file), "utf8").trim()}\n`);
writeFileSync(path.join(process.cwd(), "supabase", "schema-bundle.sql"), parts.join("\n"), "utf8");
console.log(`${files.length} migrações em supabase/schema-bundle.sql`);
