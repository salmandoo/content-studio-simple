"use client";

import { useState } from "react";
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
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
type Platform = "linkedin" | "instagram" | "facebook" | "blog";

type DesignSpec = {
  template: "editorial" | "bold" | "stat" | "minimal";
  palette: "mono" | "vermillion" | "indigo" | "forest" | "amber" | "cream";
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
  tokens_in: number;
  tokens_out: number;
  cost_cents: number;
  error?: string;
};

type Verdict = "approved" | "rejected" | "review";
type Step = "compose" | "generating" | "approve" | "published";

const PLATFORMS: { key: Platform; label: string; format: string; tint: string; mark: string; aspect: string }[] = [
  { key: "linkedin",  label: "LinkedIn",  format: "Long-form post",     tint: "bg-blue",      mark: "in", aspect: "16/9"  },
  { key: "instagram", label: "Instagram", format: "Carousel + caption", tint: "bg-[#E1306C]", mark: "Ig", aspect: "1/1"   },
  { key: "facebook",  label: "Facebook",  format: "Short post",         tint: "bg-[#1877F2]", mark: "fb", aspect: "1/1"   },
  { key: "blog",      label: "Blog",      format: "Article + hero",     tint: "bg-orange",    mark: "B",  aspect: "16/9"  },
];

// ── Page ───────────────────────────────────────────────────────────────
export default function Page() {
  const [step, setStep] = useState<Step>("compose");
  const [prompt, setPrompt] = useState("");
  const [picked, setPicked] = useState<Set<Platform>>(
    new Set(["linkedin", "instagram", "facebook", "blog"]),
  );
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [error, setError] = useState<string | null>(null);

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
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, channels: Array.from(picked) }),
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

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-8 sm:px-8 sm:py-12">
      <Header />

      <StepIndicator step={step} />

      <div className="mt-10">
        {step === "compose" && (
          <ComposeStep
            prompt={prompt}
            setPrompt={setPrompt}
            picked={picked}
            setPicked={setPicked}
            error={error}
            onGenerate={handleGenerate}
          />
        )}

        {step === "generating" && <GeneratingStep channels={Array.from(picked)} />}

        {step === "approve" && (
          <ApproveStep
            pieces={pieces}
            verdicts={verdicts}
            setVerdicts={setVerdicts}
            onPublish={() => setStep("published")}
            onBack={reset}
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
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="mb-12 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-[10px] bg-gradient-to-br from-blue to-purple text-[16px] font-bold text-white shadow-md">
          C
        </span>
        <div>
          <p className="text-headline">Content Studio</p>
          <p className="text-caption-1 text-label-tertiary">Powered by Claude</p>
        </div>
      </div>
      <a
        href="https://github.com/salmandoo/content-studio-simple"
        target="_blank"
        rel="noreferrer"
        className="text-footnote text-label-secondary hover:text-label"
      >
        GitHub →
      </a>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 flex items-center justify-between border-t border-separator pt-6 text-caption-1 text-label-tertiary">
      <span>Claude Opus 4.7 · Haiku 4.5 · OG-rendered visuals</span>
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
                state === "active" && "bg-blue text-white",
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
  prompt, setPrompt, picked, setPicked, error, onGenerate,
}: {
  prompt: string;
  setPrompt: (s: string) => void;
  picked: Set<Platform>;
  setPicked: (s: Set<Platform>) => void;
  error: string | null;
  onGenerate: () => void;
}) {
  const canRun = prompt.trim().length >= 4 && picked.size > 0;
  return (
    <div className="space-y-8">
      <div className="rise">
        <h1 className="text-large-title">
          What should we <span className="text-blue">make</span>?
        </h1>
        <p className="mt-3 max-w-[60ch] text-body text-label-secondary">
          One sentence is enough. The studio writes copy <span className="text-label">and</span> designs the post image for every channel you pick.
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
            <Sparkles className="size-4 text-blue" strokeWidth={2.2} />
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
          placeholder="e.g. Announce that we shipped dark mode in our app. It follows system theme. Built on a new token layer."
          className="block w-full resize-none bg-card px-5 py-5 text-body leading-[1.55] text-label placeholder:text-label-tertiary focus:outline-none"
        />
      </div>

      {/* Channels */}
      <div className="rise rise-2">
        <h2 className="mb-3 text-title-3">Channels</h2>
        <div className="overflow-hidden rounded-[16px] bg-card shadow-md">
          {PLATFORMS.map((p, i) => {
            const on = picked.has(p.key);
            return (
              <label
                key={p.key}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-fill",
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
              </label>
            );
          })}
        </div>
      </div>

      {/* Generate */}
      <div className="rise rise-3 flex items-center justify-between gap-4 rounded-[18px] bg-card p-5 shadow-md">
        <div>
          <p className="text-caption-1 uppercase tracking-wider text-label-tertiary">Estimate</p>
          <p className="mt-0.5 text-title-3">
            <span className="text-label">{picked.size}</span>{" "}
            <span className="text-label-secondary">post{picked.size === 1 ? "" : "s"}</span>{" "}
            <span className="text-label-secondary">·</span>{" "}
            <span className="text-label">~{Math.max(8, picked.size * 4)}s</span>
          </p>
        </div>
        <button
          onClick={onGenerate}
          disabled={!canRun}
          className={cn(
            "pressable inline-flex items-center gap-2 rounded-[14px] px-6 py-3 text-headline shadow-md transition-all",
            canRun
              ? "bg-blue text-white hover:brightness-110"
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

// ── Step 2: Generating ─────────────────────────────────────────────────
function GeneratingStep({ channels }: { channels: Platform[] }) {
  return (
    <div className="rise rounded-[22px] bg-card p-12 text-center shadow-lg">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-blue-soft text-blue">
        <Loader2 className="size-7 animate-spin" strokeWidth={2.2} />
      </div>
      <h2 className="mt-6 text-title-1">We're on it.</h2>
      <p className="mx-auto mt-2 max-w-[44ch] text-body text-label-secondary">
        Writing copy and designing post images for {channels.length} channel{channels.length === 1 ? "" : "s"} in parallel.
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
              <span className="pulse-soft size-1.5 rounded-full bg-blue" />
              {p.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 3: Approve ────────────────────────────────────────────────────
function ApproveStep({
  pieces, verdicts, setVerdicts, onPublish, onBack,
}: {
  pieces: Piece[];
  verdicts: Record<string, Verdict>;
  setVerdicts: (v: Record<string, Verdict>) => void;
  onPublish: () => void;
  onBack: () => void;
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
            Almost there. <span className="text-blue">Approve to publish.</span>
          </h1>
          <p className="mt-2 max-w-[60ch] text-body text-label-secondary">
            Review the post — copy and visual together. Approve, send back for review, or reject.
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
                ? "bg-blue text-white hover:brightness-110"
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
  piece, verdict, index, onSet,
}: {
  piece: Piece;
  verdict: Verdict;
  index: number;
  onSet: (v: Verdict) => void;
}) {
  const platform = PLATFORMS.find((p) => p.key === piece.platform)!;
  const isFailed = piece.status === "failed";
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"image" | "copy">("image");

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
            <TabButton active={tab === "image"} onClick={() => setTab("image")}>
              Image
            </TabButton>
            <TabButton active={tab === "copy"} onClick={() => setTab("copy")}>
              Copy
            </TabButton>
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
                <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-footnote font-medium text-blue">
                  {piece.hashtags.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
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
        <div className="mt-2 flex items-center justify-between border-t border-separator pt-2 text-caption-1 text-label-tertiary">
          <span className="font-mono num-tabular">
            {piece.tokens_in + piece.tokens_out} tok · ${(piece.cost_cents / 100).toFixed(2)}
          </span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(piece.body);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            disabled={isFailed}
            className="pressable inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-label-secondary hover:bg-fill disabled:opacity-40"
            title="Copy"
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
        className="pressable mt-6 inline-flex items-center gap-2 rounded-[12px] bg-blue px-5 py-2.5 text-callout font-semibold text-white shadow-md hover:brightness-110"
      >
        <RefreshCw className="size-4" strokeWidth={2.4} />
        New brief
      </button>
    </div>
  );
}
