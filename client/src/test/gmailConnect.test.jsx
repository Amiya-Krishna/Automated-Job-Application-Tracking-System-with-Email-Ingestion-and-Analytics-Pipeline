// Web Gmail OAuth stays in a popup so the main React application is never unloaded.
// The access token is intentionally memory-only; navigating the main tab to Google
// would destroy that authenticated state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../components/Navbar", () => ({ default: () => null }));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const { default: api } = await import("../api");
const { default: toast } = await import("react-hot-toast");
const { default: Integrations } = await import("../pages/Integrations");

const GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth?state=signed";
const realOpen = window.open;
const realLocation = window.location;
let popup;

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/integrations" element={<Integrations />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  popup = {
    closed: false,
    location: { href: "about:blank" },
    focus: vi.fn(),
    close: vi.fn(() => { popup.closed = true; }),
  };

  Object.defineProperty(window, "open", {
    configurable: true,
    value: vi.fn(() => popup),
  });

  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, href: "http://localhost:5173/integrations" },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "open", {
    configurable: true,
    value: realOpen,
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

describe("web Gmail connect", () => {
  it("opens Gmail OAuth in a popup and keeps the main page in place", async () => {
    api.get.mockImplementation((path) =>
      path === "/gmail/status"
        ? Promise.resolve({ data: { connected: false } })
        : Promise.resolve({ data: { url: GOOGLE } }),
    );

    renderAt("/integrations?tab=email");
    await userEvent.click(await screen.findByRole("button", { name: "Connect Gmail" }));

    await waitFor(() => expect(popup.location.href).toBe(GOOGLE));
    expect(window.open).toHaveBeenCalledWith(
      "about:blank",
      "tracktrail-gmail-oauth",
      "popup,width=520,height=720,resizable=yes,scrollbars=yes",
    );
    expect(api.get).toHaveBeenCalledWith("/gmail/auth-url", {
      params: { returnTo: "/integrations?tab=email", popup: "1" },
    });
    expect(window.location.href).toBe("http://localhost:5173/integrations");
    expect(popup.focus).toHaveBeenCalled();
  });

  it("accepts only a same-origin OAuth completion message and stays logged in", async () => {
    api.get.mockResolvedValue({ data: { connected: false } });
    renderAt("/integrations");

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/gmail/status"));

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "tracktrail:gmail-oauth", status: "connected" },
      }),
    );

    expect(await screen.findByText("Gmail connected")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Gmail connected");
    expect(popup.close).toHaveBeenCalled();
  });

  it("ignores OAuth messages from another origin", async () => {
    api.get.mockResolvedValue({ data: { connected: false } });
    renderAt("/integrations");

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/gmail/status"));

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.example",
        data: { type: "tracktrail:gmail-oauth", status: "connected" },
      }),
    );

    expect(screen.queryByText("Gmail connected")).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("still handles the legacy direct callback URL", async () => {
    api.get.mockResolvedValue({ data: { connected: true } });
    renderAt("/integrations?gmail=connected");

    expect(await screen.findByText("Gmail connected")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Gmail connected");
    expect(api.get).toHaveBeenCalledWith("/gmail/status");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("reports a failed callback without showing a connected state", async () => {
    api.get.mockResolvedValue({ data: { connected: false } });
    renderAt("/integrations?gmail=error");

    expect(await screen.findByRole("button", { name: "Connect Gmail" })).toBeTruthy();
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
