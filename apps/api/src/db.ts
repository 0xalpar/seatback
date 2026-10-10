import { Pool, type PoolClient } from "pg";
export interface Sql { query<T extends Record<string, any> = Record<string, any>>(sql: string, values?: any[]): Promise<{ rows: T[]; rowCount?: number | null }> }
export interface Database extends Sql { transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>; close(): Promise<void> }
export class PostgresDatabase implements Database {
  readonly pool: Pool;
  constructor(url: string) { this.pool = new Pool({connectionString:url, max:10}); }
  query<T extends Record<string, any>>(sql:string, values:any[] = []) { return this.pool.query<T>(sql, values); }
  async transaction<T>(fn:(sql:Sql)=>Promise<T>):Promise<T> {
    const client:PoolClient=await this.pool.connect();
    try { await client.query("BEGIN"); const value=await fn(client); await client.query("COMMIT"); return value; }
    catch(error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}
