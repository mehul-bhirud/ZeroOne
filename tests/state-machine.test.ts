import { describe, expect, it } from "vitest";
import { maintenanceStateMachine, transferStateMachine } from "../domain/workflows";

describe("state-machine scaffold", () => {
  it("allows a pending transfer to be approved", () => {
    expect(transferStateMachine.transition("pending", "approved")).toBe("approved");
  });

  it("rejects maintenance work before approval", () => {
    expect(() => maintenanceStateMachine.transition("pending", "in_progress")).toThrow(
      "MaintenanceRequest cannot move from pending to in_progress",
    );
  });
});

