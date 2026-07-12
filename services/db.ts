import type { Pool, PoolClient } from "pg";

export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

function clientAdapter(client: PoolClient): DatabaseClient {
  return {
    async query<T = any>(sql: string, params?: any[]) {
      const result = await client.query(sql, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
    async transaction<T>(callback: (nestedClient: DatabaseClient) => Promise<T>) {
      return callback(clientAdapter(client));
    },
  };
}

/** Adapt a pg Pool to the small transaction/query interface used by services. */
export function createDatabaseClient(pool: Pool): DatabaseClient {
  return {
    async query<T = any>(sql: string, params?: any[]) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
    async transaction<T>(callback: (client: DatabaseClient) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await callback(clientAdapter(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
