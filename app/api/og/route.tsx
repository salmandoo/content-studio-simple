import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Platform = "linkedin" | "instagram" | "facebook" | "blog";
type Template = "editorial" | "bold" | "stat" | "minimal";
type PaletteName = "lavender" | "smoke" | "grape" | "jet" | "duo";
type FontKey = "inter" | "plex";

// ── Brand palette (user-supplied) ───────────────────────────────────
//   Lavender   #ac73e6  — main accent
//   Smoke      #f5f5f5  — main background
//   Jet black  #171717  — text/dark
//   Rich grape #2d004d  — deep accent
const BRAND = {
  lavender: "#ac73e6",
  lavenderSoft: "#d4b4ef",
  smoke:    "#f5f5f5",
  jet:      "#171717",
  grape:    "#2d004d",
  white:    "#FFFFFF",
};

const DIMENSIONS: Record<Platform, { w: number; h: number }> = {
  linkedin:  { w: 1200, h: 675 },
  instagram: { w: 1080, h: 1080 },
  facebook:  { w: 1200, h: 1200 },
  blog:      { w: 1200, h: 630 },
};

type Palette = { bg: string; bg2: string; fg: string; muted: string; accent: string };

const PALETTES: Record<PaletteName, Palette> = {
  // White on smoke, lavender accents (the primary look)
  lavender: { bg: BRAND.smoke,    bg2: BRAND.white,        fg: BRAND.jet,           muted: "#74737A", accent: BRAND.lavender },
  // Soft white on white — pure Apple Newsroom feel
  smoke:    { bg: BRAND.white,    bg2: BRAND.smoke,        fg: BRAND.jet,           muted: "#6B6B72", accent: BRAND.grape    },
  // Deep grape — premium / announcement
  grape:    { bg: BRAND.grape,    bg2: "#1F0036",          fg: BRAND.white,         muted: "#9E84BA", accent: BRAND.lavender },
  // Jet — high contrast / serious
  jet:      { bg: BRAND.jet,      bg2: "#262626",          fg: BRAND.smoke,         muted: "#7C7C82", accent: BRAND.lavender },
  // Lavender → grape gradient (handled per-template)
  duo:      { bg: BRAND.lavender, bg2: BRAND.grape,        fg: BRAND.white,         muted: "#E1D2F2", accent: BRAND.white    },
};

