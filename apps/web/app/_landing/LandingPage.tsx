"use client";

import { Loader2 } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { signIn, useSession } from "../../lib/auth-client";

/**
 * Slice 08 — the logged-out marketing landing page at `/`.
 * Craft redesign: "Deep Indigo restraint" palette, Bricolage Grotesque display + Hanken Grotesk
 * body, recomposed layout, layered depth, and purposeful motion (SSR-safe scroll reveals +
 * hero parallax). Presence colors (blue/orange/green) stay reserved for live-collaboration UI in
 * the product mockups. Tailwind v4 theme tokens + keyframes live in `app/globals.css`.
 * OAuth CTAs reuse the slice-02 Better Auth `signIn.social` flow.
 */

type Provider = "google" | "github";

function signInWith(provider: Provider) {
  void signIn.social({
    provider,
    callbackURL: `${window.location.origin}/dashboard`,
  });
}

/* Depth system (landing only). Light surfaces: a tight contact shadow + a soft ambient one.
   On hover, the ambient shadow warms toward the indigo accent and the card lifts. */
const CARD_REST =
  "shadow-[0_1px_2px_oklch(0.2_0.02_275_/_0.04),0_10px_30px_oklch(0.2_0.02_275_/_0.05)]";
const CARD_HOVER =
  "hover:shadow-[0_2px_6px_oklch(0.47_0.15_275_/_0.08),0_22px_50px_oklch(0.47_0.15_275_/_0.14)]";
const PANEL_DARK =
  "shadow-[0_1px_0_oklch(1_0_0_/_0.06)_inset,0_30px_80px_oklch(0.1_0.02_275_/_0.6)]";

const BTN =
  "inline-flex cursor-pointer items-center gap-[10px] font-semibold transition-all duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/70 focus-visible:ring-offset-2";
const CHECK_ROW = "flex items-start gap-3";
const BULLET_TEXT = "text-[15px] leading-[1.55] text-[oklch(0.82_0.01_275)]";
// Hero on dark ink: light surface (Google) + outline (GitHub).
const HERO_GOOGLE = `${BTN} rounded-[12px] border-none bg-surface px-[22px] py-[13px] text-[15px] tracking-[-0.2px] text-ink-fg shadow-[0_2px_10px_oklch(0.1_0.02_275_/_0.5)] ring-offset-ink hover:-translate-y-[2px] hover:shadow-[0_12px_30px_oklch(0.1_0.02_275_/_0.6)]`;
const HERO_GITHUB = `${BTN} rounded-[12px] border-[1.5px] border-[oklch(1_0_0_/_0.16)] bg-[oklch(1_0_0_/_0.02)] px-[22px] py-[13px] text-[15px] tracking-[-0.2px] text-fg ring-offset-ink hover:-translate-y-[2px] hover:border-iris/60 hover:bg-iris/[0.08]`;
// Final CTA on light paper: indigo primary (Google) + near-black secondary (GitHub).
const CTA_GOOGLE = `${BTN} rounded-[13px] border-none bg-brand px-[26px] py-[15px] text-[16px] tracking-[-0.3px] text-white shadow-[0_2px_14px_oklch(0.47_0.15_275_/_0.35)] ring-offset-paper hover:-translate-y-[2px] hover:shadow-[0_14px_34px_oklch(0.47_0.15_275_/_0.42)]`;
const CTA_GITHUB = `${BTN} rounded-[13px] border-none bg-ink-fg px-[26px] py-[15px] text-[16px] tracking-[-0.3px] text-white shadow-[0_2px_10px_oklch(0.17_0.015_275_/_0.18)] ring-offset-paper hover:-translate-y-[2px] hover:bg-ink`;

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.25-.163-1.84H9v3.48h4.844a4.14 4.14 0 0 1-1.796 2.716v2.26h2.908c1.702-1.567 2.684-3.875 2.684-6.616Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.861-3.048.861-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12Z" />
    </svg>
  );
}

