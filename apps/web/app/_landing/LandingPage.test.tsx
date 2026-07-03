import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const socialMock = vi.fn();
const useSessionMock = vi.fn();
vi.mock("../../lib/auth-client", () => ({
  signIn: { social: (...args: unknown[]) => socialMock(...args) },
  signOut: vi.fn(),
  useSession: () => useSessionMock(),
}));

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

import LandingPage from "./LandingPage";

function loggedOut() {
  useSessionMock.mockReturnValue({ data: null, isPending: false });
}
function loggedIn() {
  useSessionMock.mockReturnValue({ data: { user: { email: "a@b.c" } }, isPending: false });
}
function pending() {
  useSessionMock.mockReturnValue({ data: null, isPending: true });
}

describe("LandingPage (slice 08 goal state)", () => {
  beforeEach(() => {
    socialMock.mockReset();
    replaceMock.mockReset();
    useSessionMock.mockReset();
    loggedOut(); // default: resolved, logged out
  });

  it("renders the hero headline", () => {
    render(<LandingPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/Notes that know/i);
    expect(h1).toHaveTextContent(/who's in the room/i);
  });

  it("exposes Google + GitHub CTAs in both the hero and the final CTA", () => {
    render(<LandingPage />);
    expect(
      screen.getAllByRole("button", { name: /Continue with Google/i }).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByRole("button", { name: /Continue with GitHub/i }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("renders every marketing section + footer", () => {
    render(<LandingPage />);
    expect(screen.getByText(/Everything you need\. Nothing you don't\./i)).toBeInTheDocument();
    expect(screen.getByText(/See every cursor\./i)).toBeInTheDocument();
    expect(screen.getByText(/Collab without the guesswork\./i)).toBeInTheDocument();
    expect(screen.getByText(/Privacy isn't a setting\./i)).toBeInTheDocument();
    expect(screen.getByText(/Start writing\. Together\./i)).toBeInTheDocument();
    expect(screen.getByText(/© 2025 Yapper/i)).toBeInTheDocument();
  });

  it("triggers Better Auth Google sign-in with a /dashboard callback when a CTA is clicked", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    const [googleCta] = screen.getAllByRole("button", { name: /Continue with Google/i });
    await user.click(googleCta as HTMLElement);
    expect(socialMock).toHaveBeenCalledTimes(1);
    const arg = socialMock.mock.calls[0]?.[0] as { provider: string; callbackURL: string };
    expect(arg.provider).toBe("google");
    expect(arg.callbackURL).toMatch(/\/dashboard$/);
  });

  it("triggers GitHub sign-in for the GitHub CTA", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    const [githubCta] = screen.getAllByRole("button", { name: /Continue with GitHub/i });
    await user.click(githubCta as HTMLElement);
    expect(socialMock).toHaveBeenCalledTimes(1);
    expect((socialMock.mock.calls[0]?.[0] as { provider: string }).provider).toBe("github");
  });

  // ── Auth entry-surface redirect (spec 10) ──────────────────────────────────

  it("redirects a logged-in visitor to /dashboard and shows no marketing CTAs", async () => {
    loggedIn();
    render(<LandingPage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryAllByRole("button", { name: /Continue with Google/i })).toHaveLength(0);
  });

  it("shows a neutral loader (not the marketing page) while the session is pending", () => {
    pending();
    render(<LandingPage />);
    // A2: neither the marketing page nor its CTAs render until the session resolves, so a
    // returning logged-in visitor never sees the marketing page flash before the redirect.
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /Continue with Google/i })).toHaveLength(0);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("does not redirect a resolved logged-out visitor", () => {
    render(<LandingPage />); // default logged-out
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
