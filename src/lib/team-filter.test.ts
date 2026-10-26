import { describe, expect, it } from "vitest";
import { initialTeamFilter } from "./team-filter";

describe("default team filter", () => {
  const teams = [{ id: "mechanical" }, { id: "software" }];
  it("shows the member's own team regardless of roster order", () => {
    expect(initialTeamFilter("software", teams)).toEqual(["software"]);
    expect(initialTeamFilter("mechanical", teams)).toEqual(["mechanical"]);
  });
  it("shows all teams for guests, unassigned members and retired teams", () => {
    expect(initialTeamFilter(undefined, teams)).toEqual([]);
    expect(initialTeamFilter("retired", teams)).toEqual([]);
    expect(initialTeamFilter("software", [])).toEqual([]);
  });
});
