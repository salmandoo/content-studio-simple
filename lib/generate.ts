import Anthropic from "@anthropic-ai/sdk";

export type Platform = "linkedin" | "instagram" | "facebook" | "blog";

export const FONT_KEYS = ["inter", "plex"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export type DesignSpec = {
  template: "editorial" | "bold" | "stat" | "minimal";
  // Brand palette only — lavender/smoke/grape/jet plus a duo gradient.
  palette: "lavender" | "smoke" | "grape" | "jet" | "duo";
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
const PALETTES = ["lavender", "smoke", "grape", "jet", "duo"] as const;

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
  "You are a senior content writer AND visual director for a brand whose color system is:",
  "  · Lavender (#ac73e6) — main accent",
  "  · Smoke    (#f5f5f5) — main background",
  "  · Jet      (#171717) — primary text",
  "  · Grape    (#2d004d) — deep accent / premium surfaces",
  "",
  "VOICE — Apple-style content writing (think Apple Newsroom, Today at Apple):",
  "  · Direct, confident, plain. Never breathless.",
  "  · Specific over abstract. One idea per sentence.",
  "  · Short paragraphs. White space. No emoji unless the brief is playful.",
  "  · NEVER use: 'transform', 'unlock', 'leverage', 'best-in-class', 'game-changing', 'revolutionary', 'AI-powered', 'seamless', 'cutting-edge', 'innovative'.",
  "  · Strong verbs. Real nouns. Trust the reader.",
  "",
  "VISUAL — Apple Newsroom layout principles:",
  "  · Generous whitespace.",
  "  · Single dominant element per layout (a headline, a number, a quote).",
  "  · Hierarchy is achieved with size and space, not color noise.",
  "  · Brand color (lavender) used sparingly as accent; smoke is the base canvas.",
  "",
  "OUTPUT rules:",
  "- Return ONLY a JSON object matching the schema. No prose, no preamble, no Markdown fences.",
  "- For Instagram, populate 'slides' with 5–7 entries plus a caption in 'body'. For other channels, set slides to null.",
  "- Never invent statistics or named people not in the brief.",
  "",
  "DESIGN choices:",
  "- Template:",
  "  · editorial — Apple Newsroom feel: smoke/white card, kicker, big headline, supporting line, brand mark. The default for most posts.",
  "  · bold     — Lavender → grape gradient with a confident white headline. Use for announcements.",
  "  · stat     — One huge grape word/number on smoke. Use for data, punchlines, or 'one truth' posts.",
  "  · minimal  — Maximum whitespace, small lavender mark. Use for premium / understated tone.",
  "- Palette:",
  "  · lavender — smoke bg with lavender accents (default for editorial, minimal)",
  "  · smoke    — pure white card (the most Apple Newsroom look)",
  "  · grape    — deep grape canvas, lavender accents (premium / serious)",
  "  · jet      — true black, lavender accents (high contrast / nighttime)",
  "  · duo      — lavender→grape gradient (only with template=bold)",
  "- big_text is the visual focal point — sharp, not a sentence. 2–8 words.",
  "- small_text is the supporting line under it — one short sentence.",
  "- kicker is 1–3 word eyebrow, e.g., 'NEW' / 'ANNOUNCEMENT' / 'BEHIND THE BUILD'. Optional.",
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

// Distinct angle prompts the runner cycles through when more than one variant
// is requested for the same channel. Without these, parallel calls produce
// near-identical outputs because each run has no awareness of its siblings.
const VARIANT_ANGLES = [
  "Open with a contrarian statement that challenges a common assumption in the brief's space.",
  "Open with a personal first-person moment of realization or quiet failure.",
  "Open with a concrete example or specific scene — names, numbers, places only if they're in the brief.",
  "Open with a question that the reader can't dismiss.",
  "Open with a 'three things I learned' or numbered-list pattern.",
  "Use a quiet, journal-entry tone — almost too understated to be marketing.",
  "Frame it as 'before / after' — the moment something shifted.",
  "Frame it against the industry's conventional wisdom and explain why that wisdom is partial.",
  "Pull a single sharp metaphor and ride it for the whole post.",
  "Lead with the conclusion, then unpack why it matters.",
];

// Force palette/template variation so two variants don't both pick the same look.
const TEMPLATE_ROTATION = ["editorial", "bold", "minimal", "stat"] as const;
const PALETTE_ROTATION  = ["lavender", "smoke", "grape", "jet", "duo"] as const;

export async function generateOne(opts: {
  id: string;
  platform: Platform;
  prompt: string;
  adjustment?: string;
  font?: FontKey;
  /** 0-indexed position of this variant in its channel's group */
  variantIndex?: number;
  /** total number of variants requested for this channel */
  variantTotal?: number;
}): Promise<Piece> {
  const { id, platform, prompt, adjustment, font, variantIndex = 0, variantTotal = 1 } = opts;
  const rules = PLATFORM_RULES[platform];
  const model = modelFor(platform);

  const variantInstruction =
    variantTotal > 1
      ? [
          "",
          "── VARIANT BRIEF ──",
          `This is variant ${variantIndex + 1} of ${variantTotal} for ${platform}. Each variant must feel clearly different from the others — different hook, different framing, different visual.`,
          `Required angle for THIS variant: ${VARIANT_ANGLES[variantIndex % VARIANT_ANGLES.length]}`,
          `Strongly prefer template "${TEMPLATE_ROTATION[variantIndex % TEMPLATE_ROTATION.length]}" and palette "${PALETTE_ROTATION[variantIndex % PALETTE_ROTATION.length]}" so this variant looks distinct from its siblings (you may override only if there's a clear reason).`,
          "Do NOT reuse the same metaphor, opener, or visual headline as another variant of this same brief.",
        ].join("\n")
      : "";

  const userPrompt = [
    `Channel: ${platform.toUpperCase()}.`,
    `Format: ${rules.format}.`,
    "",
    "── PLATFORM RULES ──",
    rules.rules,
    "",
    "── BRIEF ──",
    prompt.trim(),
    variantInstruction,
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
