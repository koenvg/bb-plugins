import type { HistoryDatabase, SqlValue } from "./storage/history-storage.js";

export type ExecutedStatement = {
  sql: string;
  method: "get" | "all" | "run";
  values: SqlValue[];
};

export function recordHistoryExecutions(real: HistoryDatabase) {
  const executed: ExecutedStatement[] = [];
  const record = (sql: string, method: ExecutedStatement["method"], values: SqlValue[]) => {
    executed.push({
      sql,
      method,
      values: values.map((value) => (value instanceof Uint8Array ? Uint8Array.from(value) : value)),
    });
  };
  const db: HistoryDatabase = {
    exec: (sql) => real.exec(sql),
    close: () => real.close(),
    transaction: (work) => real.transaction(work),
    prepare(sql) {
      const statement = real.prepare(sql);
      return {
        get(...values) {
          record(sql, "get", values);
          return statement.get(...values);
        },
        all(...values) {
          record(sql, "all", values);
          return statement.all(...values);
        },
        run(...values) {
          record(sql, "run", values);
          return statement.run(...values);
        },
      };
    },
  };
  return { db, executed };
}

export function explainHistoryExecution(real: HistoryDatabase, execution: ExecutedStatement) {
  return (
    real.prepare(`EXPLAIN QUERY PLAN ${execution.sql}`).all(...execution.values) as {
      detail: string;
    }[]
  ).map((row) => row.detail);
}
