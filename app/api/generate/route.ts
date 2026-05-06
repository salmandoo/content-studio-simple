import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateOne, FONT_KEYS } from "@/lib/generate";

export const maxDuration = 300;

const PLATFORMS = ["linkedin", "instagram", "facebook", "blog"] as const;

const Body = z.object({
  prompt: z.string().min(4).max(10_000),
  channels: z
    .array(
      z.object({
        platform: z.enum(PLATFORMS),
        count: z.number().int().min(1).max(10),
      }),
    )
    .min(1),
  font: z.enum(FONT_KEYS).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: `Invalid: ${(e as Error).message}` }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY missing on server." }, { status: 500 });
  }

  // Expand channels into individual generation tasks (one per requested post).
  const tasks: Promise<unknown>[] = [];
  let pieceIdx = 0;
  for (const c of body.channels) {
    for (let i = 0; i < c.count; i++) {
      const variantNote =
        c.count > 1
          ? `\n\nThis is variant ${i + 1} of ${c.count} for this channel — vary the angle, hook, or template from the others. Make each one feel distinct.`
          : "";
      tasks.push(
        generateOne({
          id: `p${pieceIdx++}`,
          platform: c.platform,
          prompt: body.prompt,
          adjustment: variantNote || undefined,
          font: body.font,
        }),
      );
    }
  }
  const pieces = await Promise.all(tasks);
  return NextResponse.json({ pieces });
}