/** The Yapper wordmark glyph. Size/radius vary by placement, so dimensions stay inline. */
function LogoMark({ size = 32, radius = 9 }: { size?: number; radius?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center bg-brand shadow-[0_2px_8px_oklch(0.47_0.15_275_/_0.4)]"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden="true">
        <path d="M1 1.5h15M1 6h11M1 10.5h13" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** A small check in the collaborator's color, used by the presence/private bulleted lists. */
function CheckBullet({ bg, stroke = "white" }: { bg: string; stroke?: string }) {
  return (
    <div
      className="mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ background: bg }}
    >
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
        <path
          d="M1 4l2.5 2.5L9 1"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* Feature icons are monochrome indigo (restraint). Presence colors stay reserved for the live
   mockups below, per the design system's Presence-Only rule. `wide` marks the two flagship
   differentiators that get the larger treatment in the asymmetric grid. */
const features = [
  {
    title: "Real identities only",
    body: "Google or GitHub login, every time. No anonymous access — every cursor on the page is a real, tracked person you can name.",
    wide: true,
    icon: (
      <>
        <circle cx="10" cy="7.5" r="3.5" strokeWidth="1.7" />
        <path d="M3 18c0-3.866 3.134-7 7-7s7 3.134 7 7" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "Privacy is a switch",
    body: "One access level per note — private, view, or edit. Flip to private and every collaborator disconnects instantly; the share link rotates.",
    wide: true,
    icon: (
      <>
        <rect x="4.5" y="9" width="11" height="8" rx="1.6" strokeWidth="1.7" />
        <path d="M7.5 9V6.8a2.5 2.5 0 0 1 5 0V9" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "Conflict-free editing",
    body: "Multiple people edit the same note simultaneously — powered by CRDTs, so no one overwrites anyone.",
    icon: (
      <path
        d="M4 3v5.5L10 14v3M16 3v5.5L10 14"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Live presence",
    body: "Every collaborator's cursor and selection appears in real time — labeled with their name, color-coded.",
    icon: (
      <path
        d="M4 2.5l3.5 14 2.8-4.5H15L4 2.5Z"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Rich text formatting",
    body: "Bold, italic, headings, lists — real structure. Your notes look like notes, not a wall of plain text.",
    icon: (
      <>
        <path d="M5 4h5.5a2.5 2.5 0 0 1 0 5H5V4Z" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M5 9h6a2.5 2.5 0 0 1 0 5H5V9Z" strokeWidth="1.7" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Capability-link sharing",
    body: "Share via an unguessable link. Opening it requires login — and adds them to your tracked collaborator list.",
    icon: (
      <>
        <path
          d="M8.5 11.5a4.243 4.243 0 0 0 6 0l2-2a4.243 4.243 0 0 0-6-6l-1 1"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M11.5 8.5a4.243 4.243 0 0 0-6 0l-2 2a4.243 4.243 0 0 0 6 6l1-1"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </>
    ),
  },
];

const comparisonRows = [
  { typical: "Anonymous cursors — a color, no name", yapper: "A real name behind every cursor" },
  { typical: "Anyone with the link can edit", yapper: "Login required — no anonymous access" },
  { typical: "Revoke by rotating the link and hoping", yapper: "One click disconnects everyone" },
  { typical: "No record of who ever opened it", yapper: "Full collaborator list, tracked" },
];

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Hero parallax: the document mockup drifts up a touch slower than the page over the first
  // ~640px of scroll (the hero region, since the hero sits at the top). Tracks window scroll rather
  // than a target ref, so it needs no layout measurement — SSR/jsdom safe. Pure transform-only
  // enhancement (the doc is fully visible without JS); flattened under reduced-motion.
  const { scrollY } = useScroll();
  const docY = useTransform(scrollY, [0, 640], [0, reduceMotion ? 0 : -72]);
  const docRotate = useTransform(scrollY, [0, 640], [0, reduceMotion ? 0 : -1.5]);

  // Entry-surface redirect (spec 10 / ADR-0001, ADR-002): logged-in visitors are bounced to
  // /dashboard client-side (the session cookie lives on the api origin, invisible to web-origin
  // middleware). Approach A2: while the session is pending we render a neutral loader instead of
  // the marketing page, so a returning logged-in visitor never sees the marketing page flash
  // before the redirect. The marketing page renders only once the session resolves logged-out.
  const { data: session, isPending } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!isPending && session) router.replace("/dashboard");
  }, [isPending, session, router]);

  // Scroll-reveal, SSR/no-JS safe: content is visible by default; JS adds the hidden+transition
  // classes to opted-in elements ([data-reveal] blocks, [data-card] staggered items) only when
  // motion is allowed, then removes them as each scrolls into view.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const reveal = (cls: string, sel: string, stagger = 0) => {
      const els = Array.from(root.querySelectorAll<HTMLElement>(sel));
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.classList.add("lp-in");
            io.unobserve(e.target);
          }
        },
        { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
      );
      els.forEach((el, i) => {
        el.classList.add(cls);
        if (stagger) el.style.transitionDelay = `${(i % 6) * stagger}s`;
        io.observe(el);
      });
      return io;
    };

    const a = reveal("lp-reveal", "[data-reveal]");
    const b = reveal("lp-card-reveal", "[data-card]", 0.07);
    return () => {
      a.disconnect();
      b.disconnect();
    };
  }, []);

  // Session still resolving: neutral loader, no marketing page (A2). SSR renders this too, so the
  // first paint is the loader for everyone until the client learns whether to redirect.
  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading…
      </main>
    );
  }
  // Resolved logged-in: render nothing while the redirect effect above navigates to /dashboard.
  if (session) return null;

  return (
    <div ref={rootRef} className="lp-root bg-ink font-sans text-fg m-0 p-0">
      {/* ── NAV ── */}
      <nav className="fixed inset-x-0 top-0 z-[100] flex h-[62px] items-center justify-between border-b border-[oklch(1_0_0_/_0.07)] bg-[oklch(0.17_0.015_275_/_0.72)] px-[clamp(20px,5vw,60px)] backdrop-blur-[20px] backdrop-saturate-150">
        <div className="flex items-center gap-[9px]">
          <LogoMark size={30} radius={8} />
          <span className="font-display text-[20px] font-bold tracking-[-0.4px]">Yapper</span>
        </div>
        <div className="flex items-center gap-[clamp(16px,3vw,30px)]">
          <a
            href="#features"
            className="hidden text-[14px] font-medium text-[oklch(0.68_0.01_275)] no-underline transition-colors hover:text-fg sm:inline"
          >
            Features
          </a>
          <a
            href="#why"
            className="hidden text-[14px] font-medium text-[oklch(0.68_0.01_275)] no-underline transition-colors hover:text-fg sm:inline"
          >
            Why Yapper
          </a>
          <button
            type="button"
            onClick={() => signInWith("google")}
            className="cursor-pointer rounded-[9px] bg-fg px-[16px] py-[8px] text-[13px] font-semibold tracking-[-0.2px] text-ink transition-all duration-[160ms] hover:-translate-y-[1px] hover:opacity-90"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative flex min-h-screen items-center overflow-hidden bg-ink px-[clamp(20px,5vw,64px)] pt-[clamp(104px,15vh,156px)] pb-[90px]">
        <div className="lp-aurora lp-hero-glow pointer-events-none absolute inset-0" />
        <div className="lp-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_80%_70%_at_50%_35%,black,transparent)]" />
        <div className="relative z-[1] mx-auto grid w-full max-w-[1200px] items-center gap-[clamp(40px,6vw,72px)] lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left: headline */}
          <div className="max-w-[600px]">
            <div className="mb-[26px] inline-flex animate-[hero-rise_0.6s_cubic-bezier(0.16,1,0.3,1)_both] items-center gap-[9px] rounded-full border border-iris/25 bg-iris/[0.07] py-[6px] pr-[15px] pl-[10px] motion-reduce:animate-none">
              <span className="relative h-[9px] w-[9px] shrink-0">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-agreen motion-reduce:animate-none" />
                <span className="absolute inset-[1.5px] rounded-full bg-agreen" />
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[oklch(0.86_0.05_282)]">
                Real-time collaboration
              </span>
            </div>

            <h1 className="mb-[24px] font-display text-[clamp(40px,5.6vw,72px)] font-extrabold leading-[1.02] tracking-[-2px] [text-wrap:balance]">
              <span className="block animate-[hero-rise_0.7s_cubic-bezier(0.16,1,0.3,1)_0.06s_both] motion-reduce:animate-none">
                Notes that know
              </span>
              <span className="block animate-[hero-rise_0.7s_cubic-bezier(0.16,1,0.3,1)_0.16s_both] text-iris motion-reduce:animate-none">
                who&apos;s in the room.
              </span>
            </h1>

            <p className="mb-[38px] max-w-[456px] animate-[hero-rise_0.7s_cubic-bezier(0.16,1,0.3,1)_0.26s_both] text-[clamp(16px,1.7vw,19px)] leading-[1.65] text-[oklch(0.72_0.01_275)] [text-wrap:pretty] motion-reduce:animate-none">
              Multiplayer rich-text editing with live cursors and real identities. See exactly
              who&apos;s reading, who&apos;s typing — and pull the note private in one click.
            </p>

            <div className="flex animate-[hero-rise_0.7s_cubic-bezier(0.16,1,0.3,1)_0.36s_both] flex-wrap gap-[12px] motion-reduce:animate-none">
              <button type="button" onClick={() => signInWith("google")} className={HERO_GOOGLE}>
                <GoogleIcon /> Continue with Google
              </button>
              <button type="button" onClick={() => signInWith("github")} className={HERO_GITHUB}>
                <GitHubIcon /> Continue with GitHub
              </button>
            </div>
            <p className="mt-[18px] animate-[hero-rise_0.7s_cubic-bezier(0.16,1,0.3,1)_0.44s_both] text-[13px] text-[oklch(0.6_0.01_275)] motion-reduce:animate-none">
              Free to start · Every note is private until you share it
            </p>
          </div>

          {/* Right: animated document mockup (parallax) */}
          <motion.div
            style={{ y: docY, rotate: docRotate }}
            className="animate-[hero-rise_0.85s_cubic-bezier(0.16,1,0.3,1)_0.2s_both] justify-self-center motion-reduce:animate-none lg:justify-self-end"
          >
            <div className="relative w-[min(480px,92vw)] animate-float motion-reduce:animate-none">
              <div className="lp-doc-glow pointer-events-none absolute inset-[-30px] rounded-[48px]" />
              <div
                className={`relative overflow-hidden rounded-[16px] border border-[oklch(1_0_0_/_0.1)] bg-panel ${PANEL_DARK}`}
              >
                {/* title bar */}
                <div className="flex h-[44px] items-center border-b border-[oklch(1_0_0_/_0.06)] bg-panel-2 px-[16px]">
                  <div className="flex flex-none gap-[7px]">
                    <Dot color="#ff5f57" />
                    <Dot color="#febc2e" />
                    <Dot color="#28c840" />
                  </div>
                  <div className="flex-1 text-center text-[12px] font-medium text-[oklch(0.55_0.01_275)]">
                    Q3 Launch Notes
                  </div>
                  <div className="flex items-center">
                    <Avatar letter="J" bg="#4ea8ff" border="oklch(0.25 0.02 275)" />
                    <Avatar letter="M" bg="#ff7b4e" border="oklch(0.25 0.02 275)" />
                    <Avatar
                      letter="A"
                      bg="#22d3a5"
                      color="oklch(0.17 0.015 275)"
                      border="oklch(0.25 0.02 275)"
                    />
                  </div>
                </div>
                {/* toolbar */}
                <div className="flex h-[36px] items-center gap-px border-b border-[oklch(1_0_0_/_0.04)] bg-panel px-[14px]">
                  <span className="px-[7px] py-[3px] text-[12px] font-bold text-[oklch(0.5_0.01_275)]">
                    B
                  </span>
                  <span className="px-[7px] py-[3px] text-[12px] italic text-[oklch(0.5_0.01_275)]">
                    I
                  </span>
                  <span className="px-[7px] py-[3px] text-[12px] text-[oklch(0.5_0.01_275)] underline">
                    U
                  </span>
                  <div className="mx-[6px] h-[14px] w-px bg-[oklch(1_0_0_/_0.07)]" />
                  <span className="px-[6px] py-[3px] text-[11px] font-bold text-[oklch(0.5_0.01_275)]">
                    H1
                  </span>
                  <span className="px-[6px] py-[3px] text-[11px] font-bold text-[oklch(0.5_0.01_275)]">
                    H2
                  </span>
                  <div className="mx-[6px] h-[14px] w-px bg-[oklch(1_0_0_/_0.07)]" />
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                    <path
                      d="M1 1h12M1 5h9M1 9h10"
                      stroke="oklch(0.5 0.01 275)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                {/* body */}
                <div className="overflow-visible px-[22px] pt-[20px] pb-[24px]">
                  <div className="mb-[14px] font-display text-[18px] font-bold tracking-[-0.4px]">
                    Q3 Launch Notes
                  </div>
                  <div className="mb-[8px] text-[10px] font-bold uppercase tracking-[0.1em] text-[oklch(0.5_0.02_282)]">
                    Priorities
                  </div>
                  <div className="mb-[3px] overflow-visible whitespace-nowrap text-[13px] leading-[1.75] text-[oklch(0.74_0.01_275)]">
                    → Ship onboarding by <strong className="font-semibold text-fg">July 15</strong>
                    <Cursor
                      name="Jess"
                      color="#4ea8ff"
                      anim="cursor-jess 8s ease-in-out infinite"
                      blink="caret-blink 1.1s step-end infinite"
                    />
                  </div>
                  <div className="mb-[3px] overflow-visible text-[13px] leading-[1.75] text-[oklch(0.74_0.01_275)]">
                    → Hit{" "}
                    <span className="rounded-[2px] bg-[#ff7b4e28] py-px text-fg">10k signups</span>
                    <Cursor
                      name="Mira"
                      color="#ff7b4e"
                      anim="cursor-mira 7.5s ease-in-out 0.7s infinite"
                      blink="caret-blink 1.4s step-end 0.3s infinite"
                    />{" "}
                    before end of Q3
                  </div>
                  <div className="mb-[14px] text-[13px] leading-[1.75] text-[oklch(0.74_0.01_275)]">
                    → Finalize API rate limit handling
                  </div>
                  <div className="mb-[8px] text-[10px] font-bold uppercase tracking-[0.1em] text-[oklch(0.5_0.02_282)]">
                    Blockers
                  </div>
                  <div className="overflow-visible text-[13px] leading-[1.75] text-[oklch(0.74_0.01_275)]">
                    Rate limits becoming a problem at scale
                    <Cursor
                      name="Alex"
                      color="#22d3a5"
                      textColor="oklch(0.17 0.015 275)"
                      anim="cursor-alex 9s ease-in-out 0.4s infinite"
                      blink="caret-blink 0.9s step-end 0.6s infinite"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── STATEMENT BAND ── */}
      <section className="relative overflow-hidden border-y border-[oklch(1_0_0_/_0.06)] bg-panel px-[clamp(20px,5vw,64px)] py-[clamp(64px,9vw,104px)]">
        <div
          data-reveal=""
          className="mx-auto max-w-[900px] text-center font-display text-[clamp(26px,3.6vw,46px)] font-semibold leading-[1.12] tracking-[-1.2px] [text-wrap:balance]"
        >
          Most tools trust the link. <span className="text-iris">Yapper trusts the person</span> —
          every cursor is a real, logged-in identity you can see and revoke.
        </div>
      </section>

      {/* ── FEATURES (asymmetric editorial grid, not identical cards) ── */}
      <section
        id="features"
        className="bg-paper px-[clamp(20px,5vw,64px)] py-[clamp(80px,11vw,120px)]"
      >
        <div className="mx-auto grid max-w-[1200px] gap-[clamp(40px,6vw,72px)] lg:grid-cols-[0.82fr_1.18fr]">
          {/* Left: sticky heading block */}
          <div data-reveal="" className="lg:sticky lg:top-[104px] lg:self-start">
            <h2 className="font-display text-[clamp(30px,3.6vw,48px)] font-extrabold leading-[1.04] tracking-[-1.4px] text-ink-fg [text-wrap:balance]">
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p className="mt-[18px] max-w-[380px] text-[17px] leading-[1.6] text-subtle [text-wrap:pretty]">
              Built for people who move fast but still need to know who&apos;s in the room and who
              can touch what. No feature bloat — just the collaboration primitives, done right.
            </p>
            <a
              href="#why"
              className="group mt-[26px] inline-flex items-center gap-[8px] text-[15px] font-semibold text-brand no-underline transition-colors hover:text-ink-fg"
            >
              See what makes it different
              <svg
                width="16"
                height="12"
                viewBox="0 0 16 12"
                fill="none"
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-[3px]"
              >
                <path
                  d="M2 6h11M9 2l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>

          {/* Right: two flagship tiles + a divided list of the rest */}
          <div className="grid gap-[16px]">
            <div className="grid gap-[16px] sm:grid-cols-2">
              {features
                .filter((f) => f.wide)
                .map((f) => (
                  <div
                    key={f.title}
                    data-card=""
                    className={`group rounded-[18px] border border-line bg-surface p-[28px] transition-[transform,border-color,box-shadow] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[4px] hover:border-brand/35 ${CARD_REST} ${CARD_HOVER}`}
                  >
                    <div className="mb-[18px] flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-brand/[0.1] text-brand transition-all duration-200 group-hover:scale-105 group-hover:bg-brand group-hover:text-white group-hover:shadow-[0_8px_20px_oklch(0.47_0.15_275_/_0.35)]">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        {f.icon}
                      </svg>
                    </div>
                    <div className="mb-[8px] font-display text-[19px] font-bold tracking-[-0.3px] text-ink-fg">
                      {f.title}
                    </div>
                    <p className="text-[14px] leading-[1.6] text-subtle">{f.body}</p>
                  </div>
                ))}
            </div>

            <div
              className={`overflow-hidden rounded-[18px] border border-line bg-surface ${CARD_REST}`}
            >
              {features
                .filter((f) => !f.wide)
                .map((f) => (
                  <div
                    key={f.title}
                    data-card=""
                    className="group flex items-start gap-[16px] border-b border-line px-[26px] py-[21px] transition-colors last:border-b-0 hover:bg-iris-soft/70"
                  >
                    <div className="mt-[1px] flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-brand/[0.1] text-brand transition-all duration-200 group-hover:bg-brand group-hover:text-white">
                      <svg
                        width="19"
                        height="19"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        {f.icon}
                      </svg>
                    </div>
                    <div>
                      <div className="mb-[3px] text-[15px] font-bold tracking-[-0.2px] text-ink-fg">
                        {f.title}
                      </div>
                      <p className="text-[14px] leading-[1.55] text-subtle">{f.body}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRESENCE SPOTLIGHT ── */}
      <section className="relative overflow-hidden bg-ink px-[clamp(20px,5vw,64px)] py-[clamp(80px,11vw,120px)]">
        <div className="lp-presence-glow pointer-events-none absolute inset-0" />
        <div className="relative z-[1] mx-auto grid max-w-[1200px] items-center gap-[clamp(40px,6vw,80px)] lg:grid-cols-2">
          <div data-reveal="" className="max-w-[480px]">
            <h2 className="mb-[18px] font-display text-[clamp(28px,3.4vw,44px)] font-extrabold leading-[1.06] tracking-[-1.4px] [text-wrap:balance]">
              See every cursor.
              <br />
              Know every edit.
            </h2>
            <p className="mb-[28px] text-[16px] leading-[1.7] text-[oklch(0.72_0.01_275)] [text-wrap:pretty]">
              Every collaborator&apos;s cursor and text selection appears live — color-coded with
              their real name. No anonymous ghosts. No guessing. You always know who&apos;s touching
              what.
            </p>
            <div className="flex flex-col gap-[13px]">
              {[
                "Editors see each other's cursors move in real time",
                "Selected text shows up highlighted in the selector's color",
                "View-only people appear as presence too — you know they're reading",
              ].map((line) => (
                <div key={line} className={CHECK_ROW}>
                  <CheckBullet bg="#4ea8ff" />
                  <span className={BULLET_TEXT}>{line}</span>
                </div>
              ))}
            </div>
          </div>
          <div data-reveal="" className="justify-self-center lg:justify-self-end">
            <div
              className={`w-[min(500px,92vw)] overflow-hidden rounded-[18px] border border-[oklch(1_0_0_/_0.08)] bg-panel ${PANEL_DARK}`}
            >
              <div className="flex items-center justify-between border-b border-[oklch(1_0_0_/_0.06)] bg-panel-2 px-[18px] py-[14px]">
                <div>
                  <div className="font-display text-[14px] font-bold tracking-[-0.3px]">
                    Product Roadmap
                  </div>
                  <div className="mt-[2px] flex items-center gap-[5px] text-[11px] text-[oklch(0.55_0.01_275)]">
                    <span className="inline-block h-[6px] w-[6px] rounded-full bg-agreen" />3 people
                    editing now
                  </div>
                </div>
                <div className="flex items-center gap-[8px]">
                  <Avatar letter="S" bg="#ff7b4e" border="oklch(0.25 0.02 275)" size={28} />
                  <Avatar
                    letter="K"
                    bg="oklch(0.62 0.15 278)"
                    border="oklch(0.25 0.02 275)"
                    size={28}
                  />
                  <Avatar
                    letter="D"
                    bg="#22d3a5"
                    color="oklch(0.17 0.015 275)"
                    border="oklch(0.25 0.02 275)"
                    size={28}
                  />
                </div>
              </div>
              <div className="border-b border-[oklch(1_0_0_/_0.05)] px-[18px] py-[14px]">
                <div className="mb-[10px] text-[10px] font-bold uppercase tracking-[0.09em] text-[oklch(0.5_0.02_282)]">
                  Active now
                </div>
                <div className="flex flex-col gap-[8px]">
                  <ActiveRow
                    letter="S"
                    bg="#ff7b4e"
                    name="Sam Rodriguez"
                    meta="sam@acme.io · editing"
                    dot="#ff7b4e"
                  />
                  <ActiveRow
                    letter="K"
                    bg="oklch(0.62 0.15 278)"
                    name="Kira Patel"
                    meta="kira@acme.io · editing"
                    dot="oklch(0.62 0.15 278)"
                  />
                  <ActiveRow
                    letter="D"
                    bg="#22d3a5"
                    color="oklch(0.17 0.015 275)"
                    name="Dev Okoro"
                    meta="dev@acme.io · viewing"
                    dot="#22d3a5"
                    dotFaded
                  />
                </div>
              </div>
              <div className="px-[18px] pt-[14px] pb-[18px]">
                <div className="mb-[4px] text-[12px] leading-[1.7] text-[oklch(0.74_0.01_275)]">
                  Q2 takeaways:{" "}
                  <span className="rounded-[2px] bg-[#ff7b4e28] py-px text-fg">
                    mobile onboarding
                  </span>
                  <Cursor
                    name="Sam"
                    color="#ff7b4e"
                    small
                    blink="caret-blink 1.3s step-end infinite"
                  />{" "}
                  needs a rethink.
                </div>
                <div className="text-[12px] leading-[1.7] text-[oklch(0.74_0.01_275)]">
                  Auth conversion down 18%
                  <Cursor
                    name="Kira"
                    color="oklch(0.62 0.15 278)"
                    small
                    blink="caret-blink 1s step-end 0.5s infinite"
                  />{" "}
                  — fix before Q3.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARISON (unified split, not twin cards) ── */}
      <section id="why" className="bg-paper px-[clamp(20px,5vw,64px)] py-[clamp(80px,11vw,120px)]">
        <div className="mx-auto max-w-[960px]">
          <div data-reveal="" className="mx-auto mb-[52px] max-w-[600px] text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,44px)] font-extrabold leading-[1.06] tracking-[-1.4px] text-ink-fg [text-wrap:balance]">
              Collab without the guesswork.
            </h2>
            <p className="mt-[14px] text-[17px] leading-[1.6] text-subtle">
              Most tools trust the link. Yapper trusts the person.
            </p>
          </div>
          <div
            data-reveal=""
            className={`overflow-hidden rounded-[20px] border border-line bg-surface ${CARD_REST}`}
          >
            {/* header row */}
            <div className="grid grid-cols-[1fr_1fr] border-b border-line">
              <div className="flex items-center gap-[10px] px-[clamp(18px,3vw,30px)] py-[20px]">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-[oklch(0.95_0.004_275)] text-[oklch(0.55_0.01_275)]">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M5 8l2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="font-display text-[14px] font-bold tracking-[-0.2px] text-subtle sm:text-[15px]">
                  Typical collab tools
                </span>
              </div>
              <div className="flex items-center gap-[10px] border-l border-line bg-iris-soft/50 px-[clamp(18px,3vw,30px)] py-[20px]">
                <LogoMark size={30} radius={8} />
                <span className="font-display text-[14px] font-bold tracking-[-0.2px] text-ink-fg sm:text-[15px]">
                  Yapper
                </span>
              </div>
            </div>
            {/* rows */}
            {comparisonRows.map((row, i) => (
              <div
                key={row.yapper}
                className={`grid grid-cols-[1fr_1fr] ${i < comparisonRows.length - 1 ? "border-b border-line" : ""}`}
              >
                <div className="flex items-start gap-[11px] px-[clamp(18px,3vw,30px)] py-[18px]">
                  <span className="mt-[1px] shrink-0 text-[15px] font-bold leading-[1.4] text-[oklch(0.72_0.01_275)]">
                    ✗
                  </span>
                  <span className="text-[14px] leading-[1.5] text-subtle">{row.typical}</span>
                </div>
                <div className="flex items-start gap-[11px] border-l border-line bg-iris-soft/50 px-[clamp(18px,3vw,30px)] py-[18px]">
                  <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand text-white">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                      <path
                        d="M1 4l2.5 2.5L9 1"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-[14px] font-medium leading-[1.5] text-ink-fg">
                    {row.yapper}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MAKE PRIVATE ── */}
      <section className="relative overflow-hidden bg-ink px-[clamp(20px,5vw,64px)] py-[clamp(80px,11vw,120px)]">
        <div className="lp-private-glow pointer-events-none absolute inset-0" />
        <div className="lp-grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_30%_50%,black,transparent)]" />
        <div className="relative z-[1] mx-auto grid max-w-[1200px] items-center gap-[clamp(40px,6vw,80px)] lg:grid-cols-2">
          <div data-reveal="" className="max-w-[480px]">
            <h2 className="mb-[18px] font-display text-[clamp(28px,3.4vw,44px)] font-extrabold leading-[1.06] tracking-[-1.4px] [text-wrap:balance]">
              Privacy isn&apos;t a setting.
              <br />
              It&apos;s a switch.
            </h2>
            <p className="mb-[28px] text-[16px] leading-[1.7] text-[oklch(0.72_0.01_275)] [text-wrap:pretty]">
              One click. Instant disconnect. The share link rotates, every collaborator is marked
              revoked, and the note is yours alone — while you stay connected the whole time.
            </p>
            <div className="flex flex-col gap-[13px]">
              {[
                "One access level per note: private, view-only, or edit",
                "Collaborators disconnected in real time — they see the reason",
                "The share link rotates — the old one never works again",
              ].map((line) => (
                <div key={line} className={CHECK_ROW}>
                  <CheckBullet bg="oklch(0.7 0.13 280)" />
                  <span className={BULLET_TEXT}>{line}</span>
                </div>
              ))}
            </div>
          </div>
          <div data-reveal="" className="justify-self-center lg:justify-self-end">
            <div className="flex w-[min(440px,92vw)] flex-col gap-[14px]">
              <div
                className={`overflow-hidden rounded-[16px] border border-[oklch(1_0_0_/_0.09)] bg-panel ${PANEL_DARK}`}
              >
                <div className="border-b border-[oklch(1_0_0_/_0.06)] px-[20px] py-[18px]">
                  <div className="mb-[3px] flex items-center justify-between">
                    <div className="font-display text-[15px] font-bold tracking-[-0.3px]">
                      Project Brief
                    </div>
                    <div className="flex items-center">
                      <Avatar letter="J" bg="#ff7b4e" border="oklch(0.21 0.018 275)" size={22} />
                      <Avatar letter="M" bg="#4ea8ff" border="oklch(0.21 0.018 275)" size={22} />
                      <Avatar
                        letter="A"
                        bg="#22d3a5"
                        color="oklch(0.17 0.015 275)"
                        border="oklch(0.21 0.018 275)"
                        size={22}
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-[oklch(0.55_0.01_275)]">
                    Shared with 3 collaborators · Edit access
                  </div>
                </div>
                <div className="px-[20px] py-[16px]">
                  <div className="mb-[10px] text-[11px] font-bold uppercase tracking-[0.08em] text-[oklch(0.5_0.02_282)]">
                    Access level
                  </div>
                  <div className="mb-[14px] flex gap-[8px]">
                    <div className="flex-1 rounded-[8px] border border-[oklch(1_0_0_/_0.07)] p-[8px] text-center text-[12px] font-medium text-[oklch(0.55_0.01_275)]">
                      Private
                    </div>
                    <div className="flex-1 rounded-[8px] border border-[oklch(1_0_0_/_0.07)] p-[8px] text-center text-[12px] font-medium text-[oklch(0.55_0.01_275)]">
                      View only
                    </div>
                    <div className="flex-1 rounded-[8px] border-[1.5px] border-iris/50 bg-iris/[0.1] p-[8px] text-center text-[12px] font-semibold text-iris">
                      Edit
                    </div>
                  </div>
                  <div className="group flex cursor-pointer items-center justify-between rounded-[9px] border border-[oklch(0.63_0.2_20_/_0.24)] bg-[oklch(0.63_0.2_20_/_0.1)] px-[14px] py-[11px] transition-colors hover:bg-[oklch(0.63_0.2_20_/_0.18)]">
                    <div className="flex items-center gap-[8px]">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        aria-hidden="true"
                      >
                        <rect
                          x="2.5"
                          y="6.5"
                          width="9"
                          height="6"
                          rx="1"
                          stroke="#f87070"
                          strokeWidth="1.4"
                        />
                        <path
                          d="M4.5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"
                          stroke="#f87070"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-[13px] font-semibold text-danger">
                        Make private now
                      </span>
                    </div>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                      className="transition-transform duration-200 group-hover:translate-x-[3px]"
                    >
                      <path
                        d="M2 6h8M6 3l3 3-3 3"
                        stroke="#f87070"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-[12px] rounded-[12px] border border-[oklch(0.63_0.2_20_/_0.22)] bg-[oklch(0.2_0.03_20)] px-[18px] py-[16px]">
                <div className="mt-px flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border border-[oklch(0.63_0.2_20_/_0.3)] bg-[oklch(0.63_0.2_20_/_0.15)]">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <rect
                      x="2"
                      y="6"
                      width="9"
                      height="5.5"
                      rx="1"
                      stroke="#f87070"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M4 6V4a2.5 2.5 0 0 1 5 0v2"
                      stroke="#f87070"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div>
                  <div className="mb-[3px] text-[13px] font-semibold text-danger">
                    Note made private by owner.
                  </div>
                  <div className="text-[12px] leading-[1.5] text-[oklch(0.68_0.06_20)]">
                    You&apos;ve been disconnected. The owner has made this note private.
                  </div>
                </div>
              </div>
              <p className="text-center text-[11px] tracking-[0.02em] text-[oklch(0.5_0.01_275)]">
                ↑ What every other collaborator sees, instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden bg-paper px-[clamp(20px,5vw,64px)] py-[clamp(88px,13vw,128px)]">
        <div className="mx-auto max-w-[680px] text-center">
          <div
            data-reveal=""
            className="rounded-[24px] border border-line bg-surface px-[clamp(28px,5vw,56px)] py-[clamp(40px,6vw,64px)] shadow-[0_2px_8px_oklch(0.2_0.02_275_/_0.05),0_30px_70px_oklch(0.47_0.15_275_/_0.1)]"
          >
            <h2 className="mb-[18px] font-display text-[clamp(32px,4.2vw,54px)] font-extrabold leading-[1.02] tracking-[-1.8px] text-ink-fg [text-wrap:balance]">
              Start writing. Together.
            </h2>
            <p className="mx-auto mb-[36px] max-w-[440px] text-[17px] leading-[1.6] text-subtle [text-wrap:pretty]">
              Sign in with Google or GitHub. Every note starts private — share when you&apos;re
              ready, pull it back whenever you want.
            </p>
            <div className="flex flex-wrap justify-center gap-[14px]">
              <button type="button" onClick={() => signInWith("google")} className={CTA_GOOGLE}>
                <GoogleIcon size={20} /> Continue with Google
              </button>
              <button type="button" onClick={() => signInWith("github")} className={CTA_GITHUB}>
                <GitHubIcon size={20} /> Continue with GitHub
              </button>
            </div>
            <p className="mt-[22px] text-[13px] text-subtle">
              No anonymous access. Every collaborator is a real, tracked identity.
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[oklch(1_0_0_/_0.06)] bg-ink px-[clamp(20px,5vw,64px)] py-[38px]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-[16px]">
          <div className="flex items-center gap-[9px]">
            <LogoMark size={26} radius={7} />
            <span className="font-display text-[16px] font-bold tracking-[-0.4px]">Yapper</span>
          </div>
          <p className="text-[13px] text-[oklch(0.5_0.01_275)]">
            © 2025 Yapper. Real notes. Real identities. Real control.
          </p>
          {/* Routes don't exist yet — they're the intended destinations (see implementation.md TODO). */}
          <div className="flex gap-[20px]">
            <a
              href="/privacy"
              className="text-[13px] text-[oklch(0.5_0.01_275)] no-underline transition-colors hover:text-[oklch(0.75_0.01_275)]"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="text-[13px] text-[oklch(0.5_0.01_275)] no-underline transition-colors hover:text-[oklch(0.75_0.01_275)]"
            >
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── small presentational helpers (runtime-dynamic colors/sizes stay inline) ── */

function Dot({ color }: { color: string }) {
  return <div className="h-[11px] w-[11px] rounded-full" style={{ background: color }} />;
}

function Avatar({
  letter,
  bg,
  color = "#fff",
  border,
  size = 23,
}: {
  letter: string;
  bg: string;
  color?: string;
  border?: string;
  size?: number;
}) {
  return (
    <div
      className="-ml-[6px] flex shrink-0 items-center justify-center rounded-full font-sans font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size <= 22 ? 9 : size >= 28 ? 11 : 10,
        background: bg,
        color,
        border: border ? `2px solid ${border}` : undefined,
      }}
    >
      {letter}
    </div>
  );
}

function ActiveRow({
  letter,
  bg,
  color = "#fff",
  name,
  meta,
  dot,
  dotFaded,
}: {
  letter: string;
  bg: string;
  color?: string;
  name: string;
  meta: string;
  dot: string;
  dotFaded?: boolean;
}) {
  return (
    <div className="flex items-center gap-[10px]">
      <div
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full font-sans text-[11px] font-bold"
        style={{ background: bg, color }}
      >
        {letter}
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-fg">{name}</div>
        <div className="text-[11px] text-[oklch(0.55_0.01_275)]">{meta}</div>
      </div>
      <div
        className="h-2 w-2 rounded-full"
        style={{ background: dot, opacity: dotFaded ? 0.5 : 1 }}
      />
    </div>
  );
}

/** An inline live-cursor caret + name label, as seen in the document mockups. */
function Cursor({
  name,
  color,
  textColor = "#fff",
  anim,
  blink,
  small,
}: {
  name: string;
  color: string;
  textColor?: string;
  anim?: string;
  blink: string;
  small?: boolean;
}) {
  return (
    <span className="relative z-10 inline-block w-0 overflow-visible align-text-bottom">
      <span
        className="pointer-events-none absolute bottom-0 left-px flex flex-col-reverse items-start gap-[2px]"
        style={{ animation: anim }}
      >
        <span
          className="block w-[2px] rounded-[1px]"
          style={{ height: small ? 14 : 16, background: color, animation: blink }}
        />
        <span
          className="whitespace-nowrap rounded-[3px_3px_3px_0] font-sans font-bold leading-[1.6]"
          style={{
            background: color,
            color: textColor,
            fontSize: small ? 8.5 : 9,
            padding: small ? "1px 5px" : "1.5px 5px",
          }}
        >
          {name}
        </span>
      </span>
    </span>
  );
}
