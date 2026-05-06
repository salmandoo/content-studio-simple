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

// Per-channel content rules.
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
      "Blog article 500–900 words. Markdown. Title, intro paragraph, 3–5 H2 sections, scannable. Conclude with a take-away.",
  },
};

// Visual design templates the model can pick. Each maps to a renderer in /api/og.
const TEMPLATES = ["editorial", "bold", "stat", "minimal"] as const;
const PALETTES = ["mono", "vermillion", "indigo", "forest", "amber", "cream"] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title:    { type: "string", description: "Short editorial title for the UI." },
    body:     { type: "string", description: "The full content. Markdown allowed for blog; plain for others." },
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
    design: {
      type: "object",
      additionalProperties: false,
      description: "Visual design choices for the rendered post image.",
      properties: {
        template:    { type: "string", enum: [...TEMPLATES] },
        palette:     { type: "string", enum: [...PALETTES] },
        big_text:    { type: "string", description: "Largest text on the image — 2–8 words. The hook." },
        small_text:  { type: "string", description: "Secondary line under the big text — 4–14 words. The follow-through." },
        kicker:      { type: ["string", "null"], description: "Optional eyebrow above big_text — 1–4 words, often uppercase." },
      },
      required: ["template", "palette", "big_text", "small_text", "kicker"],
    },
  },
  required: ["title", "body", "hashtags", "cta", "slides", "design"],
} as const;

const SYSTEM = [
  "You are a senior content writer AND visual director. Given a brief, you produce platform-native content + visual design choices.",
  "",
  "Voice: plain, specific, no marketing fluff. Avoid: 'transform', 'unlock', 'leverage', 'best-in-class', 'game-changing', 'revolutionary', 'AI-powered'.",
  "",
  "Output rules:",
  "- Return ONLY a JSON object matching the schema. No prose, no preamble, no Markdown fences.",
  "- For Instagram, populate 'slides' with 5–7 entries plus a caption in 'body'. For other channels, set slides to null.",
  "- Never invent statistics or named people not in the brief.",
  "",
  "Design rules:",
  "- Choose a template that fits the message:",
  "  · editorial — white/cream bg, refined serif vibe, for thoughtful posts",
  "  · bold     — saturated bg, big confident headline, for announcements",
  "  · stat     — one large number/word + small label, for data or punchlines",
  "  · minimal  — generous whitespace, small mark, for premium / understated",
  "- Choose a palette tone that fits the mood: mono (b/w), vermillion (warm orange/red), indigo (deep blue/purple), forest (deep green), amber (warm gold), cream (soft warm white).",
  "- big_text is the visual focal point — make it sharp, not a sentence. 2–8 words.",
  "- small_text is the supporting line under it — readable but not the headline.",
  "- kicker is optional 1–4 word eyebrow, e.g., 'NEW' / 'ANNOUNCEMENT' / 'BEHIND THE SCENES'.",
].join("\n");

const MODEL_FAST = process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5-20251001";
const MODEL_LONG = process.env.ANTHROPIC_MODEL      || "claude-opus-4-7";

function modelFor(platform: Platform) {
  return platform === "facebook" ? MODEL_FAST : MODEL_LONG;
}

type DesignSpec = {
  template: (typeof TEMPLATES)[number];
  palette: (typeof PALETTES)[number];
  big_text: string;
  small_text: string;
  kicker: string | null;
};

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
  design: DesignSpec | null;
  image_url: string | null;
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

function imageUrl(platform: Platform, design: DesignSpec): string {
  const params = new URLSearchParams({
    p: platform,
    t: design.template,
    pal: design.palette,
    big: design.big_text,
    small: design.small_text,
  });
  if (design.kicker) params.set("k", design.kicker);
  return `/api/og?${params.toString()}`;
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
      `Now generate one ${rules.format} for ${platform} AND choose visual design (template, palette, big_text, small_text, kicker). Match the schema exactly.`,
    ].join("\n");

    try {
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
        "id" | "platform" | "format" | "status" | "tokens_in" | "tokens_out" | "cost_cents" | "error" | "image_url"
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
        design: parsed.design,
        image_url: parsed.design ? imageUrl(platform, parsed.design) : null,
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
        design: null,
        image_url: null,
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
