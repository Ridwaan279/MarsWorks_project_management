import { NextResponse } from "next/server";
import { currentViewer, mayEditProject } from "./session";

/** Check beside each database write as well as in the proxy. */
export async function requireWriteAccess(): Promise<NextResponse | null> {
  const viewer = await currentViewer();
  if (mayEditProject(viewer)) return null;
  return NextResponse.json(
    { error: viewer.guest ? "Guest access is read-only. Sign in with Google to make changes." : "Sign in first." },
    { status: viewer.guest ? 403 : 401 },
  );
}
