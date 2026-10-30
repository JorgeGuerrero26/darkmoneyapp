import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
try {
  await db.exec(`create table public.categories (
    id bigint primary key, workspace_id bigint not null, name text not null,
    is_system boolean not null, updated_at timestamptz not null default '2020-01-01'
  );
  insert into public.categories (id, workspace_id, name, is_system) values
    (1, 1, 'Tecnologia', true), (2, 1, 'Alimentacion', false),
    (3, 1, 'Diversion', true), (4, 1, 'Diversión', false),
    (5, 2, 'Alimentacion', true), (6, 3, 'Tecnologia', true),
    (7, 3, 'Tecnologia', true);`);
  const migration = await readFile("supabase/migrations/202610300001_accent_system_category_names.sql", "utf8");
  await db.exec(migration);
  const { rows } = await db.query("select id, name, updated_at, updated_at > '2020-01-01'::timestamptz as changed from public.categories order by id");
  assert.deepEqual(rows.map(({ id, name, changed }) => [Number(id), name, changed]), [
    [1, "Tecnología", true], [2, "Alimentacion", false], [3, "Diversion", false],
    [4, "Diversión", false], [5, "Alimentación", true], [6, "Tecnologia", false], [7, "Tecnologia", false],
  ]);
  await db.exec(migration);
  const second = await db.query("select id, name, updated_at, updated_at > '2020-01-01'::timestamptz as changed from public.categories order by id");
  assert.deepEqual(second.rows, rows);
  console.log("Category accent migration: system-only names, collisions and repeat execution passed.");
} finally {
  await db.close();
}
