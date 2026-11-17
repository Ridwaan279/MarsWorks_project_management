import { describe, expect, it } from "vitest";
import { searchTerms, taskMatcher } from "./search";

const names: Record<string, string> = { kai: "Kai Dolan", dexi: "Dexi Li" };
const memberName = (id: string) => names[id];
const task = {
  key: "ELEC-4",
  title: "CAN Hub 25/26 Testing",
  description: "Bench test the hub with the Jetson",
  notes: "Borrow the café's power supply",
  ownerLabel: "Executive Team",
  assigneeIds: ["kai"],
  subtasks: [{ id: "s1", title: "Make BOM", done: false }],
};
const finds = (query: string) => taskMatcher(query, memberName)!(task);

describe("task search", () => {
  it("is off for an empty search", () => {
    expect(taskMatcher("   ", memberName)).toBeNull();
    expect(searchTerms("  CAN   hub ")).toEqual(["can", "hub"]);
  });

  it("finds a task by any of what people remember about it", () => {
    expect(finds("elec-4")).toBe(true); // its key
    expect(finds("hub testing")).toBe(true); // title words, any case
    expect(finds("jetson")).toBe(true); // description
    expect(finds("cafe")).toBe(true); // notes, accents ignored
    expect(finds("executive")).toBe(true); // the group it is for
    expect(finds("dolan")).toBe(true); // someone on it
    expect(finds("bom")).toBe(true); // a checklist item
  });

  it("needs every word, in any order", () => {
    expect(finds("kai testing")).toBe(true);
    expect(finds("testing kai")).toBe(true);
    expect(finds("kai chassis")).toBe(false);
    expect(finds("dexi")).toBe(false);
  });
});
