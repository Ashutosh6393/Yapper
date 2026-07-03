import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSessionMock = vi.fn();
vi.mock("../../lib/auth-client", () => ({
  signIn: { social: vi.fn() },
  signOut: vi.fn(),
  useSession: () => useSessionMock(),
}));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

import LoginPage from "./page";

function loggedOut() {
  useSessionMock.mockReturnValue({ data: null, isPending: false });
}
function loggedIn() {
  useSessionMock.mockReturnValue({ data: { user: { email: "a@b.c" } }, isPending: false });
}

describe("LoginPage (spec 10 goal state)", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useSessionMock.mockReset();
    searchParams = new URLSearchParams();
    loggedOut();
  });

  it("shows the OAuth buttons and does not redirect a logged-out visitor", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with GitHub/i })).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects a logged-in visitor with no returnTo to /dashboard", async () => {
    loggedIn();
    render(<LoginPage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("redirects a logged-in visitor to a same-origin returnTo, taking precedence over /dashboard", async () => {
    searchParams = new URLSearchParams("returnTo=/share/abc");
    loggedIn();
    render(<LoginPage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/share/abc"));
  });
});
