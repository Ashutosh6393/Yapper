import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const socialMock = vi.fn();
vi.mock("../../lib/auth-client", () => ({
  signIn: { social: (...args: unknown[]) => socialMock(...args) },
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

import LandingPage from "./LandingPage";

describe("LandingPage (slice 08 goal state)", () => {
  beforeEach(() => {
    socialMock.mockReset();
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
});
