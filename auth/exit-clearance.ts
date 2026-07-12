import { AuthError } from "./errors";
import type { DatabaseClient } from "../services/db";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  department_id: string | null;
  status: "active" | "inactive";
};

function publicUser(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department_id: user.department_id,
    status: user.status,
  };
}

function isExitClearanceError(error: unknown): boolean {
  const pgError = error as { code?: string; constraint?: string; message?: string };
  return pgError.code === "AF001"
    && pgError.constraint === "users_exit_clearance_required"
    && pgError.message === "EXIT_CLEARANCE_REQUIRED";
}

export class ExitClearanceService {
  constructor(private readonly db: DatabaseClient) {}

  async deactivate(employeeId: string, actorId: string, reason?: unknown): Promise<{ employee: ReturnType<typeof publicUser>; clearance_complete: true }> {
    if (!employeeId || !actorId) {
      throw new AuthError(400, "AUTH_INVALID_INPUT", "An employee identifier and authenticated Admin are required.");
    }
    if (reason != null && typeof reason !== "string") {
      throw new AuthError(400, "AUTH_INVALID_INPUT", "The deactivation reason must be text.");
    }

    try {
      return await this.db.transaction(async (client) => {
        const { rows: employees } = await client.query<UserRow>(`
          SELECT id, name, email, role, department_id, status
          FROM users
          WHERE id = $1
          FOR UPDATE
        `, [employeeId]);
        if (employees.length === 0) {
          throw new AuthError(400, "EMPLOYEE_NOT_FOUND", "That employee could not be found.");
        }

        const employee = employees[0];
        if (employee.status === "inactive") {
          return { employee: publicUser(employee), clearance_complete: true };
        }

        const { rows: updated } = await client.query<UserRow>(`
          UPDATE users
          SET status = 'inactive'
          WHERE id = $1 AND status = 'active'
          RETURNING id, name, email, role, department_id, status
        `, [employeeId]);
        if (updated.length !== 1) {
          throw new AuthError(409, "EMPLOYEE_STATUS_CONFLICT", "The employee status changed. Refresh the directory and try again.");
        }

        await client.query(`
          INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
          VALUES (gen_random_uuid(), $1, 'employee.deactivated', 'User', $2, $3::jsonb)
        `, [actorId, employeeId, JSON.stringify({ reason: reason ?? null })]);

        return { employee: publicUser(updated[0]), clearance_complete: true };
      });
    } catch (error) {
      if (!isExitClearanceError(error)) throw error;
      throw new AuthError(
        409,
        "EXIT_CLEARANCE_REQUIRED",
        "Employee still has active custody or upcoming bookings. Complete the clearance checklist and retry deactivation.",
        await this.loadClearance(employeeId),
      );
    }
  }

  private async loadClearance(employeeId: string) {
    const { rows: employeeRows } = await this.db.query<UserRow>(`
      SELECT id, name, email, role, department_id, status
      FROM users
      WHERE id = $1
    `, [employeeId]);
    const { rows: activeAllocations } = await this.db.query(`
      SELECT
        a.id, a.asset_id, a.holder_type, a.holder_id, a.expected_return_date,
        a.allocated_at, a.returned_at, a.return_condition_notes,
        jsonb_build_object('id', ast.id, 'name', ast.name, 'asset_tag', ast.asset_tag) AS asset
      FROM allocations a
      JOIN assets ast ON ast.id = a.asset_id
      WHERE a.holder_type = 'user'
        AND a.holder_id = $1
        AND a.returned_at IS NULL
      ORDER BY a.allocated_at
    `, [employeeId]);
    const { rows: upcomingBookings } = await this.db.query(`
      SELECT
        b.id, b.asset_id, b.booked_by, b.start_time, b.end_time, b.status,
        jsonb_build_object('id', ast.id, 'name', ast.name, 'asset_tag', ast.asset_tag) AS asset
      FROM bookings b
      JOIN assets ast ON ast.id = b.asset_id
      WHERE b.booked_by = $1
        AND b.status = 'upcoming'
        AND b.end_time > CURRENT_TIMESTAMP
      ORDER BY b.start_time
    `, [employeeId]);

    return {
      employee: employeeRows[0] ? publicUser(employeeRows[0]) : { id: employeeId },
      active_allocations: activeAllocations,
      upcoming_bookings: upcomingBookings,
      checklist: [
        ...activeAllocations.map((allocation) => ({
          type: "allocation",
          id: allocation.id,
          asset_id: allocation.asset_id,
          action: "return_or_transfer",
          return_path: `/allocations/${allocation.id}/return`,
          transfer_path: "/transfer-requests",
        })),
        ...upcomingBookings.map((booking) => ({
          type: "booking",
          id: booking.id,
          asset_id: booking.asset_id,
          action: "cancel",
          cancel_path: `/bookings/${booking.id}/cancel`,
        })),
      ],
    };
  }
}
