#!/usr/bin/env node
/**
 * Consulta rápida a `app_error_logs` de producción, para revisar qué está fallando en el
 * teléfono sin abrir el panel de Supabase.
 *
 * ## Por qué existe
 *
 * Estas revisiones se hacen a menudo ("revisa los logs a ver si hay algo raro") y hasta ahora se
 * escribía el script a mano cada vez, apoyándose en que `pg` estuviera instalado **por
 * casualidad** como dependencia transitiva. Un `npm install` de otra cosa lo podó y la consulta
 * dejó de funcionar sin que nada avisara. Ahora `pg` es devDependency declarada y esto vive
 * aquí.
 *
 * ## Conexión
 *
 * Por el **pooler**, no por `DATABASE_URL`: ese host es solo IPv6 y falla desde esta máquina.
 * Las credenciales salen de `.env` (`DB_POOLER_HOST`, `DB_POOLER_USER`, `DB_PASSWORD`).
 *
 * ## Uso
 *
 *   npm run logs                        # últimos errores y avisos, 24 h
 *   npm run logs -- --hours 168         # última semana
 *   npm run logs -- --source realtime   # solo una fuente
 *   npm run logs -- --sql "select ..."  # consulta libre
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function readEnv() {
  const raw = readFileSync(".env", "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const hours = Number(flag("hours", "24"));
const source = flag("source", null);
const custom = flag("sql", null);

const query =
  custom ??
  `select to_char(created_at at time zone 'America/Lima','MM-DD HH24:MI') as t,
          level, source, left(message, 90) as message, context::text as context
     from app_error_logs
    where created_at > now() - interval '${hours} hours'
      and level in ('error','warn')
      ${source ? `and source = '${source.replace(/'/g, "''")}'` : ""}
    order by created_at desc
    limit 60`;

const env = readEnv();
const client = new pg.Client({
  host: env.DB_POOLER_HOST,
  port: 6543,
  user: env.DB_POOLER_USER,
  password: env.DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const { rows } = await client.query(query);
await client.end();

if (rows.length === 0) {
  console.log(`Sin errores ni avisos en las últimas ${hours} h.`);
} else {
  console.log(JSON.stringify(rows, null, 1));
}
