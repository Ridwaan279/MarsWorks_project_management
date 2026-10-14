import { describe, expect, it } from "vitest";
import { safeNext } from "./config";
import { checkIdentity } from "./google";
import { matchByName } from "./match";
import { canDeleteTasks } from "./roles";
import { signToken, verifyToken, pkceChallenge } from "./token";

const SECRET = "a-test-secret-that-is-long-enough-to-sign-with";
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

describe("signed cookies", () => {
  it("round-trips a token made for the same use", async () => {
    const token = await signToken({ use: "session", sub: "m1", exp: inAnHour() }, SECRET);
    expect(await verifyToken(token, SECRET, "session")).toMatchObject({ sub: "m1" });
  });

  it("refuses one that was altered, expired, signed with another secret, or made for another use", async () => {
    const token = await signToken({ use: "session", sub: "m1", exp: inAnHour() }, SECRET);
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ use: "session", sub: "lead", exp: inAnHour() })).toString("base64url");
    expect(await verifyToken(`${forged}.${signature}`, SECRET, "session")).toBeNull();
    expect(await verifyToken(`${body}.${signature.slice(0, -2)}AA`, SECRET, "session")).toBeNull();
    expect(await verifyToken(token, `${SECRET}-other`, "session")).toBeNull();
    expect(await verifyToken(token, SECRET, "oauth")).toBeNull();
    const expired = await signToken({ use: "session", sub: "m1", exp: Math.floor(Date.now() / 1000) - 1 }, SECRET);
    expect(await verifyToken(expired, SECRET, "session")).toBeNull();
    expect(await verifyToken("", SECRET, "session")).toBeNull();
    expect(await verifyToken("not.a.token", SECRET, "session")).toBeNull();
  });

  it("makes the standard PKCE challenge", async () => {
    // RFC 7636, appendix B.
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

function idToken(claims: Record<string, unknown>): string {
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

const good = {
  iss: "https://accounts.google.com",
  aud: "client-1",
  exp: inAnHour(),
  nonce: "n-1",
  email: "JDoe99@sheffield.ac.uk",
  email_verified: true,
  hd: "sheffield.ac.uk",
  name: "Mohammad Ridwaan Joomun",
  given_name: "Mohammad Ridwaan",
  family_name: "Joomun",
};
const expected = { clientId: "client-1", nonce: "n-1" };

describe("who Google says signed in", () => {
  it("accepts a verified university account, with the address in lower case", () => {
    const check = checkIdentity(idToken(good), expected);
    expect(check).toEqual({
      ok: true,
      identity: {
        email: "jdoe99@sheffield.ac.uk",
        name: "Mohammad Ridwaan Joomun",
        givenName: "Mohammad Ridwaan",
        familyName: "Joomun",
      },
    });
  });

  it("turns away anyone outside the university", () => {
    expect(checkIdentity(idToken({ ...good, email: "someone@gmail.com", hd: undefined }), expected)).toEqual({
      ok: false,
      reason: "domain",
    });
    // A personal Google account using a university address: no hd claim.
    expect(checkIdentity(idToken({ ...good, hd: undefined }), expected)).toMatchObject({ reason: "domain" });
    expect(checkIdentity(idToken({ ...good, email: "x@sheffield.ac.uk.evil.com" }), expected)).toMatchObject({
      reason: "domain",
    });
    expect(checkIdentity(idToken({ ...good, email: "x@notsheffield.ac.uk" }), expected)).toMatchObject({
      reason: "domain",
    });
    expect(checkIdentity(idToken({ ...good, email_verified: false }), expected)).toMatchObject({ reason: "domain" });
  });

  it("refuses a token meant for another app, expired, replayed, or not from Google", () => {
    expect(checkIdentity(idToken({ ...good, aud: "client-2" }), expected)).toMatchObject({ reason: "invalid" });
    expect(checkIdentity(idToken({ ...good, exp: 1 }), expected)).toMatchObject({ reason: "invalid" });
    expect(checkIdentity(idToken({ ...good, nonce: "n-2" }), expected)).toMatchObject({ reason: "invalid" });
    expect(checkIdentity(idToken({ ...good, iss: "https://evil.example" }), expected)).toMatchObject({
      reason: "invalid",
    });
    expect(checkIdentity("garbage", expected)).toMatchObject({ reason: "invalid" });
  });
});

describe("linking a first sign-in to the team list", () => {
  const unclaimed = [
    { id: "ridwaan", name: "Ridwaan Joomun" },
    { id: "jack-s", name: "Jack Sutton" },
    { id: "jack-h", name: "Jack Hamer" },
  ];
  const person = (name: string, givenName: string, familyName: string) => ({
    email: "x@sheffield.ac.uk",
    name,
    givenName,
    familyName,
  });

  it("finds someone whose university name has an extra given name", () => {
    expect(matchByName(person("Mohammad Ridwaan Joomun", "Mohammad Ridwaan", "Joomun"), unclaimed)).toBe("ridwaan");
    expect(matchByName(person("Jack Sutton", "Jack", "Sutton"), unclaimed)).toBe("jack-s");
  });

  it("makes no guess when the name is someone else's or ambiguous", () => {
    expect(matchByName(person("Jack Smith", "Jack", "Smith"), unclaimed)).toBeNull();
    const twins = [...unclaimed, { id: "other", name: "Jack Sutton" }];
    expect(matchByName(person("Jack Sutton", "Jack", "Sutton"), twins)).toBeNull();
  });
});

describe("rules", () => {
  it("lets only leads and technical advisors delete tasks", () => {
    expect(canDeleteTasks("PROJECT_LEAD")).toBe(true);
    expect(canDeleteTasks("TEAM_LEAD")).toBe(true);
    expect(canDeleteTasks("TECHNICAL_ADVISOR")).toBe(true);
    expect(canDeleteTasks("TEAM_MEMBER")).toBe(false);
    expect(canDeleteTasks(null)).toBe(false);
  });

  it("only returns people to a page on this site after signing in", () => {
    expect(safeNext("/board?task=1")).toBe("/board?task=1");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});
