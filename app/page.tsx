"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import {
  Sparkles,
  ArrowRight,
  Check,
  X,
  AlertTriangle,
  Copy,
  RefreshCw,
  ArrowLeft,
  Send,
  Loader2,
  Download,
  Settings as SettingsIcon,
  Minus,
  Plus,
  Type,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
type Platform = "linkedin" | "instagram" | "facebook" | "blog";

type DesignSpec = {
  template: "editorial" | "bold" | "stat" | "minimal";
  palette: "lavender" | "smoke" | "grape" | "jet" | "duo";
  big_text: string;
  small_text: string;
  kicker: string | null;
};

type Piece = {
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

type Verdict = "approved" | "rejected" | "review";
type Step = "compose" | "generating" | "approve" | "published";
type FontKey = "inter" | "plex";

const PLATFORMS: {
  key: Platform;
  label: string;
  format: string;
  tint: string;
  mark: string;
  aspect: string;
}[] = [
  { key: "linkedin",  label: "LinkedIn",  format: "Long-form post",     tint: "bg-lavender",      mark: "in", aspect: "16/9"  },
  { key: "instagram", label: "Instagram", format: "Carousel + caption", tint: "bg-[#E1306C]", mark: "Ig", aspect: "1/1"   },
  { key: "facebook",  label: "Facebook",  format: "Short post",         tint: "bg-[#1877F2]", mark: "fb", aspect: "1/1"   },
  { key: "blog",      label: "Blog",      format: "Article + hero",     tint: "bg-orange",    mark: "B",  aspect: "16/9"  },
];

const FONTS: { key: FontKey; name: string; vibe: string }[] = [
  { key: "inter", name: "Inter",         vibe: "Clean, modern — the SF stand-in" },
  { key: "plex",  name: "IBM Plex Sans", vibe: "Technical, precise"              },
];

type Settings = { font: FontKey };
const DEFAULT_SETTINGS: Settings = { font: "inter" };
const SETTINGS_KEY = "content-studio:settings";

// ── Page ───────────────────────────────────────────────────────────────
export default function Page() {
  const [step, setStep] = useState<Step>("compose");
  const [prompt, setPrompt] = useState("");
  const [counts, setCounts] = useState<Record<Platform, number>>({
    linkedin: 1,
    instagram: 1,
    facebook: 1,
    blog: 1,
  });
  const [picked, setPicked] = useState<Set<Platform>>(
    new Set(["linkedin", "instagram", "facebook", "blog"]),
  );
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* noop */
    }
  }, [settings]);

  const reset = () => {
    setStep("compose");
    setPieces([]);
    setVerdicts({});
    setError(null);
  };

  async function handleGenerate() {
    setError(null);
    setStep("generating");
    try {
      const channels = Array.from(picked).map((p) => ({ platform: p, count: counts[p] }));
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, channels, font: settings.font }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `${r.status} ${r.statusText}`);
      }
      const { pieces: result } = (await r.json()) as { pieces: Piece[] };
      setPieces(result);
      setVerdicts(
        Object.fromEntries(
          result.map((p) => [p.id, p.status === "ready" ? "approved" : "review"]),
        ),
      );
      setStep("approve");
    } catch (e) {
      setError((e as Error).message);
      setStep("compose");
    }
  }

  async function regeneratePiece(piece: Piece, adjustment: string) {
    const r = await fetch("/api/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: piece.id,
        prompt,
        platform: piece.platform,
        adjustment,
        font: settings.font,
      }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body?.error ?? `${r.status} ${r.statusText}`);
    }
    const { piece: fresh } = (await r.json()) as { piece: Piece };
    setPieces((prev) => prev.map((p) => (p.id === piece.id ? fresh : p)));
    // Move it back to approved if regen succeeded
    if (fresh.status === "ready") {
      setVerdicts((v) => ({ ...v, [piece.id]: "approved" }));
    }
  }

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-8 sm:px-8 sm:py-12">
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <StepIndicator step={step} />

      <div className="mt-10">
        {step === "compose" && (
          <ComposeStep
            prompt={prompt}
            setPrompt={setPrompt}
            picked={picked}
            setPicked={setPicked}
            counts={counts}
            setCounts={setCounts}
            error={error}
            onGenerate={handleGenerate}
          />
        )}

        {step === "generating" && (
          <GeneratingStep
            channels={Array.from(picked)}
            counts={counts}
          />
        )}

        {step === "approve" && (
          <ApproveStep
            pieces={pieces}
            verdicts={verdicts}
            setVerdicts={setVerdicts}
            onPublish={() => setStep("published")}
            onBack={reset}
            onRegenerate={regeneratePiece}
          />
        )}

        {step === "published" && (
          <PublishedStep
            count={Object.values(verdicts).filter((v) => v === "approved").length}
            onAgain={reset}
          />
        )}
      </div>

      <Footer />

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────
function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="mb-12 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-[10px] bg-gradient-to-br from-lavender to-grape text-[16px] font-bold text-white shadow-md">
          C
        </span>
        <div>
          <p className="text-headline">Content Studio</p>
          <p className="text-caption-1 text-label-tertiary">Powered by Claude</p>
        </div>
      </div>
      <button
        onClick={onOpenSettings}
        className="pressable inline-flex items-center gap-1.5 rounded-[10px] bg-fill px-3 py-2 text-footnote font-medium text-label hover:bg-fill-secondary"
      >
        <SettingsIcon className="size-4" strokeWidth={2.2} />
        Settings
      </button>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 flex items-center justify-between border-t border-separator pt-6 text-caption-1 text-label-tertiary">
      <span>Claude Opus 4.7 · Haiku 4.5</span>
      <span>One brief, four channels.</span>
    </footer>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string; n: number }[] = [
    { key: "compose",    label: "Compose",  n: 1 },
    { key: "generating", label: "Generate", n: 2 },
    { key: "approve",    label: "Approve",  n: 3 },
  ];
  const currentIdx =
    step === "compose" ? 0 : step === "generating" ? 1 : step === "approve" ? 2 : 3;

  return (
    <ol className="flex items-center gap-4">
      {steps.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "todo";
        return (
          <li key={s.key} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full text-[13px] font-bold transition-all",
                state === "done"   && "bg-green text-white",
                state === "active" && "bg-lavender text-white",
                state === "todo"   && "bg-fill text-label-tertiary",
              )}
            >
              {state === "done" ? <Check className="size-4" strokeWidth={3} /> : s.n}
            </span>
            <span
              className={cn(
                "text-callout font-semibold",
                state === "active" ? "text-label" : "text-label-tertiary",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1 transition-colors",
                  state === "done" ? "bg-green" : "bg-separator",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Step 1: Compose ────────────────────────────────────────────────────
function ComposeStep({
  prompt, setPrompt, picked, setPicked, counts, setCounts, error, onGenerate,
}: {
  prompt: string;
  setPrompt: (s: string) => void;
  picked: Set<Platform>;
  setPicked: (s: Set<Platform>) => void;
  counts: Record<Platform, number>;
  setCounts: (c: Record<Platform, number>) => void;
  error: string | null;
  onGenerate: () => void;
}) {
  const totalPosts = Array.from(picked).reduce((a, p) => a + counts[p], 0);
  const canRun = prompt.trim().length >= 4 && picked.size > 0 && totalPosts > 0;

  return (
    <div className="space-y-8">
      <div className="rise">
        <h1 className="text-large-title">
          What should we <span className="text-lavender">make</span>?
        </h1>
        <p className="mt-3 max-w-[60ch] text-body text-label-secondary">
          One sentence is enough. The studio writes copy <span className="text-label">and</span>{" "}
          designs the post image for every channel you pick — pick how many of each you want.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-[14px] border border-red/20 bg-red-soft px-5 py-3 text-callout text-red">
          <AlertTriangle className="size-4 shrink-0 translate-y-0.5" strokeWidth={2.4} />
          <span>{error}</span>
        </div>
      )}

      {/* Prompt */}
      <div className="rise rise-1 overflow-hidden rounded-[18px] bg-card shadow-md">
        <div className="flex items-center justify-between border-b border-separator px-5 py-3">
          <div className="flex items-center gap-2 text-headline">
            <Sparkles className="size-4 text-lavender" strokeWidth={2.2} />
            Brief
          </div>
          <span className="text-caption-1 font-mono text-label-tertiary num-tabular">
            {prompt.length.toLocaleString()} / 10,000
          </span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          spellCheck={false}
          rows={6}
          placeholder="e.g. Announce that we shipped dark mode. It follows system theme. Built on a new token layer."
          className="block w-full resize-none bg-card px-5 py-5 text-body leading-[1.55] text-label placeholder:text-label-tertiary focus:outline-none"
        />
      </div>

      {/* Channels with quantity */}
      <div className="rise rise-2">
        <h2 className="mb-3 text-title-3">Channels</h2>
        <div className="overflow-hidden rounded-[16px] bg-card shadow-md">
          {PLATFORMS.map((p, i) => {
            const on = picked.has(p.key);
            const count = counts[p.key];
            return (
              <div
                key={p.key}
                className={cn(
                  "flex items-center gap-3 px-5 py-4 transition-colors",
                  i < PLATFORMS.length - 1 && "border-b border-separator",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-[10px] text-white shadow-sm",
                    p.tint,
                  )}
                  style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.04em" }}
                >
                  {p.mark}
                </span>
                <div className="flex-1">
                  <p className="text-callout font-semibold">{p.label}</p>
                  <p className="text-footnote text-label-secondary">{p.format}</p>
                </div>

                {on && (
                  <Stepper
                    value={count}
                    min={1}
                    max={10}
                    onChange={(v) => setCounts({ ...counts, [p.key]: v })}
                  />
                )}

                <input
                  type="checkbox"
                  className="ios-switch"
                  checked={on}
                  onChange={() => {
                    const n = new Set(picked);
                    n.has(p.key) ? n.delete(p.key) : n.add(p.key);
                    setPicked(n);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Generate */}
      <div className="rise rise-3 flex items-center justify-between gap-4 rounded-[18px] bg-card p-5 shadow-md">
        <div>
          <p className="text-caption-1 uppercase tracking-wider text-label-tertiary">Estimate</p>
          <p className="mt-0.5 text-title-3">
            <span className="text-label">{totalPosts}</span>{" "}
            <span className="text-label-secondary">post{totalPosts === 1 ? "" : "s"}</span>{" "}
            <span className="text-label-secondary">·</span>{" "}
            <span className="text-label">~{Math.max(8, totalPosts * 4)}s</span>
          </p>
        </div>
        <button
          onClick={onGenerate}
          disabled={!canRun}
          className={cn(
            "pressable inline-flex items-center gap-2 rounded-[14px] px-6 py-3 text-headline shadow-md transition-all",
            canRun
              ? "bg-lavender text-white hover:brightness-110"
              : "cursor-not-allowed bg-fill text-label-tertiary",
          )}
        >
          Generate
          <ArrowRight className="size-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function Stepper({
  value, min, max, onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center rounded-full bg-fill p-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="pressable grid size-7 place-items-center rounded-full text-label hover:bg-card disabled:opacity-40"
      >
        <Minus className="size-3.5" strokeWidth={2.4} />
      </button>
      <span className="min-w-[2ch] px-2 text-center text-callout font-semibold tabular-nums">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="pressable grid size-7 place-items-center rounded-full text-label hover:bg-card disabled:opacity-40"
      >
        <Plus className="size-3.5" strokeWidth={2.4} />
      </button>
    </div>
  );
}

// ── Step 2: Generating ─────────────────────────────────────────────────
function GeneratingStep({
  channels, counts,
}: {
  channels: Platform[];
  counts: Record<Platform, number>;
}) {
  const total = channels.reduce((a, c) => a + counts[c], 0);
  return (
    <div className="rise rounded-[22px] bg-card p-12 text-center shadow-lg">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-lavender-soft text-lavender">
        <Loader2 className="size-7 animate-spin" strokeWidth={2.2} />
      </div>
      <h2 className="mt-6 text-title-1">We're on it.</h2>
      <p className="mx-auto mt-2 max-w-[44ch] text-body text-label-secondary">
        Writing copy and designing post images for {total} post{total === 1 ? "" : "s"} in parallel.
        First drafts come back in 5–20 seconds.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {channels.map((ch) => {
          const p = PLATFORMS.find((x) => x.key === ch)!;
          return (
            <span
              key={ch}
              className="inline-flex items-center gap-2 rounded-full bg-fill px-3 py-1.5 text-footnote font-medium"
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-[5px] text-white",
                  p.tint,
                )}
                style={{ fontSize: 9, fontWeight: 700 }}
              >
                {p.mark}
              </span>
              <span className="pulse-soft size-1.5 rounded-full bg-lavender" />
              {p.label} × {counts[ch]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 3: Approve ────────────────────────────────────────────────────
function ApproveStep({
  pieces, verdicts, setVerdicts, onPublish, onBack, onRegenerate,
}: {
  pieces: Piece[];
  verdicts: Record<string, Verdict>;
  setVerdicts: (v: Record<string, Verdict>) => void;
  onPublish: () => void;
  onBack: () => void;
  onRegenerate: (piece: Piece, adjustment: string) => Promise<void>;
}) {
  const counts = {
    approved: Object.values(verdicts).filter((v) => v === "approved").length,
    review:   Object.values(verdicts).filter((v) => v === "review").length,
    rejected: Object.values(verdicts).filter((v) => v === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-large-title">
            Almost there. <span className="text-lavender">Approve to publish.</span>
          </h1>
          <p className="mt-2 max-w-[60ch] text-body text-label-secondary">
            Review each post — image and copy together. Send back for review with notes to redo
            just that one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CounterPill label="Approve" count={counts.approved} tone="green" />
          <CounterPill label="Review"   count={counts.review}   tone="orange" />
          <CounterPill label="Reject"   count={counts.rejected} tone="red" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {pieces.map((p, idx) => (
          <PieceCard
            key={p.id}
            piece={p}
            verdict={verdicts[p.id]}
            index={idx}
            onSet={(v) => setVerdicts({ ...verdicts, [p.id]: v })}
            onRegenerate={onRegenerate}
          />
        ))}
      </div>

      <div className="rise rise-3 sticky bottom-4 flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-card p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-green-soft text-green">
            <Check className="size-5" strokeWidth={2.6} />
          </span>
          <div>
            <p className="text-headline">
              {counts.approved} approved · {counts.rejected} rejected
            </p>
            <p className="text-footnote text-label-secondary">
              Approved posts are ready for your scheduler.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="pressable inline-flex items-center gap-1.5 rounded-[12px] px-4 py-2.5 text-callout font-medium text-label-secondary hover:text-label"
          >
            <ArrowLeft className="size-4" strokeWidth={2.4} /> Back to brief
          </button>
          <button
            onClick={onPublish}
            disabled={counts.approved === 0}
            className={cn(
              "pressable inline-flex items-center gap-2 rounded-[12px] px-5 py-2.5 text-callout font-semibold shadow-md",
              counts.approved > 0
                ? "bg-lavender text-white hover:brightness-110"
                : "cursor-not-allowed bg-fill text-label-tertiary",
            )}
          >
            <Send className="size-4" strokeWidth={2.4} />
            Publish {counts.approved} post{counts.approved === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CounterPill({
  label, count, tone,
}: {
  label: string;
  count: number;
  tone: "green" | "orange" | "red";
}) {
  const TONE: Record<string, string> = {
    green:  "bg-green-soft text-green",
    orange: "bg-orange-soft text-orange",
    red:    "bg-red-soft text-red",
  };
  return (
    <div className={cn("flex items-baseline gap-1.5 rounded-full px-3 py-1.5", TONE[tone])}>
      <span className="text-callout font-bold num-tabular">{count}</span>
      <span className="text-caption-1 font-semibold uppercase tracking-wider">{label}</span>
    </div>
  );
}

function PieceCard({
  piece, verdict, index, onSet, onRegenerate,
}: {
  piece: Piece;
  verdict: Verdict;
  index: number;
  onSet: (v: Verdict) => void;
  onRegenerate: (p: Piece, adjustment: string) => Promise<void>;
}) {
  const platform = PLATFORMS.find((p) => p.key === piece.platform)!;
  const isFailed = piece.status === "failed";
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"image" | "copy">("image");
  const [adjustment, setAdjustment] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  async function handleRegenerate() {
    if (!adjustment.trim()) return;
    setRegenError(null);
    setRegenerating(true);
    try {
      await onRegenerate(piece, adjustment.trim());
      setAdjustment("");
    } catch (e) {
      setRegenError((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <article
      className={cn(
        "rise group relative flex flex-col overflow-hidden rounded-[18px] bg-card shadow-md transition-all",
        verdict === "approved" && !isFailed && "ring-2 ring-green/40",
        verdict === "rejected" && "opacity-60",
        verdict === "review"   && "ring-2 ring-orange/40",
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-separator px-5 py-3.5">
        <span
          className={cn(
            "grid size-8 place-items-center rounded-[8px] text-white shadow-sm",
            platform.tint,
          )}
          style={{ fontSize: 12, fontWeight: 700 }}
        >
          {platform.mark}
        </span>
        <div className="flex-1">
          <p className="text-callout font-semibold">{platform.label}</p>
          <p className="text-caption-1 text-label-tertiary">{platform.format}</p>
        </div>
        {isFailed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-soft px-2.5 py-1 text-caption-1 font-semibold text-red">
            <AlertTriangle className="size-3" strokeWidth={2.4} />
            Failed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2.5 py-1 text-caption-1 font-semibold text-green">
            <span className="size-1.5 rounded-full bg-green" />
            Ready
          </span>
        )}
      </div>

      {/* Body */}
      {isFailed ? (
        <div className="p-5">
          <p className="text-callout text-red">{piece.error ?? "Generation failed."}</p>
        </div>
      ) : (
        <>
          {/* Image / Copy tabs */}
          <div className="flex items-center gap-1 border-b border-separator px-3 py-2">
            <TabButton active={tab === "image"} onClick={() => setTab("image")}>Image</TabButton>
            <TabButton active={tab === "copy"}  onClick={() => setTab("copy")}>Copy</TabButton>
            {piece.design && (
              <span className="ml-auto text-caption-1 text-label-tertiary capitalize">
                {piece.design.template} · {piece.design.palette}
              </span>
            )}
          </div>

          {tab === "image" && piece.image_url ? (
            <div
              className="relative w-full overflow-hidden bg-fill"
              style={{ aspectRatio: platform.aspect }}
            >
              <Image
                src={piece.image_url}
                alt={piece.title}
                fill
                unoptimized
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <a
                href={piece.image_url}
                download={`${piece.platform}-${piece.id}.png`}
                className="pressable absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-caption-1 font-medium text-white backdrop-blur"
                title="Download image"
              >
                <Download className="size-3.5" strokeWidth={2.2} />
                PNG
              </a>
            </div>
          ) : (
            <div className="p-5">
              <p className="text-headline">{piece.title}</p>
              <p className="mt-2 line-clamp-[10] whitespace-pre-line text-callout leading-[1.6] text-label-secondary">
                {piece.body}
              </p>
              {piece.hashtags && piece.hashtags.length > 0 && (
                <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-footnote font-medium text-lavender">
                  {piece.hashtags.map((h) => <span key={h}>{h}</span>)}
                </p>
              )}
              {piece.slides && piece.slides.length > 0 && (
                <details className="mt-3 rounded-[8px] bg-fill px-3 py-2">
                  <summary className="cursor-pointer text-footnote font-semibold text-label-secondary">
                    {piece.slides.length} carousel slides
                  </summary>
                  <ol className="mt-2 space-y-2 text-footnote">
                    {piece.slides.map((s, i) => (
                      <li
                        key={i}
                        className="border-t border-separator pt-2 first:border-t-0 first:pt-0"
                      >
                        <p className="font-semibold text-label">
                          {String(i + 1).padStart(2, "0")} · {s.headline}
                        </p>
                        <p className="mt-0.5 text-label-secondary">{s.body}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          )}
        </>
      )}

      {/* Verdict + actions */}
      <div className="border-t border-separator p-3">
        <div className="flex items-center gap-1.5">
          <VerdictButton
            tone="green"
            label="Approve"
            icon={<Check className="size-3.5" strokeWidth={2.6} />}
            active={verdict === "approved"}
            onClick={() => onSet("approved")}
            disabled={isFailed}
          />
          <VerdictButton
            tone="orange"
            label="Review"
            icon={<AlertTriangle className="size-3.5" strokeWidth={2.4} />}
            active={verdict === "review"}
            onClick={() => onSet("review")}
          />
          <VerdictButton
            tone="red"
            label="Reject"
            icon={<X className="size-3.5" strokeWidth={2.4} />}
            active={verdict === "rejected"}
            onClick={() => onSet("rejected")}
          />
        </div>

        {/* Review comment + regenerate, only when verdict === "review" */}
        {verdict === "review" && !isFailed && (
          <div className="mt-3 rounded-[12px] bg-orange-soft/40 p-3">
            <label className="text-caption-1 font-semibold uppercase tracking-wider text-orange">
              What should change?
            </label>
            <textarea
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="e.g. Make the headline shorter and use the indigo palette. Tone it down."
              className="mt-1 block w-full resize-none rounded-[8px] bg-card px-3 py-2 text-footnote leading-[1.5] text-label placeholder:text-label-tertiary focus:outline-none"
            />
            {regenError && (
              <p className="mt-2 text-caption-1 text-red">{regenError}</p>
            )}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={handleRegenerate}
                disabled={!adjustment.trim() || regenerating}
                className={cn(
                  "pressable inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-caption-1 font-semibold transition-all",
                  adjustment.trim() && !regenerating
                    ? "bg-orange text-white hover:brightness-110"
                    : "cursor-not-allowed bg-fill text-label-tertiary",
                )}
              >
                {regenerating ? (
                  <>
                    <Loader2 className="size-3 animate-spin" strokeWidth={2.4} />
                    Redoing…
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3" strokeWidth={2.4} />
                    Redo this one
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-end border-t border-separator pt-2 text-caption-1 text-label-tertiary">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(piece.body);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            disabled={isFailed}
            className="pressable inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-label-secondary hover:bg-fill disabled:opacity-40"
          >
            {copied ? (
              <>
                <Check className="size-3" strokeWidth={2.4} /> Copied
              </>
            ) : (
              <>
                <Copy className="size-3" strokeWidth={2.2} /> Copy text
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

function TabButton({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "pressable rounded-[8px] px-3 py-1.5 text-footnote font-semibold transition-colors",
        active
          ? "bg-fill text-label"
          : "text-label-tertiary hover:bg-fill/60 hover:text-label-secondary",
      )}
    >
      {children}
    </button>
  );
}

function VerdictButton({
  tone, label, icon, active, onClick, disabled = false,
}: {
  tone: "green" | "orange" | "red";
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const ACTIVE: Record<string, string> = {
    green:  "bg-green text-white",
    orange: "bg-orange text-white",
    red:    "bg-red text-white",
  };
  const REST: Record<string, string> = {
    green:  "bg-green-soft text-green hover:bg-green/20",
    orange: "bg-orange-soft text-orange hover:bg-orange/20",
    red:    "bg-red-soft text-red hover:bg-red/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pressable inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2 text-footnote font-semibold transition-all",
        active ? ACTIVE[tone] : REST[tone],
        disabled && "opacity-40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Step 4: Published ──────────────────────────────────────────────────
function PublishedStep({ count, onAgain }: { count: number; onAgain: () => void }) {
  return (
    <div className="rise rounded-[22px] bg-card p-12 text-center shadow-lg">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-green-soft text-green">
        <Check className="size-8" strokeWidth={3} />
      </div>
      <h2 className="mt-6 text-large-title">Published.</h2>
      <p className="mx-auto mt-2 max-w-[44ch] text-body text-label-secondary">
        {count} post{count === 1 ? "" : "s"} ready. Open another brief whenever you're ready.
      </p>
      <button
        onClick={onAgain}
        className="pressable mt-6 inline-flex items-center gap-2 rounded-[12px] bg-lavender px-5 py-2.5 text-callout font-semibold text-white shadow-md hover:brightness-110"
      >
        <RefreshCw className="size-4" strokeWidth={2.4} />
        New brief
      </button>
    </div>
  );
}

// ── Settings panel ─────────────────────────────────────────────────────
function SettingsPanel({
  settings, onChange, onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-label/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-bg shadow-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "rise 280ms cubic-bezier(0.32, 0.72, 0, 1) both" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-separator bg-bg/85 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-headline">Settings</p>
            <p className="text-footnote text-label-secondary">
              Choose the design system used in your post images.
            </p>
          </div>
          <button
            onClick={onClose}
            className="pressable grid size-9 place-items-center rounded-full bg-fill text-label hover:bg-fill-secondary"
          >
            <X className="size-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="space-y-8 p-6">
          {/* Font picker */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Type className="size-4 text-lavender" strokeWidth={2.2} />
              <h3 className="text-callout font-semibold">Display font</h3>
            </div>
            <p className="mb-4 text-footnote text-label-secondary">
              The font baked into every rendered post image. Pick the vibe — it loads at edge time
              and is cached after the first request.
            </p>
            <div className="space-y-2">
              {FONTS.map((f) => {
                const active = settings.font === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => onChange({ ...settings, font: f.key })}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[12px] border bg-card px-4 py-3 text-left transition-colors",
                      active
                        ? "border-lavender bg-lavender-soft"
                        : "border-separator hover:bg-fill",
                    )}
                  >
                    <div>
                      <p
                        className={cn(
                          "text-callout font-semibold",
                          active ? "text-lavender" : "text-label",
                        )}
                      >
                        {f.name}
                      </p>
                      <p className="text-footnote text-label-secondary">{f.vibe}</p>
                    </div>
                    {active && <Check className="size-4 text-lavender" strokeWidth={2.6} />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Custom font upload — soon */}
          <section>
            <h3 className="mb-2 text-callout font-semibold">Upload custom font</h3>
            <div className="rounded-[12px] border border-dashed border-separator bg-fill/40 p-5 text-center">
              <p className="text-footnote font-medium text-label-secondary">
                Drop a TTF or OTF file
              </p>
              <p className="mt-1 text-caption-1 text-label-tertiary">
                Coming next — needs a small storage layer to host the file. For now use the curated
                list.
              </p>
            </div>
          </section>

          <p className="text-caption-1 text-label-tertiary">
            Settings persist locally in your browser. They never leave this device.
          </p>
        </div>
      </div>
    </div>
  );
}
