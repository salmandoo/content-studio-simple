import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateOne, FONT_KEYS } from "@/lib/generate";

export const maxDuration = 120;

const Body = z.object({
  id:         z.string().min(1).max(40),
  prompt:     z.string().min(4).max(10_000),
  platform:   z.enum(["linkedin", "instagram", "facebook", "blog"]),
  adjustment: z.string().min(1).max(2_000),
  font:       z.enum(FONT_KEYS).optional(),
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

  const piece = await generateOne({
    id: body.id,
    platform: body.platform,
    prompt: body.prompt,
    adjustment: body.adjustment,
    font: body.font,
  });
  return NextResponse.json({ piece });
}
