import Anthropic from "@anthropic-ai/sdk";

export type Platform = "linkedin" | "instagram" | "facebook" | "blog";

export const FONT_KEYS = ["inter", "space-grotesk", "playfair", "plex", "fraunces"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export type DesignSpec = {
  template: "editorial" | "bold" | "stat" | "minimal";
  palette: "mono" | "vermillion" | "indigo" | "forest" | "amber" | "cream";
  big_text: string;
  small_text: string;
  kicker: string | null;
};

export type Piece = {
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
  error?: string;
};

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

const TEMPLATES = ["editorial", "bold", "stat", "minimal"] as const;
const PALETTES = ["mono", "vermillion", "indigo", "forest", "amber", "cream"] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title:    { type: "string" },
    body:     { type: "string" },
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
      properties: {
        template:   { type: "string", enum: [...TEMPLATES] },
        palette:    { type: "string", enum: [...PALETTES] },
        big_text:   { type: "string" },
        small_text: { type: "string" },
        kicker:     { type: ["string", "null"] },
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
  "  · editorial — refined, magazine-style header, for thoughtful posts",
  "  · bold     — saturated gradient, big confident headline, for announcements",
  "  · stat     — one large number/word + small label, for data or punchlines",
  "  · minimal  — generous whitespace, small mark, for premium / understated",
  "- Choose a palette that fits the mood: mono (b/w), vermillion (warm orange/red), indigo (deep blue/purple), forest (deep green), amber (warm gold), cream (soft warm white).",
  "- big_text is the visual focal point — make it sharp, not a sentence. 2–8 words.",
  "- small_text is the supporting line under it — readable but not the headline.",
  "- kicker is optional 1–4 word eyebrow, e.g., 'NEW' / 'ANNOUNCEMENT' / 'BEHIND THE SCENES'.",
].join("\n");

const MODEL_FAST = process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5-20251001";
const MODEL_LONG = process.env.ANTHROPIC_MODEL      || "claude-opus-4-7";

function modelFor(platform: Platform) {
  return platform === "facebook" ? MODEL_FAST : MODEL_LONG;
}

function imageUrl(platform: Platform, design: DesignSpec, font?: FontKey): string {
  const params = new URLSearchParams({
    p: platform,
    t: design.template,
    pal: design.palette,
    big: design.big_text,
    small: design.small_text,
  });
  if (design.kicker) params.set("k", design.kicker);
  if (font) params.set("font", font);
  return `/api/og?${params.toString()}`;
}

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export async function generateOne(opts: {
  id: string;
  platform: Platform;
  prompt: string;
  adjustment?: string;
  font?: FontKey;
}): Promise<Piece> {
  const { id, platform, prompt, adjustment, font } = opts;
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
    prompt.trim(),
    adjustment ? `\n── REVIEWER NOTE (apply this carefully) ──\n${adjustment.trim()}` : "",
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

    const response = await client().messages.create(params as never);
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("No text block in response");
    const parsed = JSON.parse(text.text) as Omit<
      Piece,
      "id" | "platform" | "format" | "status" | "image_url" | "error"
    >;

    return {
      id,
      platform,
      format: rules.format,
      status: "ready",
      title: parsed.title,
      body: parsed.body,
      hashtags: parsed.hashtags ?? [],
      cta: parsed.cta ?? null,
      slides: parsed.slides ?? null,
      design: parsed.design,
      image_url: parsed.design ? imageUrl(platform, parsed.design, font) : null,
    };
  } catch (e) {
    return {
      id,
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
      error: (e as Error).message?.slice(0, 400) ?? "Unknown error",
    };
  }
}
