import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

type Platform = "linkedin" | "instagram" | "facebook" | "blog";
type Template = "editorial" | "bold" | "stat" | "minimal";
type PaletteName = "mono" | "vermillion" | "indigo" | "forest" | "amber" | "cream";
type FontKey = "inter" | "space-grotesk" | "playfair" | "plex" | "fraunces";

const DIMENSIONS: Record<Platform, { w: number; h: number }> = {
  linkedin:  { w: 1920, h: 1080 },
  instagram: { w: 1080, h: 1080 },
  facebook:  { w: 1200, h: 1200 },
  blog:      { w: 1920, h: 1080 },
};

type Palette = { bg: string; bg2: string; fg: string; muted: string; accent: string };

const PALETTES: Record<PaletteName, Palette> = {
  mono:        { bg: "#FFFFFF",  bg2: "#F2F2F2", fg: "#0A0A0A", muted: "#6B7280", accent: "#000000" },
  vermillion:  { bg: "#F8F3EE",  bg2: "#EFE5DA", fg: "#1A0E08", muted: "#8C6F5C", accent: "#E04D2A" },
  indigo:      { bg: "#0F1530",  bg2: "#1B2447", fg: "#F2F4FF", muted: "#9CA8D8", accent: "#7C8CFF" },
  forest:      { bg: "#0F1F18",  bg2: "#1A3329", fg: "#EAF6EE", muted: "#8FB7A2", accent: "#3FCB7E" },
  amber:       { bg: "#1B130A",  bg2: "#2C2010", fg: "#FAEED1", muted: "#C8A872", accent: "#F2B344" },
  cream:       { bg: "#F8F4EE",  bg2: "#EAE2D2", fg: "#1A1814", muted: "#7A6E5B", accent: "#B85A2C" },
};

const FONTS: Record<FontKey, { name: string; bold: string; regular: string }> = {
  inter: {
    name: "Inter",
    regular: "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.otf",
    bold:    "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.otf",
  },
  "space-grotesk": {
    name: "Space Grotesk",
    regular: "https://raw.githubusercontent.com/floriankarsten/space-grotesk/master/fonts/ttf/SpaceGrotesk-Regular.ttf",
    bold:    "https://raw.githubusercontent.com/floriankarsten/space-grotesk/master/fonts/ttf/SpaceGrotesk-Bold.ttf",
  },
  playfair: {
    name: "Playfair Display",
    regular: "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
    bold:    "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
  },
  plex: {
    name: "IBM Plex Sans",
    regular: "https://raw.githubusercontent.com/IBM/plex/master/IBM-Plex-Sans/fonts/complete/ttf/IBMPlexSans-Regular.ttf",
    bold:    "https://raw.githubusercontent.com/IBM/plex/master/IBM-Plex-Sans/fonts/complete/ttf/IBMPlexSans-Bold.ttf",
  },
  fraunces: {
    name: "Fraunces",
    regular: "https://raw.githubusercontent.com/undercasetype/Fraunces/main/fonts/static/Fraunces/Fraunces-Regular.ttf",
    bold:    "https://raw.githubusercontent.com/undercasetype/Fraunces/main/fonts/static/Fraunces/Fraunces-Bold.ttf",
  },
};

async function loadFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

function getStr(req: NextRequest, key: string, fallback = "") {
  return req.nextUrl.searchParams.get(key) ?? fallback;
}

