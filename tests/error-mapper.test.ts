import { describe, expect, it } from "vitest";
import { mapDomainError } from "../services/error-mapper";

describe("central error mapper", () => {
  it("maps booking exclusion errors to the locked conflict payload", () => {
    const mapped = mapDomainError({ code: "23P01", constraint: "bookings_no_active_overlap_excl" } as unknown as Error);
    expect(mapped).toEqual({
      status: 409,
      body: {
        error: {
          code: "BOOKING_OVERLAP",
          message: "That time overlaps an existing booking. Choose a different slot.",
          details: { constraint: "bookings_no_active_overlap_excl" },
        },
      },
    });
  });

  it("maps the database exit-clearance signature to HTTP 409", () => {
    const mapped = mapDomainError({ code: "AF001", constraint: "users_exit_clearance_required" } as unknown as Error);
    expect(mapped.status).toBe(409);
    expect(mapped.body.error).toMatchObject({
      code: "EXIT_CLEARANCE_REQUIRED",
      details: { constraint: "users_exit_clearance_required" },
    });
  });
});
