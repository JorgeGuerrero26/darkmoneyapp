#!/usr/bin/env node
// Integra la RPC y los triggers con datos ficticios. Todo termina en ROLLBACK.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter(line => line.includes('=') && !line.trimStart().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const db = new pg.Client({ host: env.DB_POOLER_HOST, port: 6543, user: env.DB_POOLER_USER,
  password: env.DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
const user = randomUUID(), other = randomUUID(), ws = -Date.now();
const pen = ws - 1, usd = ws - 2, secondPen = ws - 3;
let nextId = ws - 10, checks = 0, createdMovements = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const at = '2026-07-10T18:23:00Z';
async function claims(id) { await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: 'authenticated' })]); }
async function receipt(amount, { date = at, description = 'Comercio ficticio', metadata = {}, type = 'expense', currency = 'PEN', owner = user, packageName = 'com.bcp.test', confidence = 'high' } = {}) {
  const id = nextId--;
  await db.query(`insert into public.notification_detected_movement_suggestions
    (id,user_id,workspace_id,financial_app_key,package_name,app_label,movement_type,amount,currency_code,description,occurred_at,confidence,dedupe_key,metadata)
    overriding system value values ($1,$2,$3,'bcp',$11,'BCP',$4,$5,$6,$7,$8,$12,$9,$10)`,
    [id, owner, ws, type, amount, currency, description, date, randomUUID(), JSON.stringify(metadata), packageName, confidence]);
  return id;
}
async function movement(amount, { date = at, description = 'Comercio ficticio', account = pen, status = 'posted', type = 'expense', destination = null, metadata = {} } = {}) {
  const id = nextId--;
  await db.query(`insert into public.movements (id,workspace_id,created_by_user_id,movement_type,status,occurred_at,description,source_account_id,source_amount,destination_account_id,destination_amount,metadata)
    overriding system value values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, ws, user, type, status, date, description, type === 'income' ? null : account,
      type === 'income' ? null : amount, type === 'income' ? account : destination,
      type === 'income' || type === 'transfer' ? amount : null, JSON.stringify(metadata)]);
  createdMovements++;
  return id;
}
async function state(id) { return (await db.query('select status,movement_id from public.notification_detected_movement_suggestions where id=$1', [id])).rows[0]; }
async function reconcile(id) { return (await db.query('select public.reconcile_detected_movements($1,$2) as result', [ws, id])).rows[0].result; }
async function pendingCandidate(id, label) {
  const result = await reconcile(id);
  check((await state(id)).status === 'pending' && result.candidates.some(c => Number(c.suggestionId) === id), label);
}
async function noCandidate(id, label) {
  const result = await reconcile(id);
  check((await state(id)).status === 'pending' && result.candidates.length === 0, label);
}
async function denied(sql, params, label) {
  await db.query('savepoint denied'); let code;
  try { await db.query(sql, params); } catch (error) { code = error.code; }
  await db.query('rollback to savepoint denied'); check(code === '42501', label);
}

await db.connect();
try {
  await db.query('begin');
  await db.query(readFileSync('supabase/migrations/202610090001_detected_movement_reconciliation.sql', 'utf8'));
  await db.query('insert into auth.users (id,email) values ($1,$3),($2,$4)', [user, other, `${user}@test.invalid`, `${other}@test.invalid`]);
  await db.query("insert into public.workspaces (id,owner_user_id,name) overriding system value values ($1,$2,'Conciliacion ficticia')", [ws, user]);
  await db.query('insert into public.workspace_members (workspace_id,user_id) values ($1,$2)', [ws, user]);
  await db.query("insert into public.user_entitlements (user_id,plan_code,pro_access_enabled,manual_override) values ($1,'pro',true,true)", [user]);
  await db.query(`insert into public.accounts (id,workspace_id,name,type,currency_code) overriding system value
    values ($1,$4,'PEN ficticia','bank','PEN'),($2,$4,'USD ficticia','bank','USD'),($3,$4,'Otra ficticia','bank','PEN')`, [pen, usd, secondPen, ws]);
  await db.query('set local role authenticated'); await claims(user);
  const exact = await receipt(11);
  await db.query(`insert into public.notifications (user_id,title,body,status,kind,channel,related_entity_type,related_entity_id,read_at)
    values ($1,'Aviso ficticio','Contenido ficticio','read','detected_movement_suggestion','in_app','detected_movement_suggestion',$2,now())`, [user, exact]);
  check((await state(exact)).status === 'pending', 'Leer el aviso no resuelve la deteccion');
  const exactMovement = await movement(11, { description: 'Comercio FICTÍCIO!' });
  check((await state(exact)).status === 'duplicate' && Number((await state(exact)).movement_id) === exactMovement, 'El registro manual concilia una coincidencia precisa');
  const notification = (await db.query("select status,read_at,archived_at,payload from public.notifications where user_id=$1 and related_entity_id=$2", [user, exact])).rows[0];
  check(notification.status === 'read' && notification.read_at != null && notification.archived_at == null && notification.payload.status === 'duplicate', 'Conciliar conserva lectura e historial del aviso');
  check((await reconcile(exact)).resolvedIds.length === 0, 'Repetir la conciliacion es idempotente');

  await movement(12);
  const existing = await receipt(12);
  check((await reconcile(existing)).resolvedIds.includes(existing), 'Conciliar historico y correo recibido despues del registro manual');
  const amountOnly = await receipt(13); await movement(13, { description: 'Otro comercio ficticio' });
  await pendingCandidate(amountOnly, 'Igual importe sin descripcion no se resuelve solo');
  const anotherHour = await receipt(14); await movement(14, { date: '2026-07-10T22:23:00Z' });
  await pendingCandidate(anotherHour, 'Otra hora exige confirmacion');
  await movement(15); await movement(15);
  const ambiguous = await receipt(15); await pendingCandidate(ambiguous, 'Dos movimientos candidatos nunca se resuelven solos');
  const firstSignal = await receipt(16), secondSignal = await receipt(16); await movement(16);
  await pendingCandidate(firstSignal, 'Dos detecciones no consumen un unico movimiento');
  await pendingCandidate(secondSignal, 'La segunda deteccion sigue pidiendo decision');
  const currency = await receipt(17); await movement(17, { account: usd }); await noCandidate(currency, 'PEN y USD nunca se mezclan');
  const account = await receipt(18, { metadata: { accountId: pen } }); await movement(18, { account: secondPen }); await noCandidate(account, 'Cuenta distinta no se concilia');
  const anotherDay = await receipt(19, { date: '2026-07-11T04:30:00Z' }); await movement(19, { date: '2026-07-11T05:30:00Z' }); await noCandidate(anotherDay, 'El dia se compara en Peru, no en UTC');
  const midnight = await receipt(20, { date: '2026-07-11T04:59:00Z' }); const late = await movement(20, { date: '2026-07-11T04:59:29Z' });
  check(Number((await state(midnight)).movement_id) === late, 'Una operacion de 23:59 en Peru se concilia con sus segundos');
  const planned = await receipt(21); await movement(21, { status: 'planned' }); await noCandidate(planned, 'Los movimientos planeados no resuelven detecciones');
  const split = await receipt(22); await movement(22, { metadata: { split_group: 'fictional' } }); await noCandidate(split, 'Una linea dividida no representa todo el pago');
  const generic = await receipt(23, { description: 'Transferencia BCP' }); await movement(23, { description: 'Transferencia BCP' }); await pendingCandidate(generic, 'Descripcion generica exige confirmacion');
  const received = await receipt(24, { metadata: { dateSource: 'received' } }); await movement(24); await pendingCandidate(received, 'La hora de recepcion del correo no prueba la hora del pago');
  const income = await receipt(25, { type: 'income' }); const incomeMovement = await movement(25, { type: 'income' });
  check(Number((await state(income)).movement_id) === incomeMovement, 'Ingresos comparan importe y moneda del destino');
  const transfer = await receipt(26, { type: 'transfer', metadata: { sourceAccountId: pen, destinationAccountId: secondPen } });
  const transferred = await movement(26, { type: 'transfer', destination: secondPen });
  check(Number((await state(transfer)).movement_id) === transferred, 'Transferencia exige origen y destino conocidos para resolver');
  const missingDestination = await receipt(27, { type: 'transfer' }); await movement(27, { type: 'transfer', destination: secondPen });
  await pendingCandidate(missingDestination, 'Transferencia sin destino detectado exige confirmacion');
  const wrongDestination = await receipt(28, { type: 'transfer', metadata: { sourceAccountId: pen, destinationAccountId: secondPen } });
  await movement(28, { type: 'transfer', destination: usd }); await noCandidate(wrongDestination, 'No se concilia una transferencia a otro destino');
  const edited = await receipt(29); const editedMovement = await movement(29, { description: 'Otra descripcion ficticia' });
  await db.query('update public.movements set description=$2 where id=$1', [editedMovement, 'Comercio ficticio']);
  check((await state(edited)).status === 'duplicate', 'Editar un registro tambien concilia sus pendientes');

  const operation = await receipt(30, { description: 'Transferencia BCP', metadata: { operationNumber: '123456' } });
  const operationMovement = await movement(30, { date: '2026-07-10T22:23:00Z', metadata: { operationNumber: '123456', financialAppKey: 'bcp' } });
  check(Number((await state(operation)).movement_id) === operationMovement, 'El numero de operacion del mismo banco prueba el vinculo');
  const wrongBank = await receipt(31, { metadata: { operationNumber: '234567' } });
  await movement(31, { date: '2026-07-10T22:23:00Z', metadata: { operationNumber: '234567', financialAppKey: 'bbva' } });
  await pendingCandidate(wrongBank, 'Un numero de operacion de otro banco no prueba el vinculo');
  const email = await receipt(32, { packageName: 'email:inbound', metadata: { senderAuthenticated: true, dateSource: 'receipt' } });
  const emailMovement = await movement(32);
  check(Number((await state(email)).movement_id) === emailMovement, 'Correo autenticado se concilia con el registro manual');
  const unverified = await receipt(33, { packageName: 'email:inbound', metadata: { senderAuthenticated: false } });
  await movement(33); await pendingCandidate(unverified, 'Correo sin autenticacion no se resuelve por hora y descripcion');
  const ai = await receipt(34, { packageName: 'email:inbound', confidence: 'medium', metadata: { senderAuthenticated: true, parser: 'ai' } });
  await movement(34); await pendingCandidate(ai, 'La extraccion incierta de IA pide confirmacion');
  const direct = await receipt(35);
  const directMovement = await movement(35, { description: 'Descripcion revisada', metadata: { suggestionId: direct } });
  await db.query("update public.notification_detected_movement_suggestions set status='pending',movement_id=null where id=$1", [direct]);
  check((await reconcile(direct)).resolvedIds.includes(direct) && Number((await state(direct)).movement_id) === directMovement, 'El vinculo explicito se recupera aunque se haya editado la descripcion');
  await db.query('reset role');
  await db.query('update public.user_entitlements set pro_access_enabled=false where user_id=$1', [user]);
  await db.query('set local role authenticated');
  const expired = await reconcile(unverified);
  check(expired.candidates.length === 0 && (await state(unverified)).status === 'pending', 'Sin PRO la RPC no procesa los pendientes por correo');

  await denied('select public.detection_reconciliation_matches($1,$2)', [ws, user], 'Los helpers no son invocables por usuarios');
  await claims(other); await denied('select public.reconcile_detected_movements($1)', [ws], 'Otro usuario sin membresia no puede conciliar el workspace');
  await db.query('reset role');
  await db.query('insert into public.workspace_members (workspace_id,user_id) values ($1,$2)', [ws, other]);
  await db.query('set local role authenticated'); await claims(other);
  check((await reconcile(amountOnly)).candidates.length === 0, 'Un miembro no puede conciliar detecciones de otro miembro');
  await db.query('set local role anon');
  await denied('select public.reconcile_detected_movements($1)', [ws], 'Una sesion anonima no puede llamar a la RPC');
  await db.query('reset role');
  const count = (await db.query('select count(*) from public.movements where workspace_id=$1', [ws])).rows[0].count;
  check(Number(count) === createdMovements, 'Conciliar no crea ni elimina movimientos');
  console.log(`${checks} comprobaciones de conciliacion correctas; todo se revierte.`);
} finally { await db.query('rollback'); await db.end(); }
