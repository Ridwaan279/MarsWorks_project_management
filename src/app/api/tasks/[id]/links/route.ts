import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createLink = z.object({
  label: z.string().trim().min(1).max(120),
  // Only http(s). A javascript: or data: URL rendered into an anchor is an
  // injection vector, and nothing legitimate here needs another scheme.
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "Link must start with http:// or https://",
    }),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsed = createLink.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid link", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const link = await prisma.taskLink.create({
      data: { taskId: id, label: parsed.data.label, url: parsed.data.url },
    });
    return NextResponse.json(link, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unknown task" }, { status: 404 });
  }
}
