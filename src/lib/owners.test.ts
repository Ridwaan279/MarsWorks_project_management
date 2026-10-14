import { describe, expect, it } from "vitest";
import { normaliseName, readOwners, writeOwners } from "./owners";

const people = new Map(
  [
    ["Kai Dolan", "kai"],
    ["Dexi Li", "dexi"],
    ["Jack Sutton", "jack-s"],
    ["Jack Hamer", "jack-h"],
  ].map(([name, id]) => [normaliseName(name), id]),
);

describe("reading owner text", () => {
  it("links each full name, ignoring case, spacing and the separator used", () => {
    expect(readOwners("Kai Dolan, dexi  li", people)).toEqual({ memberIds: ["kai", "dexi"], rest: "" });
    expect(readOwners("Kai Dolan & Dexi Li", people).memberIds).toEqual(["kai", "dexi"]);
    expect(readOwners("Kai Dolan and Dexi Li", people).memberIds).toEqual(["kai", "dexi"]);
    expect(readOwners("Kai Dolan / Dexi Li; Jack Hamer", people).memberIds).toEqual(["kai", "dexi", "jack-h"]);
  });

  it("keeps text that names nobody exactly as written", () => {
    expect(readOwners("Sub-Team Leads & Chief Engineer", people)).toEqual({
      memberIds: [],
      rest: "Sub-Team Leads & Chief Engineer",
    });
    expect(readOwners("  ", people)).toEqual({ memberIds: [], rest: "" });
  });

  it("keeps the pieces that are not people when some are", () => {
    expect(readOwners("Kai Dolan & Executive Team", people)).toEqual({
      memberIds: ["kai"],
      rest: "Executive Team",
    });
  });

  it("does not link a first name alone, or count anyone twice", () => {
    expect(readOwners("Kai", people)).toEqual({ memberIds: [], rest: "Kai" });
    expect(readOwners("Kai Dolan, kai dolan", people).memberIds).toEqual(["kai"]);
  });

  it("finds names run together only when asked to scan", () => {
    expect(readOwners("Dexi Li Kai Dolan", people).memberIds).toEqual([]);
    const scanned = readOwners("Dexi Li Kai Dolan", people, { scan: true });
    expect([...scanned.memberIds].sort()).toEqual(["dexi", "kai"]);
    expect(scanned.rest).toBe("");
  });

  it("matches whole words when scanning, longest names first", () => {
    const withAlias = new Map(people).set("jack", "jack-s");
    expect(readOwners("Jack Hamer", withAlias, { scan: true }).memberIds).toEqual(["jack-h"]);
    expect(readOwners("Owen & Jack", withAlias, { scan: true })).toEqual({ memberIds: ["jack-s"], rest: "Owen" });
    expect(readOwners("Jackson", withAlias, { scan: true })).toEqual({ memberIds: [], rest: "Jackson" });
  });
});

describe("writing owner text", () => {
  it("lists people alphabetically, then the rest", () => {
    expect(writeOwners(["Kai Dolan", "Dexi Li"], "Executive Team")).toBe("Dexi Li, Kai Dolan, Executive Team");
    expect(writeOwners([], "Team")).toBe("Team");
    expect(writeOwners([], null)).toBe("");
  });

  it("reads back what it writes", () => {
    const text = writeOwners(["Kai Dolan", "Dexi Li"], "Executive Team");
    const read = readOwners(text, people);
    expect(read).toEqual({ memberIds: ["dexi", "kai"], rest: "Executive Team" });
    expect(writeOwners(["Dexi Li", "Kai Dolan"], read.rest)).toBe(text);
  });
});
