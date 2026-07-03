"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { signIn, useSession } from "../../lib/auth-client";

/**
 * Slice 08 — the logged-out marketing landing page at `/`.
 * Translated from the imported Claude Design file `Yapper Landing Page.dc.html`.
 * Styled with Tailwind v4 (theme tokens + keyframes live in `app/globals.css`). A handful of
 * decorative gradient overlays and the scroll-reveal classes are plain CSS in globals.css;
 * runtime-dynamic colors/sizes on the small mockup helpers stay as inline styles.
 * OAuth CTAs reuse the slice-02 Better Auth `signIn.social` flow.
 */

type Provider = "google" | "github";

function signInWith(provider: Provider) {
  void signIn.social({
    provider,
    callbackURL: `${window.location.origin}/dashboard`,
  });
}

/* Shared class fragments to cut repetition. */
const EYEBROW = "text-[12px] font-bold uppercase tracking-[0.1em]";
const CHECK_ROW = "flex items-start gap-3";
const BULLET_TEXT = "text-[15px] leading-[1.5] text-[oklch(0.82_0_0)]";
const BTN =
  "inline-flex cursor-pointer items-center gap-[10px] font-semibold transition-all duration-[180ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97]";
const HERO_GOOGLE = `${BTN} rounded-[10px] border-none bg-surface px-[22px] py-[13px] text-[15px] tracking-[-0.2px] text-ink-fg shadow-[0_2px_8px_oklch(0_0_0_/_0.28)] hover:-translate-y-[2px] hover:shadow-[0_8px_24px_oklch(0_0_0_/_0.3)]`;
const HERO_GITHUB = `${BTN} rounded-[10px] border-[1.5px] border-[oklch(1_0_0_/_0.14)] bg-transparent px-[22px] py-[13px] text-[15px] tracking-[-0.2px] text-fg hover:-translate-y-[2px] hover:border-[oklch(1_0_0_/_0.28)] hover:bg-[oklch(1_0_0_/_0.05)]`;
const CTA_GOOGLE = `${BTN} rounded-[12px] border-none bg-ink-fg px-[26px] py-[14px] text-[16px] tracking-[-0.3px] text-paper shadow-[0_2px_8px_oklch(0_0_0_/_0.15)] hover:-translate-y-[2px] hover:shadow-[0_8px_24px_oklch(0_0_0_/_0.18)]`;
const CTA_GITHUB = `${BTN} rounded-[12px] border-none bg-panel-2 px-[26px] py-[14px] text-[16px] tracking-[-0.3px] text-fg shadow-[0_2px_8px_oklch(0_0_0_/_0.12)] hover:-translate-y-[2px] hover:bg-[oklch(0.32_0_0)] hover:shadow-[0_8px_24px_oklch(0_0_0_/_0.18)]`;

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
      className="flex shrink-0 items-center justify-center bg-brand"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden="true">
        <path d="M1 1.5h15M1 6h11M1 10.5h13" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** A small check in a colored circle, used by the bulleted feature lists. */
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

