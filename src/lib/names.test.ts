import { describe, expect, it } from "vitest";
import { peopleOn, shortNames } from "./names";

describe("the names a task shows", () => {
  it("is a first name, unless someone else on the list shares it", () => {
    const names = shortNames([
      { id: "kai", name: "Kai Dolan" },
      { id: "jack-s", name: "Jack Sutton" },
      { id: "jack-h", name: "Jack Hamer" },
      { id: "luke", name: "Luke F Burden" },
      { id: "luke-c", name: "luke Crowley" },
      { id: "solo", name: "  Cher " },
    ]);
    expect(names.get("kai")).toBe("Kai");
    expect(names.get("jack-s")).toBe("Jack S");
    expect(names.get("jack-h")).toBe("Jack H");
    // The surname is the last word, whatever initials come before it.
    expect(names.get("luke")).toBe("Luke B");
    expect(names.get("luke-c")).toBe("luke C");
    expect(names.get("solo")).toBe("Cher");
  });

  it("falls back to the whole name when the initial is shared too", () => {
    const names = shortNames([
      { id: "a", name: "Sam Smith" },
      { id: "b", name: "Sam Stone" },
    ]);
    expect(names.get("a")).toBe("Sam Smith");
    expect(names.get("b")).toBe("Sam Stone");
  });
});

describe("the people on a task", () => {
  const members = new Map([
    ["a", { name: "Ada Lovelace" }],
    ["b", { name: "Alan Turing" }],
  ]);
  const short = new Map([["a", "Ada"], ["b", "Alan"]]);

  it("puts whoever is signed in first, and skips anyone no longer on the list", () => {
    expect(peopleOn(["a", "gone", "b"], members, short, "b")).toEqual([
      { name: "Alan Turing", short: "Alan", you: true },
      { name: "Ada Lovelace", short: "Ada", you: false },
    ]);
    expect(peopleOn(["a"], members, short, null)).toEqual([{ name: "Ada Lovelace", short: "Ada", you: false }]);
  });
});
