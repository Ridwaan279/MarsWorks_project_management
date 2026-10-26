import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "./config";
import { guestCookieValue } from "./guest";
import { signToken, verifyToken } from "./token";
import { currentViewer, mayDeleteTasks, mayEditProject, sessionCookieValue } from "./session";
import { requireWriteAccess } from "./write-access";
import { proxy } from "../../proxy";
import { POST as guestLogin } from "../../app/api/auth/guest/route";

const mocks = vi.hoisted(() => ({ token: undefined as string | undefined, findUnique: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.token ? { value: mocks.token } : undefined }) }));
vi.mock("../db", () => ({ prisma: { member: { findUnique: mocks.findUnique } } }));

const secret = "guest-test-secret-that-is-at-least-32-characters";
const base = "https://mission.example";
const member = { id: "member-1", name: "Member", email: "member@sheffield.ac.uk", role: "TEAM_MEMBER", teamId: "mechanical" };
const request = (path: string, method = "GET", token = mocks.token) => new NextRequest(base + path, {
  method,
  headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), origin: base },
});

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("AUTH_SECRET", secret);
  vi.stubEnv("AUTH_URL", base);
  mocks.token = undefined;
  mocks.findUnique.mockReset();
  mocks.findUnique.mockResolvedValue(member);
});

describe("guest sessions", () => {
  it("issues a guest cookie without creating or looking up a member", async () => {
    const response = await guestLogin(request("/api/auth/guest?next=/board", "POST"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(base + "/board");
    const cookie = response.cookies.get(SESSION_COOKIE)!;
    expect(await verifyToken(cookie.value, secret, "guest")).toMatchObject({ use: "guest" });
    expect(await verifyToken(cookie.value, secret, "session")).toBeNull();
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("identifies guests without a database lookup and refuses all write permissions", async () => {
    mocks.token = await guestCookieValue(secret);
    const viewer = await currentViewer();
    expect(viewer).toEqual({ mode: "on", guest: true, member: null });
    expect(mayEditProject(viewer)).toBe(false);
    expect(mayDeleteTasks(viewer)).toBe(false);
    expect((await requireWriteAccess())?.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("keeps a member's team and editing permissions when signing in with Google", async () => {
    mocks.token = await sessionCookieValue(member.id, secret);
    const viewer = await currentViewer();
    expect(viewer.member?.teamId).toBe("mechanical");
    expect(viewer.guest).toBe(false);
    expect(mayEditProject(viewer)).toBe(true);
    expect(mayDeleteTasks(viewer)).toBe(false);
    expect(await requireWriteAccess()).toBeNull();
    const response = await guestLogin(request("/api/auth/guest", "POST"));
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects expired and tampered guest sessions and missing members", async () => {
    mocks.token = await signToken({ use: "guest", exp: 1 }, secret);
    expect((await requireWriteAccess())?.status).toBe(401);
    mocks.token = (await guestCookieValue(secret)) + "tampered";
    expect((await currentViewer()).guest).toBe(false);
    mocks.token = await sessionCookieValue("deleted-member", secret);
    mocks.findUnique.mockResolvedValue(null);
    expect((await requireWriteAccess())?.status).toBe(401);
  });

  it("refuses cross-site guest login and external redirect targets", async () => {
    const crossSite = new NextRequest(base + "/api/auth/guest", { method: "POST", headers: { origin: "https://other.example" } });
    expect((await guestLogin(crossSite)).status).toBe(403);
    expect((await guestLogin(request("/api/auth/guest?next=https://other.example", "POST"))).headers.get("location")).toBe(base + "/");
  });

  it("does not offer guest sessions with incomplete authentication", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect((await guestLogin(request("/api/auth/guest", "POST"))).headers.get("location")).toBe(base + "/login?error=setup");
  });
});

describe("guest access at the proxy", () => {
  it.each(["/", "/board", "/timeline", "/teams", "/impact", "/api/simulate?task=1&days=7", "/api/sheets/status"])("allows read-only browsing of %s", async (path) => {
    mocks.token = await guestCookieValue(secret);
    expect((await proxy(request(path))).headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])("refuses guest %s requests before they reach project APIs", async (method) => {
    mocks.token = await guestCookieValue(secret);
    expect((await proxy(request("/api/tasks/task-1", method))).status).toBe(403);
  });

  it("still allows logout and Google login for guests", async () => {
    mocks.token = await guestCookieValue(secret);
    expect((await proxy(request("/api/auth/logout", "POST"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/api/auth/login"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps member writes working and unsigned visitors outside the dashboard", async () => {
    mocks.token = await sessionCookieValue(member.id, secret);
    expect((await proxy(request("/api/tasks/task-1", "PATCH"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/board", "GET", "invalid"))).status).toBe(307);
    expect((await proxy(request("/api/tasks", "POST", "invalid"))).status).toBe(401);
  });
});

describe("database mutation routes", () => {
  const endpoints = [
    ["../../app/api/tasks/route", "POST"],
    ["../../app/api/tasks/[id]/route", "PATCH"],
    ["../../app/api/tasks/[id]/route", "DELETE"],
    ["../../app/api/tasks/[id]/links/route", "POST"],
    ["../../app/api/tasks/[id]/subtasks/route", "POST"],
    ["../../app/api/tasks/[id]/dependencies/route", "POST"],
    ["../../app/api/subtasks/[id]/route", "PATCH"],
    ["../../app/api/subtasks/[id]/route", "DELETE"],
    ["../../app/api/links/[id]/route", "DELETE"],
    ["../../app/api/dependencies/[id]/route", "DELETE"],
    ["../../app/api/workstreams/route", "POST"],
  ];
  it.each(endpoints)("blocks direct calls to %s %s even without the proxy", async (file, method) => {
    mocks.token = await guestCookieValue(secret);
    const handler = (await import(file))[method];
    const response = await handler(new Request(base + "/api/tasks", { method }), { params: Promise.resolve({ id: "task-1" }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("read-only");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
