import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300;

const PLATFORMS = ["linkedin", "instagram", "facebook", "blog"] as const;
type Platform = (typeof PLATFORMS)[number];

const Body = z.object({
  prompt: z.string().min(4).max(10_000),
  channels: z.array(z.enum(PLATFORMS)).min(1),
});

// Per-channel rules. Compact and explicit so Claude sticks to the format.
const PLATFORM_RULES: Record<Platform, { format: string; rules: string }> = {
  linkedin: {
    format: "long_post",
    rules:
      "Long-form post: 900–1,400 chars. Hook first line. One idea per paragraph. Plain words. Soft close, never a hard sell. 2–4 hashtags at the end.",
  },
  instagram: {
    format: "carousel_caption",
    rules:
      "Instagram caption + carousel. Caption 80–180 words, scannable. Then 5–7 carousel slides — each headline ≤ 8 words, each body ≤ 30 words. 4–8 hashtags.",
  },
  facebook: {
    format: "short_post",
    rules:
      "Short post ≤ 380 chars. One clear idea. Warm, plain voice. CTA only when it adds value. 0–2 hashtags.",
  },
  blog: {
    format: "article",
    rules:
      "Blog article 500–900 words. Markdown. Title, intro paragraph, 3–5 H2 sections, scannable. Conclude with a take-away, not a sales pitch.",
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title:    { type: "string", description: "Short editorial title for the UI list." },
    body:     { type: "string", description: "The full content. Markdown allowed for blog; plain text otherwise." },
    hashtags: { type: "array", items: { type: "string" } },
    cta:      { type: ["string", "null"] },
    slides: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          headline: { type: "string" },
          body:     { type: "string" },
        },
        required: ["headline", "body"],
      },
    },
  },
  required: ["title", "body", "hashtags", "cta", "slides"],
} as const;

const SYSTEM = [
  "You are a senior content writer. Given a brief, you produce platform-native content.",
  "",
  "Voice: plain, specific, no marketing fluff. Avoid: 'transform', 'unlock', 'leverage', 'best-in-class', 'game-changing', 'revolutionary', 'AI-powered'.",
  "",
  "Output rules:",
  "- Return ONLY a JSON object matching the schema. No prose, no preamble, no Markdown fences.",
  "- For Instagram, populate 'slides' with 5–7 entries plus a caption in 'body'. For other channels, set slides to null.",
  "- Never invent statistics or named people that aren't in the brief.",
].join("\n");

const MODEL_FAST = process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5-20251001";
const MODEL_LONG = process.env.ANTHROPIC_MODEL      || "claude-opus-4-7";

function modelFor(platform: Platform) {
  return platform === "facebook" ? MODEL_FAST : MODEL_LONG;
}

type PieceResult = {
  id: string;
  platform: Platform;
  format: string;
  status: "ready" | "failed";
  title: string;
  body: string;
  hashtags: string[];
  cta: string | null;
  slides: { headline: string; body: string }[] | null;
  tokens_in: number;
  tokens_out: number;
  cost_cents: number;
  error?: string;
};

const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-4-7":           { in: 5.0, out: 25.0 },
  "claude-haiku-4-5-20251001": { in: 1.0, out:  5.0 },
};
function priceCents(model: string, tin: number, tout: number) {
  const p = PRICE[model] ?? PRICE["claude-opus-4-7"];
  return Math.round(((tin / 1e6) * p.in + (tout / 1e6) * p.out) * 100);
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: `Invalid: ${(e as Error).message}` }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY missing on server." },
      { status: 500 },
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Generate all channels in parallel (concurrency 4 is fine for 4 channels).
  const tasks = body.channels.map(async (platform, idx): Promise<PieceResult> => {
    const rules = PLATFORM_RULES[platform];
    const model = modelFor(platform);
    const userPrompt = [
      `Channel: ${platform.toUpperCase()}.`,
      `Format: ${rules.format}.`,
      "",
      "── PLATFORM RULES ──",
      rules.rules,
      "",
      "── BRIEF ──",
      body.prompt.trim(),
      "",
      `Now generate one ${rules.format} for ${platform}. Match the schema exactly.`,
    ].join("\n");

    try {
      // Cast through unknown to allow output_config (newer than this SDK's typings).
      const params = {
        model,
        max_tokens: 4096,
        system: [
          {
            type: "text" as const,
            text: SYSTEM,
            cache_control: { type: "ephemeral" } as const,
          },
        ],
        messages: [{ role: "user" as const, content: userPrompt }],
        output_config: {
          format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
        },
      };

      const response = await client.messages.create(params as never);
      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") throw new Error("No text block in response");
      const parsed = JSON.parse(text.text) as Omit<
        PieceResult,
        "id" | "platform" | "format" | "status" | "tokens_in" | "tokens_out" | "cost_cents" | "error"
      >;

      const tin = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
      const tout = response.usage.output_tokens;

      return {
        id: `p${idx}`,
        platform,
        format: rules.format,
        status: "ready",
        title: parsed.title,
        body: parsed.body,
        hashtags: parsed.hashtags ?? [],
        cta: parsed.cta ?? null,
        slides: parsed.slides ?? null,
        tokens_in: tin,
        tokens_out: tout,
        cost_cents: priceCents(model, tin, tout),
      };
    } catch (e) {
      return {
        id: `p${idx}`,
        platform,
        format: rules.format,
        status: "failed",
        title: `${platform} — generation failed`,
        body: "",
        hashtags: [],
        cta: null,
        slides: null,
        tokens_in: 0,
        tokens_out: 0,
        cost_cents: 0,
        error: (e as Error).message?.slice(0, 400) ?? "Unknown error",
      };
    }
  });

  const pieces = await Promise.all(tasks);
  return NextResponse.json({ pieces });
}
