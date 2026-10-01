// Web: the Connect button tells the server which page it was clicked on, and the page the
// user returns to shows "connected" straight away without any re-login step in the UI.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../components/Navbar", () => ({ default: () => null }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const { default: api } = await import("../api");
const { default: toast } = await import("react-hot-toast");
const { default: Integrations } = await import("../pages/Integrations");

const GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth?state=signed";
const realLocation = window.location;

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/integrations" element={<Integrations />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, href: "http://localhost:5173/integrations" } });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

describe("web Gmail connect", () => {
  it("sends the current route as returnTo and then navigates to Google", async () => {
    api.get.mockImplementation((path) => (path === "/gmail/status" ? Promise.resolve({ data: { connected: false } }) : Promise.resolve({ data: { url: GOOGLE } })));
    renderAt("/integrations?tab=email");
    await userEvent.click(await screen.findByRole("button", { name: "Connect Gmail" }));
    await waitFor(() => expect(window.location.href).toBe(GOOGLE));
    expect(api.get).toHaveBeenCalledWith("/gmail/auth-url", { params: { returnTo: "/integrations?tab=email" } });
  });

  it("after returning with ?gmail=connected the page shows Gmail connected immediately and cleans the URL", async () => {
    api.get.mockResolvedValue({ data: { connected: true } });
    renderAt("/integrations?gmail=connected");
    expect(await screen.findByText("Gmail connected")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Gmail connected");
    expect(api.get).toHaveBeenCalledWith("/gmail/status");
    expect(api.post).not.toHaveBeenCalled(); // no login / session call from the page itself
  });

  it("a failed callback reports the real failure, not a connected state", async () => {
    api.get.mockResolvedValue({ data: { connected: false } });
    renderAt("/integrations?gmail=error");
    expect(await screen.findByRole("button", { name: "Connect Gmail" })).toBeTruthy();
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
