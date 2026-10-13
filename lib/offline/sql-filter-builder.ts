import type { MovementFiltersBuilder } from "../../features/movements/lib/filters";
import type { SqlParam } from "./sql-driver";

/**
 * Equivalente en SQLite de `movement_filter_amount(movements)` del servidor (migración
 * 202609280002/3): el monto NOMINAL que muestra la fila, con el sentido de cobros y pagos.
 * Trabaja en centavos (`*_cents`).
 */
export function filterAmountCentsSql(prefix = ""): string {
  const p = prefix ? `${prefix}.` : "";
  return `abs(case
  when ${p}movement_type in ('income', 'refund')
    or (${p}movement_type not in ('expense', 'subscription_payment', 'transfer')
        and coalesce(${p}destination_cents, 0) > coalesce(${p}source_cents, 0))
    then coalesce(${p}destination_cents, ${p}source_cents, 0)
  else coalesce(${p}source_cents, ${p}destination_cents, 0)
end)`;
}

/** Columnas del servidor que `applyMovementFilters` puede nombrar → columna local. Lista cerrada. */
const COLUMNS: Record<string, string> = {
  id: "id",
  movement_type: "movement_type",
  status: "status",
  occurred_at: "occurred_at",
  source_account_id: "source_account_id",
  destination_account_id: "destination_account_id",
  category_id: "category_id",
  description: "description_lc",
};

function isoOf(value: string | number): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`Fecha de filtro inválida: ${value}`);
  return date.toISOString();
}

function centsOf(value: string | number): number {
  return Math.round(Number(value) * 100);
}

/**
 * Constructor de consultas que implementa la interfaz que espera `applyMovementFilters`, pero en
 * vez de llamar a PostgREST acumula cláusulas SQL. Así la lista local usa LA MISMA función de
 * filtros que la del servidor y no hay una segunda copia de las reglas que pueda divergir.
 *
 * Las fechas locales se guardan normalizadas (ISO UTC con milisegundos), así que comparar el
 * texto es comparar el instante.
 */
export class SqlFilterBuilder implements MovementFiltersBuilder<SqlFilterBuilder> {
  readonly clauses: string[] = [];
  readonly params: SqlParam[] = [];

  /** `alias`: prefijo de tabla cuando la consulta tiene joins (p. ej. "m"). */
  constructor(private readonly alias = "") {}

  private column(name: string): string {
    if (name === "movement_filter_amount") return `(${filterAmountCentsSql(this.alias)})`;
    const column = COLUMNS[name];
    if (!column) throw new Error(`Columna de filtro no soportada en local: ${name}`);
    return this.alias ? `${this.alias}.${column}` : column;
  }

  in(columnName: string, values: readonly (string | number)[]): SqlFilterBuilder {
    if (values.length === 0) {
      this.clauses.push("0");
      return this;
    }
    this.clauses.push(`${this.column(columnName)} in (${values.map(() => "?").join(", ")})`);
    this.params.push(...values);
    return this;
  }

  eq(columnName: string, value: string | number): SqlFilterBuilder {
    this.clauses.push(`${this.column(columnName)} = ?`);
    this.params.push(value);
    return this;
  }

  gte(columnName: string, value: string): SqlFilterBuilder {
    return this.compare(columnName, ">=", value);
  }

  lte(columnName: string, value: string): SqlFilterBuilder {
    return this.compare(columnName, "<=", value);
  }

  private compare(columnName: string, operator: ">=" | "<=", value: string): SqlFilterBuilder {
    if (columnName === "occurred_at") {
      this.clauses.push(`${this.column("occurred_at")} ${operator} ?`);
      this.params.push(isoOf(value));
    } else if (columnName === "movement_filter_amount") {
      this.clauses.push(`${this.column(columnName)} ${operator} ?`);
      this.params.push(centsOf(value));
    } else {
      this.clauses.push(`${this.column(columnName)} ${operator} ?`);
      this.params.push(value);
    }
    return this;
  }

  /** Formato de PostgREST: `col.eq.valor,col2.eq.valor`. Solo `eq`, que es lo que usa la app. */
  or(filter: string): SqlFilterBuilder {
    const parts = filter.split(",").map((part) => {
      const match = /^([a-z_]+)\.eq\.(.+)$/.exec(part.trim());
      if (!match) throw new Error(`Filtro or no soportado en local: ${part}`);
      this.params.push(Number.isFinite(Number(match[2])) ? Number(match[2]) : match[2]);
      return `${this.column(match[1])} = ?`;
    });
    this.clauses.push(`(${parts.join(" or ")})`);
    return this;
  }

  is(columnName: string, _value: null): SqlFilterBuilder {
    this.clauses.push(`${this.column(columnName)} is null`);
    return this;
  }

  /** `ilike` de Postgres: sin distinción de mayúsculas, CON distinción de acentos. */
  ilike(columnName: string, pattern: string): SqlFilterBuilder {
    this.clauses.push(`${this.column(columnName)} like ?`);
    this.params.push(pattern.toLowerCase());
    return this;
  }

  where(): { sql: string; params: SqlParam[] } {
    return {
      sql: this.clauses.length ? ` and ${this.clauses.join(" and ")}` : "",
      params: [...this.params],
    };
  }
}
