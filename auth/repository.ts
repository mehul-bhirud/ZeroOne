import type { Pool, PoolClient } from "pg";
import type { AuthUser, Role } from "./types";

export interface StoredUser extends AuthUser {
  password_hash: string;
}

export interface CreateUserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  department_id?: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  createUser(input: CreateUserRecord): Promise<StoredUser>;
}

function mapRow(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    password_hash: String(row.password_hash),
    role: row.role as Role,
    department_id: row.department_id ? String(row.department_id) : undefined,
    status: row.status as "active" | "inactive",
  };
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<StoredUser | null> {
    const result = await this.pool.query(
      "SELECT id, name, email, password_hash, role, department_id, status FROM users WHERE email = $1 LIMIT 1",
      [email],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const result = await this.pool.query(
      "SELECT id, name, email, password_hash, role, department_id, status FROM users WHERE id = $1 LIMIT 1",
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async createUser(input: CreateUserRecord): Promise<StoredUser> {
    const client: PoolClient = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, department_id, status)
         VALUES ($1, $2, $3, $4, 'employee', $5, 'active')
         RETURNING id, name, email, password_hash, role, department_id, status`,
        [input.id, input.name, input.email, input.password_hash, input.department_id ?? null],
      );
      return mapRow(result.rows[0]);
    } finally {
      client.release();
    }
  }
}
