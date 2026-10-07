#!/usr/bin/env node
/** Integración de permisos con datos ficticios: TODO se revierte, incluida la migración.
 * npm exec -- node scripts/test-email-detection-pro.mjs
 * Usa las mismas variables DB_POOLER_* de scripts/logs.mjs. Nunca imprime credenciales.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/)
  .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const db = new pg.Client({ host: env.DB_POOLER_HOST, port: 6543, user: env.DB_POOLER_USER,
  password: env.DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
const free = randomUUID(), pro = randomUUID(), workspace = -Date.now(), account = workspace - 1;
let nextId = account - 1;
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed++; };
async function claims(userId, role = "authenticated") {
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role })]);
}
async function denied(sql, values, label) {
  await db.query("savepoint denied_action");
  let code;
  try { await db.query(sql, values); } catch (error) { code = error.code; }
  await db.query("rollback to savepoint denied_action");
  check(code === "42501", label);
}
async function hasAccess(userId) {
  const result = await db.query("select public.has_email_detection_pro_access($1) as allowed", [userId]);
  return result.rows[0].allowed;
}
async function plan(fields) {
  await db.query("reset role");
  await db.query(`update public.user_entitlements set pro_access_enabled=$2, manual_override=$3,
    current_period_end=$4 where user_id=$1`, [pro, ...fields]);
  await db.query("set local role authenticated");
  await claims(pro);
}
function suggestionSql() {
  return `insert into public.notification_detected_movement_suggestions
    (id,user_id,workspace_id,financial_app_key,package_name,app_label,movement_type,amount,
    currency_code,description,occurred_at,confidence,dedupe_key)
    overriding system value values ($1,$2,$3,'bcp',$4,'BCP','expense',10,'PEN','Prueba aislada',now(),'high',$5)`;
}
function movementSql() {
  return `insert into public.movements (id,workspace_id,created_by_user_id,movement_type,description,
    source_account_id,source_amount,metadata) overriding system value values ($1,$2,$3,'expense','Prueba aislada',$4,10,$5)`;
}

await db.connect();
try {
  await db.query("begin");
  await db.query(readFileSync("supabase/migrations/202610070001_email_detection_pro_access.sql", "utf8"));
  await db.query("insert into auth.users (id,email) values ($1,$3),($2,$4)",
    [free, pro, `${free}@test.invalid`, `${pro}@test.invalid`]);
  await db.query("insert into public.workspaces (id,owner_user_id,name) overriding system value values ($1,$2,'Prueba PRO aislada')", [workspace, pro]);
  await db.query("insert into public.workspace_members (workspace_id,user_id) values ($1,$2),($1,$3)", [workspace, free, pro]);
  await db.query("insert into public.accounts (id,workspace_id,name,type,currency_code) overriding system value values ($1,$2,'Cuenta ficticia','bank','PEN')", [account, workspace]);
  await db.query(`insert into public.user_entitlements (user_id,plan_code,pro_access_enabled,current_period_end)
    values ($1,'pro',true,now()+interval '1 day')`, [pro]);
  await db.query("set local role authenticated");
  await claims(free);
  check(!(await hasAccess(free)), "Free sin entitlement no tiene acceso");
  check(!(await hasAccess(pro)), "Free no puede consultar el permiso de otro usuario");
  await denied("insert into public.inbound_email_aliases (user_id,workspace_id) values ($1,$2)", [free, workspace], "Free no puede generar alias por API");
  await denied(suggestionSql(), [nextId--, free, workspace, "email:inbound", randomUUID()], "Free no puede insertar sugerencias de correo");
  const androidId = nextId--;
  await db.query(suggestionSql(), [androidId, free, workspace, "com.bcp.test", randomUUID()]);
  await db.query(movementSql(), [nextId--, workspace, free, account, JSON.stringify({ suggestionId: androidId })]);
  check(true, "Android Free conserva detección y registro");
  await denied("update public.notification_detected_movement_suggestions set package_name='email:inbound' where id=$1", [androidId], "No se puede falsificar el origen Android como correo");

  await claims(pro);
  check(await hasAccess(pro), "PRO vigente habilita acceso");
  const alias = await db.query("insert into public.inbound_email_aliases (user_id,workspace_id) values ($1,$2) returning token", [pro, workspace]);
  const emailId = nextId--;
  await db.query(suggestionSql(), [emailId, pro, workspace, "email:inbound", randomUUID()]);
  await db.query(movementSql(), [nextId--, workspace, pro, account, JSON.stringify({ suggestionId: emailId })]);
  check(true, "PRO puede generar alias, detectar y registrar");
  await denied("update public.notification_detected_movement_suggestions set package_name='com.bcp.test' where id=$1", [emailId], "No se puede disfrazar correo como Android");

  await plan([true, false, new Date(Date.now() - 86400000)]);
  check(!(await hasAccess(pro)), "PRO vencido pierde permiso aunque la bandera siga activa");
  const hidden = await db.query("select token from public.inbound_email_aliases where user_id=$1", [pro]);
  check(hidden.rowCount === 0, "PRO vencido no puede leer su alias");
  await denied("insert into public.inbound_email_aliases (user_id,workspace_id) values ($1,$2)", [pro, workspace], "PRO vencido no puede generar otro alias");
  await denied("update public.notification_detected_movement_suggestions set status='registered' where id=$1", [emailId], "PRO vencido no puede procesar pendientes");
  await denied(movementSql(), [nextId--, workspace, pro, account, JSON.stringify({ suggestionId: emailId })], "Cliente antiguo no puede crear movimiento de correo al vencer");

  await db.query("reset role");
  await claims(pro, "service_role");
  await denied(suggestionSql(), [nextId--, pro, workspace, "email:inbound", randomUUID()], "El trigger protege también las escrituras del webhook");
  await plan([true, true, new Date(Date.now() - 86400000)]);
  check(await hasAccess(pro), "Permiso manual activo no depende de la fecha de facturación");
  await plan([false, true, null]);
  check(!(await hasAccess(pro)), "Desactivar el permiso bloquea también el override manual");
  await plan([true, false, new Date(Date.now() + 86400000)]);
  const resumed = await db.query("select token from public.inbound_email_aliases where user_id=$1", [pro]);
  check(resumed.rows[0]?.token === alias.rows[0].token, "Renovar recupera el mismo alias sin volver a configurar Gmail");
  await db.query("reset role");
  await claims(free, "service_role");
  check(await hasAccess(pro), "Webhook puede consultar el permiso de su destinatario");
  await db.query("set local role authenticated");
  await claims(pro);
  await claims(free);
  const selfPromote = await db.query("update public.user_entitlements set pro_access_enabled=true where user_id=$1", [pro]);
  check(selfPromote.rowCount === 0, "Usuario no puede concederse PRO por API");
  console.log(`${passed} comprobaciones de permisos correctas. Datos ficticios y migración revertidos.`);
} finally {
  await db.query("rollback");
  await db.end();
}
