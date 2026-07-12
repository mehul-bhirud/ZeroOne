export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
}