export async function GET(req: NextRequest) {
  const platform   = (getStr(req, "p", "instagram")   as Platform);
  const template   = (getStr(req, "t", "editorial")   as Template);
  const paletteKey = (getStr(req, "pal", "mono")      as PaletteName);
  const big        = getStr(req, "big",   "Untitled");
  const small      = getStr(req, "small", "");
  const kicker     = getStr(req, "k",     "");
  const fontKey    = (getStr(req, "font", "inter") as FontKey);

  const dim = DIMENSIONS[platform] ?? DIMENSIONS.instagram;
  const pal = PALETTES[paletteKey] ?? PALETTES.mono;

  const fontDef = FONTS[fontKey] ?? FONTS.inter;
  const [regular, bold] = await Promise.all([
    loadFont(fontDef.regular),
    loadFont(fontDef.bold),
  ]);
  const fonts = [
    regular && { name: fontDef.name, data: regular, weight: 400 as const, style: "normal" as const },
    bold    && { name: fontDef.name, data: bold,    weight: 700 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[];
  const fontFamily = fonts.length > 0 ? fontDef.name : undefined;

  const isLandscape = dim.w > dim.h;
  const minSide = Math.min(dim.w, dim.h);
  const bigSize    = template === "stat" ? minSide * 0.36 : minSide * (isLandscape ? 0.10 : 0.11);
  const smallSize  = minSide * 0.038;
  const kickerSize = minSide * 0.022;
  const isDark = parseInt(pal.bg.slice(1, 3), 16) < 128;

  let body: React.ReactElement;

  if (template === "bold") {
    body = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: minSide * 0.08,
          background: `linear-gradient(135deg, ${pal.accent} 0%, ${pal.bg} 130%)`,
          color: isDark ? pal.fg : "#FFFFFF",
          fontFamily,
        }}
      >
        {kicker && (
          <div
            style={{
              fontSize: kickerSize,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              opacity: 0.85,
              marginBottom: minSide * 0.04,
              padding: `${minSide * 0.012}px ${minSide * 0.024}px`,
              border: "2px solid currentColor",
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
            textShadow: "0 2px 30px rgba(0,0,0,0.18)",
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
              maxWidth: "75%",
              lineHeight: 1.35,
            }}
          >
            {small}
          </div>
        )}
      </div>
    );
  } else if (template === "stat") {
    body = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: minSide * 0.08,
          background: `radial-gradient(ellipse at top, ${pal.bg2} 0%, ${pal.bg} 70%)`,
          color: pal.fg,
          textAlign: "center",
          fontFamily,
        }}
      >
        {kicker && (
          <div
            style={{
              fontSize: kickerSize,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: pal.accent,
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
            color: pal.accent,
          }}
        >
          {big}
        </div>
        {small && (
          <div
            style={{
              fontSize: smallSize,
              fontWeight: 400,
              opacity: 0.85,
              marginTop: minSide * 0.05,
              maxWidth: "70%",
              lineHeight: 1.35,
            }}
          >
            {small}
          </div>
        )}
      </div>
    );
  } else if (template === "minimal") {
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
          fontFamily,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: minSide * 0.018,
          }}
        >
          <div
            style={{
              width: minSide * 0.06,
              height: minSide * 0.06,
              borderRadius: minSide * 0.014,
              background: pal.accent,
            }}
          />
          {kicker && (
            <div
              style={{
                fontSize: kickerSize,
                fontWeight: 400,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                opacity: 0.65,
              }}
            >
              {kicker}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: bigSize * 0.85,
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
                opacity: 0.65,
                marginTop: minSide * 0.025,
                maxWidth: "75%",
                lineHeight: 1.4,
              }}
            >
              {small}
            </div>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: minSide * 0.08,
          background: pal.bg,
          color: pal.fg,
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
          fontFamily,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: minSide * 0.08,
            left: minSide * 0.08,
            right: minSide * 0.08,
            display: "flex",
            justifyContent: "space-between",
            fontSize: kickerSize,
            fontWeight: 400,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: pal.muted,
          }}
        >
          <span>{kicker || "Studio"}</span>
          <span>№ 01</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "85%" }}>
          <div
            style={{
              fontSize: bigSize,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              color: pal.fg,
            }}
          >
            {big}
          </div>
          {small && (
            <div
              style={{
                fontSize: smallSize * 1.05,
                fontWeight: 400,
                fontStyle: "italic",
                color: pal.accent,
                marginTop: minSide * 0.035,
                maxWidth: "85%",
                lineHeight: 1.35,
              }}
            >
              {small}
            </div>
          )}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: minSide * 0.08,
            left: minSide * 0.08,
            right: minSide * 0.08,
            display: "flex",
            justifyContent: "space-between",
            fontSize: kickerSize * 0.85,
            color: pal.muted,
            borderTop: `1px solid ${pal.muted}`,
            paddingTop: minSide * 0.02,
            opacity: 0.7,
          }}
        >
          <span>Content Studio</span>
          <span style={{ color: pal.accent }}>●</span>
        </div>
      </div>
    );
  }

  return new ImageResponse(body, {
    width: dim.w,
    height: dim.h,
    fonts: fonts.length > 0 ? fonts : undefined,
  });
}