const features = [
  {
    iconBg: "rgba(78,168,255,0.1)",
    title: "Conflict-free editing",
    body: "Multiple people edit the same note simultaneously — powered by CRDTs, so no one overwrites anyone.",
    icon: (
      <path
        d="M4 3v5.5L10 14v3M16 3v5.5L10 14"
        stroke="#4ea8ff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    iconBg: "oklch(0.4341 0.0392 41.9938 / 0.1)",
    title: "Live presence",
    body: "Every collaborator's cursor and text selection appears in real time — labeled with their name, color-coded.",
    icon: (
      <path
        d="M4 2.5l3.5 14 2.8-4.5H15L4 2.5Z"
        stroke="oklch(0.4341 0.0392 41.9938)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    iconBg: "rgba(34,211,165,0.1)",
    title: "Rich text formatting",
    body: "Bold, italic, headings, bullets — real formatting. Your notes look like notes, not a wall of plain text.",
    icon: (
      <>
        <path
          d="M5 4h5.5a2.5 2.5 0 0 1 0 5H5V4Z"
          stroke="#22d3a5"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 9h6a2.5 2.5 0 0 1 0 5H5V9Z"
          stroke="#22d3a5"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    iconBg: "rgba(255,123,78,0.1)",
    title: "Real identities only",
    body: "Google or GitHub login, every time. No anonymous access — every cursor is a real, tracked person.",
    icon: (
      <>
        <circle cx="10" cy="7.5" r="3.5" stroke="#ff7b4e" strokeWidth="1.8" />
        <path
          d="M3 18c0-3.866 3.134-7 7-7s7 3.134 7 7"
          stroke="#ff7b4e"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="15" cy="5" r="2.5" fill="#ff7b4e" />
        <path
          d="M14 5l.8.8 1.4-1.4"
          stroke="#fff"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    iconBg: "rgba(78,168,255,0.1)",
    title: "Capability-link sharing",
    body: "Share via an unguessable link. Opening it requires login — and adds them to your tracked collaborator list.",
    icon: (
      <>
        <path
          d="M8.5 11.5a4.243 4.243 0 0 0 6 0l2-2a4.243 4.243 0 0 0-6-6l-1 1"
          stroke="#4ea8ff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M11.5 8.5a4.243 4.243 0 0 0-6 0l-2 2a4.243 4.243 0 0 0 6 6l1-1"
          stroke="#4ea8ff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    iconBg: "oklch(0.4341 0.0392 41.9938 / 0.1)",
    title: "Instant revocation",
    body: "Owner sets one access level: private, view-only, or edit. Flip to private and everyone disconnects — immediately.",
    icon: (
      <>
        <rect
          x="4.5"
          y="9.5"
          width="11"
          height="8"
          rx="1.5"
          stroke="oklch(0.4341 0.0392 41.9938)"
          strokeWidth="1.8"
        />
        <path
          d="M7.5 9.5V7a2.5 2.5 0 0 1 5 0v2.5"
          stroke="oklch(0.4341 0.0392 41.9938)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="10" cy="13.5" r="1" fill="oklch(0.4341 0.0392 41.9938)" />
      </>
    ),
  },
];

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Scroll-reveal, mirroring the imported design's IntersectionObserver. Content is visible by
  // default (SSR/no-JS friendly); we only add the hidden+transition classes when motion is allowed.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const sectionIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("lp-in");
          sectionIo.unobserve(e.target);
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -32px 0px" },
    );
    for (const el of root.querySelectorAll<HTMLElement>(
      "section:not(:first-of-type) > div:last-child",
    )) {
      el.classList.add("lp-reveal");
      sectionIo.observe(el);
    }

    const cardIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("lp-in");
          cardIo.unobserve(e.target);
        }
      },
      { threshold: 0.04 },
    );
    root.querySelectorAll<HTMLElement>("[data-card]").forEach((el, i) => {
      el.classList.add("lp-card-reveal");
      el.style.transitionDelay = `${i * 0.07}s`;
      cardIo.observe(el);
    });

    return () => {
      sectionIo.disconnect();
      cardIo.disconnect();
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
      <nav className="fixed inset-x-0 top-0 z-[100] flex h-[62px] items-center justify-between border-b border-[oklch(1_0_0_/_0.07)] bg-[oklch(0.1776_0_0_/_0.9)] px-[clamp(20px,5vw,60px)] backdrop-blur-[18px] backdrop-saturate-150">
        <div className="flex items-center gap-[9px]">
          <LogoMark />
          <span className="font-display text-[20px] font-extrabold tracking-[-0.5px]">Yapper</span>
        </div>
        <div className="flex items-center gap-[28px]">
          <a
            href="#features"
            className="text-[14px] font-medium text-[oklch(0.6_0_0)] no-underline transition-colors hover:text-fg"
          >
            Features
          </a>
          <a
            href="#why"
            className="text-[14px] font-medium text-[oklch(0.6_0_0)] no-underline transition-colors hover:text-fg"
          >
            Why Yapper
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative flex min-h-screen items-center overflow-hidden bg-ink px-[clamp(20px,5vw,64px)] pt-[clamp(100px,14vh,148px)] pb-[90px]">
        <div className="lp-hero-glow pointer-events-none absolute inset-0" />
        <div className="lp-grid pointer-events-none absolute inset-0" />
        <div className="relative z-[1] mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-[clamp(40px,6vw,80px)]">
          {/* Left: headline */}
          <div className="max-w-[560px] flex-[1_1_320px]">
            <div className="mb-[28px] inline-flex animate-[fade-up_0.5s_ease_both] items-center gap-[7px] rounded-full border border-cream/30 bg-cream/10 py-[5px] pr-[14px] pl-[9px] motion-reduce:animate-none">
              <span className="relative h-2 w-2 shrink-0">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-agreen motion-reduce:animate-none" />
                <span className="absolute inset-[1.5px] rounded-full bg-agreen" />
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-cream/85">
                Real-time collaboration
              </span>
            </div>

            <h1 className="mb-[22px] animate-[fade-up_0.55s_ease_0.08s_both] font-display text-[clamp(38px,5.2vw,66px)] font-extrabold leading-[1.04] tracking-[-2.5px] [text-wrap:pretty] motion-reduce:animate-none">
              Notes that know
              <br />
              <span className="text-cream">who&apos;s in the room.</span>
            </h1>

            <p className="mb-[38px] max-w-[440px] animate-[fade-up_0.55s_ease_0.16s_both] text-[clamp(16px,1.7vw,18px)] leading-[1.7] text-[oklch(0.65_0_0)] [text-wrap:pretty] motion-reduce:animate-none">
              Multiplayer rich-text editing with live cursors and real identities. See exactly
              who&apos;s reading, who&apos;s typing — and pull the note private in one click.
            </p>

            <div className="flex animate-[fade-up_0.55s_ease_0.24s_both] flex-wrap gap-[12px] motion-reduce:animate-none">
              <button type="button" onClick={() => signInWith("google")} className={HERO_GOOGLE}>
                <GoogleIcon /> Continue with Google
              </button>
              <button type="button" onClick={() => signInWith("github")} className={HERO_GITHUB}>
                <GitHubIcon /> Continue with GitHub
              </button>
            </div>
          </div>

          {/* Right: animated document mockup */}
          <div className="max-w-[480px] flex-[1_1_340px] animate-[fade-up_0.65s_ease_0.2s_both] motion-reduce:animate-none">
            <div className="relative animate-float motion-reduce:animate-none">
              <div className="lp-doc-glow pointer-events-none absolute inset-[-28px] rounded-[48px]" />
              <div className="relative overflow-hidden rounded-[16px] border border-[oklch(1_0_0_/_0.09)] bg-panel shadow-[0_40px_100px_oklch(0_0_0_/_0.65)]">
                {/* title bar */}
                <div className="flex h-[44px] items-center border-b border-[oklch(1_0_0_/_0.06)] bg-panel-2 px-[16px]">
                  <div className="flex flex-none gap-[7px]">
                    <Dot color="#ff5f57" />
                    <Dot color="#febc2e" />
                    <Dot color="#28c840" />
                  </div>
                  <div className="flex-1 text-center text-[12px] font-medium text-[oklch(0.5_0_0)]">
                    Q3 Launch Notes
                  </div>
                  <div className="flex items-center">
                    <Avatar letter="J" bg="#4ea8ff" border="oklch(0.2520 0 0)" />
                    <Avatar letter="M" bg="#ff7b4e" border="oklch(0.2520 0 0)" />
                    <Avatar
                      letter="A"
                      bg="#22d3a5"
                      color="oklch(0.1776 0 0)"
                      border="oklch(0.2520 0 0)"
                    />
                  </div>
                </div>
                {/* toolbar */}
                <div className="flex h-[36px] items-center gap-px border-b border-[oklch(1_0_0_/_0.04)] bg-panel px-[14px]">
                  <span className="px-[7px] py-[3px] text-[12px] font-bold text-[oklch(0.45_0_0)]">
                    B
                  </span>
                  <span className="px-[7px] py-[3px] text-[12px] italic text-[oklch(0.45_0_0)]">
                    I
                  </span>
                  <span className="px-[7px] py-[3px] text-[12px] text-[oklch(0.45_0_0)] underline">
                    U
                  </span>
                  <div className="mx-[6px] h-[14px] w-px bg-[oklch(1_0_0_/_0.07)]" />
                  <span className="px-[6px] py-[3px] text-[11px] font-bold text-[oklch(0.45_0_0)]">
                    H1
                  </span>
                  <span className="px-[6px] py-[3px] text-[11px] font-bold text-[oklch(0.45_0_0)]">
                    H2
                  </span>
                  <div className="mx-[6px] h-[14px] w-px bg-[oklch(1_0_0_/_0.07)]" />
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                    <path
                      d="M1 1h12M1 5h9M1 9h10"
                      stroke="oklch(0.45 0 0)"
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
                  <div className="mb-[8px] text-[10px] font-bold uppercase tracking-[0.1em] text-[oklch(0.4_0_0)]">
                    Priorities
                  </div>
                  <div className="mb-[3px] overflow-visible whitespace-nowrap text-[13px] leading-[1.75] text-[oklch(0.72_0_0)]">
                    → Ship onboarding by <strong className="font-semibold text-fg">July 15</strong>
                    <Cursor
                      name="Jess"
                      color="#4ea8ff"
                      anim="cursor-jess 8s ease-in-out infinite"
                      blink="caret-blink 1.1s step-end infinite"
                    />
                  </div>
                  <div className="mb-[3px] overflow-visible text-[13px] leading-[1.75] text-[oklch(0.72_0_0)]">
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
                  <div className="mb-[14px] text-[13px] leading-[1.75] text-[oklch(0.72_0_0)]">
                    → Finalize API rate limit handling
                  </div>
                  <div className="mb-[8px] text-[10px] font-bold uppercase tracking-[0.1em] text-[oklch(0.4_0_0)]">
                    Blockers
                  </div>
                  <div className="overflow-visible text-[13px] leading-[1.75] text-[oklch(0.72_0_0)]">
                    Rate limits becoming a problem at scale
                    <Cursor
                      name="Alex"
                      color="#22d3a5"
                      textColor="oklch(0.1776 0 0)"
                      anim="cursor-alex 9s ease-in-out 0.4s infinite"
                      blink="caret-blink 0.9s step-end 0.6s infinite"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section
        id="features"
        className="bg-paper px-[clamp(20px,5vw,64px)] py-[clamp(72px,10vw,112px)]"
      >
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-[56px] max-w-[560px]">
            <p className={`${EYEBROW} mb-[12px] text-brand`}>What you get</p>
            <h2 className="mb-[16px] font-display text-[clamp(30px,3.5vw,44px)] font-extrabold leading-[1.08] tracking-[-1.5px] text-ink-fg [text-wrap:pretty]">
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p className="text-[17px] leading-[1.65] text-subtle">
              Built for teams who move fast but still need to know who&apos;s in the room and who
              can touch what.
            </p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[20px]">
            {features.map((f) => (
              <div
                key={f.title}
                data-card=""
                className="rounded-[14px] border border-line bg-surface p-[28px] shadow-[0_1px_4px_oklch(0_0_0_/_0.04)] transition-[transform,box-shadow,border-color] duration-[220ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-[5px] hover:border-[oklch(0.7_0.02_48)] hover:shadow-[0_14px_36px_oklch(0_0_0_/_0.09)]"
              >
                <div
                  className="mb-[16px] flex h-[42px] w-[42px] items-center justify-center rounded-[11px]"
                  style={{ background: f.iconBg }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    {f.icon}
                  </svg>
                </div>
                <div className="mb-[7px] font-display text-[16px] font-bold tracking-[-0.3px] text-ink-fg">
                  {f.title}
                </div>
                <p className="text-[14px] leading-[1.65] text-subtle">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRESENCE SPOTLIGHT ── */}
      <section className="relative overflow-hidden bg-ink px-[clamp(20px,5vw,64px)] py-[clamp(72px,10vw,112px)]">
        <div className="lp-presence-glow pointer-events-none absolute inset-0" />
        <div className="relative z-[1] mx-auto flex max-w-[1200px] flex-wrap items-center gap-[clamp(40px,6vw,80px)]">
          <div className="max-w-[480px] flex-[1_1_300px]">
            <p className={`${EYEBROW} mb-[14px] text-ablue`}>Live presence</p>
            <h2 className="mb-[18px] font-display text-[clamp(28px,3.2vw,42px)] font-extrabold leading-[1.08] tracking-[-1.5px] [text-wrap:pretty]">
              See every cursor.
              <br />
              Know every edit.
            </h2>
            <p className="mb-[28px] text-[16px] leading-[1.7] text-[oklch(0.65_0_0)] [text-wrap:pretty]">
              Every collaborator&apos;s cursor and text selection appears live — color-coded with
              their real name. No anonymous ghosts. No guessing. You always know who&apos;s touching
              what.
            </p>
            <div className="flex flex-col gap-[12px]">
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
          <div className="max-w-[500px] flex-[1_1_320px]">
            <div className="overflow-hidden rounded-[16px] border border-[oklch(1_0_0_/_0.08)] bg-panel shadow-[0_20px_60px_oklch(0_0_0_/_0.5)]">
              <div className="flex items-center justify-between border-b border-[oklch(1_0_0_/_0.06)] bg-panel-2 px-[18px] py-[14px]">
                <div>
                  <div className="font-display text-[14px] font-bold tracking-[-0.3px]">
                    Product Roadmap
                  </div>
                  <div className="mt-[2px] flex items-center gap-[5px] text-[11px] text-[oklch(0.5_0_0)]">
                    <span className="inline-block h-[6px] w-[6px] rounded-full bg-agreen" />3 people
                    editing now
                  </div>
                </div>
                <div className="flex items-center gap-[8px]">
                  <Avatar letter="S" bg="#ff7b4e" border="oklch(0.2520 0 0)" size={28} />
                  <Avatar
                    letter="K"
                    bg="oklch(0.4341 0.0392 41.9938)"
                    border="oklch(0.2520 0 0)"
                    size={28}
                  />
                  <Avatar
                    letter="D"
                    bg="#22d3a5"
                    color="oklch(0.1776 0 0)"
                    border="oklch(0.2520 0 0)"
                    size={28}
                  />
                </div>
              </div>
              <div className="border-b border-[oklch(1_0_0_/_0.05)] px-[18px] py-[14px]">
                <div className="mb-[10px] text-[10px] font-bold uppercase tracking-[0.09em] text-[oklch(0.4_0_0)]">
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
                    bg="oklch(0.4341 0.0392 41.9938)"
                    name="Kira Patel"
                    meta="kira@acme.io · editing"
                    dot="oklch(0.4341 0.0392 41.9938)"
                  />
                  <ActiveRow
                    letter="D"
                    bg="#22d3a5"
                    color="oklch(0.1776 0 0)"
                    name="Dev Okoro"
                    meta="dev@acme.io · viewing"
                    dot="#22d3a5"
                    dotFaded
                  />
                </div>
              </div>
              <div className="px-[18px] pt-[14px] pb-[18px]">
                <div className="mb-[4px] text-[12px] leading-[1.7] text-[oklch(0.72_0_0)]">
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
                <div className="text-[12px] leading-[1.7] text-[oklch(0.72_0_0)]">
                  Auth conversion down 18%
                  <Cursor
                    name="Kira"
                    color="oklch(0.4341 0.0392 41.9938)"
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

      {/* ── COMPARISON ── */}
      <section id="why" className="bg-paper px-[clamp(20px,5vw,64px)] py-[clamp(72px,10vw,112px)]">
        <div className="mx-auto max-w-[1200px]">
          <div className="mx-auto mb-[56px] max-w-[600px] text-center">
            <p className={`${EYEBROW} mb-[12px] text-brand`}>What makes it different</p>
            <h2 className="font-display text-[clamp(28px,3.2vw,42px)] font-extrabold leading-[1.08] tracking-[-1.5px] text-ink-fg [text-wrap:pretty]">
              Collab without the guesswork.
            </h2>
            <p className="mt-[14px] text-[17px] leading-[1.65] text-subtle">
              Most tools trust the link. Yapper trusts the person.
            </p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-[24px]">
            {/* Typical tools */}
            <div className="rounded-[16px] border border-line bg-surface p-[32px]">
              <div className="mb-[24px] flex items-center gap-[10px] border-b border-[oklch(0.9_0_0)] pb-[20px]">
                <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[9px] bg-[oklch(0.94_0_0)]">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Z"
                      stroke="oklch(0.6 0 0)"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M8 5v3.5L10 10"
                      stroke="oklch(0.6 0 0)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="font-display text-[16px] font-bold tracking-[-0.3px] text-[oklch(0.6_0_0)]">
                  Typical collab tools
                </div>
              </div>
              <div className="flex flex-col gap-[14px]">
                <ConRow>
                  <strong className="font-semibold text-[oklch(0.5_0_0)]">Anonymous cursors</strong>{" "}
                  — a color, no name, no accountability
                </ConRow>
                <ConRow>
                  Anyone with the link can open and edit —{" "}
                  <strong className="font-semibold text-[oklch(0.5_0_0)]">no login required</strong>
                </ConRow>
                <ConRow>
                  Revoke by deleting or rotating the link —{" "}
                  <strong className="font-semibold text-[oklch(0.5_0_0)]">
                    hope they don&apos;t have a copy
                  </strong>
                </ConRow>
                <ConRow>
                  <strong className="font-semibold text-[oklch(0.5_0_0)]">No record</strong> of who
                  has ever opened the document
                </ConRow>
              </div>
            </div>
            {/* Yapper */}
            <div className="rounded-[16px] border border-cream/30 bg-ink p-[32px] shadow-[0_0_0_1px_oklch(0.9247_0.0524_66.1732_/_0.06),0_8px_32px_oklch(0.4341_0.0392_41.9938_/_0.12)]">
              <div className="mb-[24px] flex items-center gap-[10px] border-b border-[oklch(1_0_0_/_0.07)] pb-[20px]">
                <LogoMark size={36} />
                <div className="font-display text-[16px] font-bold tracking-[-0.3px]">Yapper</div>
              </div>
              <div className="flex flex-col gap-[14px]">
                <ProRow>
                  <strong className="font-semibold text-fg">Real name behind every cursor</strong> —
                  Google or GitHub identity, always
                </ProRow>
                <ProRow>
                  <strong className="font-semibold text-fg">Login required</strong> — no anonymous
                  collaborators, ever
                </ProRow>
                <ProRow>
                  <strong className="font-semibold text-fg">One click makes it private</strong> —
                  everyone disconnects instantly, link rotates
                </ProRow>
                <ProRow>
                  <strong className="font-semibold text-fg">Full collaborator list</strong> —
                  tracked from the moment they first open the note
                </ProRow>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MAKE PRIVATE ── */}
      <section className="relative overflow-hidden bg-ink px-[clamp(20px,5vw,64px)] py-[clamp(72px,10vw,112px)]">
        <div className="lp-private-glow pointer-events-none absolute inset-0" />
        <div className="lp-grid-faint pointer-events-none absolute inset-0" />
        <div className="relative z-[1] mx-auto flex max-w-[1200px] flex-wrap items-center gap-[clamp(40px,6vw,80px)]">
          <div className="max-w-[480px] flex-[1_1_300px]">
            <p className={`${EYEBROW} mb-[14px] text-cream`}>Owner control</p>
            <h2 className="mb-[18px] font-display text-[clamp(28px,3.2vw,42px)] font-extrabold leading-[1.08] tracking-[-1.5px] [text-wrap:pretty]">
              Privacy isn&apos;t a setting.
              <br />
              It&apos;s a switch.
            </h2>
            <p className="mb-[28px] text-[16px] leading-[1.7] text-[oklch(0.65_0_0)] [text-wrap:pretty]">
              One click. Instant disconnect. The share link rotates, every collaborator is marked
              revoked, and the note is yours alone — while you stay connected the whole time.
            </p>
            <div className="flex flex-col gap-[12px]">
              {[
                "One access level per note: private, view-only, or edit",
                "Collaborators disconnected in real time — they see the reason",
                "The share link rotates — the old one never works again",
              ].map((line) => (
                <div key={line} className={CHECK_ROW}>
                  <CheckBullet bg="oklch(0.9247 0.0524 66.1732)" stroke="oklch(0.2435 0 0)" />
                  <span className={BULLET_TEXT}>{line}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="max-w-[440px] flex-[1_1_320px]">
            <div className="flex flex-col gap-[14px]">
              <div className="overflow-hidden rounded-[14px] border border-[oklch(1_0_0_/_0.09)] bg-panel shadow-[0_12px_40px_oklch(0_0_0_/_0.4)]">
                <div className="border-b border-[oklch(1_0_0_/_0.06)] px-[20px] py-[18px]">
                  <div className="mb-[3px] flex items-center justify-between">
                    <div className="font-display text-[15px] font-bold tracking-[-0.3px]">
                      Project Brief
                    </div>
                    <div className="flex items-center">
                      <Avatar letter="J" bg="#ff7b4e" border="oklch(0.2134 0 0)" size={22} />
                      <Avatar letter="M" bg="#4ea8ff" border="oklch(0.2134 0 0)" size={22} />
                      <Avatar
                        letter="A"
                        bg="#22d3a5"
                        color="oklch(0.1776 0 0)"
                        border="oklch(0.2134 0 0)"
                        size={22}
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-[oklch(0.5_0_0)]">
                    Shared with 3 collaborators · Edit access
                  </div>
                </div>
                <div className="px-[20px] py-[16px]">
                  <div className="mb-[10px] text-[11px] font-bold uppercase tracking-[0.08em] text-[oklch(0.4_0_0)]">
                    Access level
                  </div>
                  <div className="mb-[14px] flex gap-[8px]">
                    <div className="flex-1 rounded-[8px] border border-[oklch(1_0_0_/_0.07)] p-[8px] text-center text-[12px] font-medium text-[oklch(0.5_0_0)]">
                      Private
                    </div>
                    <div className="flex-1 rounded-[8px] border border-[oklch(1_0_0_/_0.07)] p-[8px] text-center text-[12px] font-medium text-[oklch(0.5_0_0)]">
                      View only
                    </div>
                    <div className="flex-1 rounded-[8px] border-[1.5px] border-cream/50 bg-cream/[0.08] p-[8px] text-center text-[12px] font-semibold text-cream">
                      Edit
                    </div>
                  </div>
                  <div className="flex cursor-pointer items-center justify-between rounded-[9px] border border-[rgba(220,40,40,0.22)] bg-[rgba(220,40,40,0.1)] px-[14px] py-[11px] transition-colors hover:bg-[rgba(220,40,40,0.18)]">
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
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
              <div className="flex items-start gap-[12px] rounded-[12px] border border-[rgba(220,40,40,0.2)] bg-[oklch(0.17_0.015_30)] px-[18px] py-[16px]">
                <div className="mt-px flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border border-[rgba(220,40,40,0.3)] bg-[rgba(220,40,40,0.15)]">
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
                  <div className="text-[12px] leading-[1.5] text-[oklch(0.4_0.04_30)]">
                    You&apos;ve been disconnected. The owner has made this note private.
                  </div>
                </div>
              </div>
              <p className="text-center text-[11px] tracking-[0.02em] text-[oklch(0.4_0_0)]">
                ↑ What every other collaborator sees, instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-paper px-[clamp(20px,5vw,64px)] py-[clamp(80px,12vw,120px)]">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="mb-[18px] font-display text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.06] tracking-[-2px] text-ink-fg [text-wrap:pretty]">
            Start writing. Together.
          </h2>
          <p className="mb-[36px] text-[17px] leading-[1.65] text-subtle [text-wrap:pretty]">
            Sign in with your Google or GitHub account. Every note starts private. Share when
            you&apos;re ready — pull it back whenever you want.
          </p>
          <div className="flex flex-wrap justify-center gap-[14px]">
            <button type="button" onClick={() => signInWith("google")} className={CTA_GOOGLE}>
              <GoogleIcon size={20} /> Continue with Google
            </button>
            <button type="button" onClick={() => signInWith("github")} className={CTA_GITHUB}>
              <GitHubIcon size={20} /> Continue with GitHub
            </button>
          </div>
          <p className="mt-[20px] text-[13px] text-[oklch(0.6_0_0)]">
            No anonymous access. Every collaborator is a real, tracked identity.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[oklch(1_0_0_/_0.06)] bg-ink px-[clamp(20px,5vw,64px)] py-[36px]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-[16px]">
          <div className="flex items-center gap-[9px]">
            <LogoMark size={26} radius={7} />
            <span className="font-display text-[16px] font-extrabold tracking-[-0.4px]">
              Yapper
            </span>
          </div>
          <p className="text-[13px] text-[oklch(0.4_0_0)]">
            © 2025 Yapper. Real notes. Real identities. Real control.
          </p>
          {/* Routes don't exist yet — they're the intended destinations (see implementation.md TODO). */}
          <div className="flex gap-[20px]">
            <a
              href="/privacy"
              className="text-[13px] text-[oklch(0.4_0_0)] no-underline transition-colors hover:text-[oklch(0.7_0_0)]"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="text-[13px] text-[oklch(0.4_0_0)] no-underline transition-colors hover:text-[oklch(0.7_0_0)]"
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
        <div className="text-[11px] text-[oklch(0.5_0_0)]">{meta}</div>
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

function ConRow({ children }: { children: React.ReactNode }) {
  return (
    <div className={CHECK_ROW}>
      <span className="shrink-0 text-[16px] font-bold leading-[1.4] text-[oklch(0.7_0_0)]">✗</span>
      <span className="text-[14px] leading-[1.55] text-[oklch(0.6_0_0)]">{children}</span>
    </div>
  );
}

function ProRow({ children }: { children: React.ReactNode }) {
  return (
    <div className={CHECK_ROW}>
      <span className="shrink-0 text-[16px] font-bold leading-[1.4] text-agreen">✓</span>
      <span className="text-[14px] leading-[1.55] text-[oklch(0.82_0_0)]">{children}</span>
    </div>
  );
}
