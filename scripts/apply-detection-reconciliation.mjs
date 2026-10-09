#!/usr/bin/env node
// Aplica una sola migración; no ejecuta cambios ajenos. Nunca imprime credenciales.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter(line => line.includes('=') && !line.trimStart().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const args = process.argv.slice(2);
const flag = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
const user = flag('--user'), workspace = flag('--workspace'), dryRun = args.includes('--dry-run');
if (Boolean(user) !== Boolean(workspace)) throw new Error('--user y --workspace deben ir juntos');
const version = '202610090001', name = 'detected_movement_reconciliation';
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, 'utf8');
const db = new pg.Client({ host: env.DB_POOLER_HOST, port: 6543, user: env.DB_POOLER_USER,
  password: env.DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query('begin');
  await db.query("set local statement_timeout='15s'");
  await db.query(sql);
  await db.query(`insert into supabase_migrations.schema_migrations (version,name,statements)
    values ($1,$2,$3) on conflict (version) do nothing`, [version, name, [sql]]);
  if (user && workspace) {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: 'authenticated' })]);
    const before = await db.query(`select count(*) filter (where can_resolve) as automatic,
      count(*) filter (where not can_resolve) as possible from public.detection_reconciliation_matches($1,$2)`, [workspace, user]);
    console.log('Coincidencias verificadas:', before.rows[0]);
    await db.query('set local role authenticated');
    const start = Date.now();
    const result = (await db.query('select public.reconcile_detected_movements($1) as result', [workspace])).rows[0].result;
    console.log(JSON.stringify({ resolved: result.resolvedIds.length, possible: result.candidates.length, elapsedMs: Date.now() - start }));
    const pending = (await db.query("select count(*) from public.notification_detected_movement_suggestions where user_id=$1 and workspace_id=$2 and status in ('pending','needs_review')", [user, workspace])).rows[0].count;
    console.log('Pendientes restantes:', pending);
  }
  await db.query(dryRun ? 'rollback' : 'commit');
  console.log(dryRun ? 'Prueba revertida, sin cambios permanentes.' : `Migracion ${version} aplicada.`);
} catch (error) { await db.query('rollback'); throw error; }
finally { await db.end(); }