// ── Font loading: bundled in /public, read via fs at request time ──
function loadFontFile(filename: string): ArrayBuffer | null {
  try {
    const p = path.join(process.cwd(), "public", filename);
    const buf = readFileSync(p);
    // Convert Buffer slice to a clean ArrayBuffer
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

const FONT_FILES: Record<FontKey, { display: string; regular: string; bold: string }> = {
  inter: { display: "Inter",         regular: "Inter-Regular.otf",      bold: "Inter-Bold.otf" },
  plex:  { display: "IBM Plex Sans", regular: "IBMPlexSans-Regular.ttf", bold: "IBMPlexSans-Bold.ttf" },
};

function loadFonts(key: FontKey) {
  const def = FONT_FILES[key] ?? FONT_FILES.inter;
  const regular = loadFontFile(def.regular);
  const bold    = loadFontFile(def.bold);
  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] = [];
  if (regular) fonts.push({ name: def.display, data: regular, weight: 400, style: "normal" });
  if (bold)    fonts.push({ name: def.display, data: bold,    weight: 700, style: "normal" });
  return { fonts, family: fonts.length > 0 ? def.display : undefined };
}

function getStr(req: NextRequest, key: string, fallback = "") {
  return req.nextUrl.searchParams.get(key) ?? fallback;
}

export async function GET(req: NextRequest) {
  try {
    const platform   = (getStr(req, "p",   "instagram") as Platform);
    const template   = (getStr(req, "t",   "editorial") as Template);
    const paletteKey = (getStr(req, "pal", "lavender")  as PaletteName);
    const big        = getStr(req, "big",   "Untitled");
    const small      = getStr(req, "small", "");
    const kicker     = getStr(req, "k",     "");
    const fontKey    = (getStr(req, "font", "inter")    as FontKey);

    const dim = DIMENSIONS[platform] ?? DIMENSIONS.instagram;
    const pal = PALETTES[paletteKey] ?? PALETTES.lavender;
    const { fonts, family } = loadFonts(fontKey);

    const isLandscape = dim.w > dim.h;
    const minSide = Math.min(dim.w, dim.h);
    const bigSize    = template === "stat" ? minSide * 0.34 : minSide * (isLandscape ? 0.10 : 0.108);
    const smallSize  = minSide * 0.038;
    const kickerSize = minSide * 0.020;
    const padding    = minSide * 0.085;

    let body: React.ReactElement;

    // ───────── BOLD: large announcement, lavender or duo gradient ─────────
    if (template === "bold") {
      const bg =
        paletteKey === "duo"
          ? `linear-gradient(135deg, ${BRAND.lavender} 0%, ${BRAND.grape} 100%)`
          : paletteKey === "lavender"
          ? `linear-gradient(160deg, ${BRAND.lavender} 0%, ${BRAND.grape} 130%)`
          : `linear-gradient(135deg, ${pal.accent} 0%, ${pal.bg} 130%)`;
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            padding,
            background: bg,
            color: BRAND.white,
            fontFamily: family,
          }}
        >
          {kicker && (
            <div
              style={{
                fontSize: kickerSize,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                opacity: 0.9,
                marginBottom: minSide * 0.04,
                padding: `${minSide * 0.012}px ${minSide * 0.024}px`,
                border: "1.5px solid rgba(255,255,255,0.55)",
                borderRadius: 999,
              }}
            >
              {kicker}
            </div>
          )}
          <div
            style={{
              fontSize: bigSize,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              maxWidth: "92%",
            }}
          >
            {big}
          </div>
          {small && (
            <div
              style={{
                fontSize: smallSize,
                fontWeight: 400,
                opacity: 0.92,
                marginTop: minSide * 0.04,
                maxWidth: "78%",
                lineHeight: 1.4,
              }}
            >
              {small}
            </div>
          )}
          <div
            style={{
              position: "absolute",
              bottom: padding,
              left: padding,
              display: "flex",
              alignItems: "center",
              gap: minSide * 0.012,
              fontSize: kickerSize,
              opacity: 0.7,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: minSide * 0.018,
                height: minSide * 0.018,
                background: BRAND.white,
                borderRadius: 999,
              }}
            />
            <span>Studio</span>
          </div>
        </div>
      );
    }
    // ───────── STAT: huge number / phrase, smoke bg, grape accent ─────────
    else if (template === "stat") {
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding,
            background: `radial-gradient(ellipse at center, ${pal.bg2} 0%, ${pal.bg} 75%)`,
            color: pal.fg,
            textAlign: "center",
            fontFamily: family,
          }}
        >
          {kicker && (
            <div
              style={{
                fontSize: kickerSize,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: BRAND.lavender,
                marginBottom: minSide * 0.05,
              }}
            >
              {kicker}
            </div>
          )}
          <div
            style={{
              fontSize: bigSize,
              fontWeight: 700,
              lineHeight: 0.92,
              letterSpacing: "-0.04em",
              color: BRAND.grape,
            }}
          >
            {big}
          </div>
          {small && (
            <div
              style={{
                fontSize: smallSize,
                fontWeight: 400,
                color: pal.muted,
                marginTop: minSide * 0.05,
                maxWidth: "70%",
                lineHeight: 1.45,
              }}
            >
              {small}
            </div>
          )}
        </div>
      );
    }
    // ───────── MINIMAL: tons of whitespace, small mark, headline at bottom ─────────
    else if (template === "minimal") {
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: minSide * 0.10,
            background: pal.bg,
            color: pal.fg,
            fontFamily: family,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: minSide * 0.018 }}>
            <div
              style={{
                width: minSide * 0.06,
                height: minSide * 0.06,
                borderRadius: minSide * 0.014,
                background: BRAND.lavender,
              }}
            />
            {kicker && (
              <div
                style={{
                  fontSize: kickerSize,
                  fontWeight: 500,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: pal.muted,
                }}
              >
                {kicker}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: bigSize * 0.88,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                maxWidth: "92%",
              }}
            >
              {big}
            </div>
            {small && (
              <div
                style={{
                  fontSize: smallSize,
                  fontWeight: 400,
                  color: pal.muted,
                  marginTop: minSide * 0.025,
                  maxWidth: "78%",
                  lineHeight: 1.45,
                }}
              >
                {small}
              </div>
            )}
          </div>
        </div>
      );
    }
    // ───────── EDITORIAL: Apple Newsroom feel — white card, top kicker, body, brand mark bottom
    else {
      const isDark = paletteKey === "grape" || paletteKey === "jet";
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            background: pal.bg,
            color: pal.fg,
            fontFamily: family,
          }}
        >
          {/* Single content card with breathing room (Apple-style content layout) */}
          <div
            style={{
              flex: 1,
              margin: padding,
              padding: minSide * 0.06,
              background: isDark ? pal.bg2 : BRAND.white,
              borderRadius: minSide * 0.04,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: isDark
                ? "0 0 0 1px rgba(255,255,255,0.05)"
                : "0 1px 0 rgba(23,23,23,0.04), 0 24px 48px -16px rgba(45,0,77,0.10)",
            }}
          >
            {/* Top — kicker + brand dot */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontSize: kickerSize,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: BRAND.lavender,
                }}
              >
                {kicker || "Studio"}
              </div>
              <div
                style={{
                  width: minSide * 0.022,
                  height: minSide * 0.022,
                  borderRadius: 999,
                  background: BRAND.lavender,
                }}
              />
            </div>

            {/* Center — title + supporting */}
            <div style={{ display: "flex", flexDirection: "column", maxWidth: "92%" }}>
              <div
                style={{
                  fontSize: bigSize,
                  fontWeight: 700,
                  lineHeight: 1.04,
                  letterSpacing: "-0.025em",
                  color: pal.fg,
                }}
              >
                {big}
              </div>
              {small && (
                <div
                  style={{
                    fontSize: smallSize,
                    fontWeight: 400,
                    color: isDark ? pal.muted : "#3A3A3F",
                    marginTop: minSide * 0.03,
                    maxWidth: "85%",
                    lineHeight: 1.45,
                  }}
                >
                  {small}
                </div>
              )}
            </div>

            {/* Bottom — brand line */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: kickerSize,
                color: isDark ? pal.muted : "#74747A",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              <span>Content Studio</span>
              <span>{platform}</span>
            </div>
          </div>
        </div>
      );
    }

    return new ImageResponse(body, {
      width: dim.w,
      height: dim.h,
      fonts: fonts.length > 0 ? fonts : undefined,
    });
  } catch (e) {
    return new Response(`og error: ${(e as Error).message}`, { status: 500 });
  }
}
