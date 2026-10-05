import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const auth = { status: "authenticated", user: { id: 1, role: "user" }, isAdmin: false, logout: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../components/NotificationBell", () => ({ default: () => null }));
vi.mock("../components/ThemeToggle", () => ({ default: () => null }));
const apiGet = vi.fn();
vi.mock("../api", () => ({ default: { get: (...a) => apiGet(...a), delete: vi.fn() } }));

import AdminRoute from "../components/AdminRoute";
import Navbar from "../components/Navbar";
import AdminDeleteButton from "../components/AdminDeleteButton";
import Sources from "../pages/Sources";

const setRole = (role) => { auth.user = { id: 1, role }; auth.isAdmin = role === "admin"; };

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/job-discovery"]}>
      <Routes>
        <Route path="/job-discovery" element={<AdminRoute><p>secret discovery</p></AdminRoute>} />
        <Route path="/dashboard" element={<p>dashboard home</p>} />
        <Route path="/login/admin" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => cleanup());

describe("admin gating (web)", () => {
  it("redirects normal users away from admin routes", () => {
    setRole("user");
    renderGuard();
    expect(screen.queryByText("secret discovery")).toBeNull();
    expect(screen.getByText("dashboard home")).toBeTruthy();
  });

  it("lets admins in", () => {
    setRole("admin");
    renderGuard();
    expect(screen.getByText("secret discovery")).toBeTruthy();
  });

  it("sends anonymous visitors to login", () => {
    setRole("user");
    auth.status = "anonymous";
    renderGuard();
    expect(screen.getByText("login page")).toBeTruthy();
    auth.status = "authenticated";
  });

  it("hides Job Discovery and Admin from the nav for normal users, shows them to admins", () => {
    setRole("user");
    const { unmount } = render(<MemoryRouter><Navbar /></MemoryRouter>);
    // open the mobile menu so every link is rendered
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    expect(screen.queryAllByText("Job Discovery")).toHaveLength(0);
    expect(screen.queryAllByText("Admin")).toHaveLength(0);
    unmount();

    setRole("admin");
    render(<MemoryRouter><Navbar /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    expect(screen.queryAllByText("Job Discovery").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Admin").length).toBeGreaterThan(0);
  });

  it("shows Sources in the navigation for both users and admins", () => {
    for (const role of ["user", "admin"]) {
      setRole(role);
      const { unmount } = render(<MemoryRouter><Navbar /></MemoryRouter>);
      fireEvent.click(screen.getByLabelText("Toggle menu"));
      expect(screen.queryAllByText("Sources").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("Sources renders exactly what the server returns; delete controls and site URLs are admin-only", async () => {
    const userRows = [{ id: 1, name: "manual", baseUrl: null, scope: "private", jobCount: 2 }, { id: 2, name: "gmail", baseUrl: null, scope: "private", jobCount: 0 }, { id: 3, name: "extension", baseUrl: null, scope: "private", jobCount: 1 }];
    const adminRows = [{ id: 4, name: "linkedin", baseUrl: "https://linkedin.example", scope: "global", jobCount: 5 }];
    apiGet.mockImplementation(async () => ({ data: { data: auth.isAdmin ? adminRows : userRows } }));

    setRole("user");
    const u = render(<MemoryRouter><Sources /></MemoryRouter>);
    expect(await screen.findByText("Manual")).toBeTruthy();
    expect(screen.getByText("Gmail")).toBeTruthy();
    expect(screen.getByText("Browser extension")).toBeTruthy();
    expect(screen.queryByText("LinkedIn")).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    u.unmount();

    setRole("admin");
    render(<MemoryRouter><Sources /></MemoryRouter>);
    expect(await screen.findByText("LinkedIn")).toBeTruthy();
    expect(screen.getByText("https://linkedin.example")).toBeTruthy();
    expect(screen.queryByText("Manual")).toBeNull();
    expect(screen.getByRole("button", { name: /delete linkedin/i })).toBeTruthy();
  });

  it("renders delete controls only for admins", () => {
    setRole("user");
    const { container, unmount } = render(<AdminDeleteButton kind="jobs" id={1} label="x" />);
    expect(container.innerHTML).toBe("");
    unmount();
    setRole("admin");
    render(<AdminDeleteButton kind="jobs" id={1} label="x" />);
    expect(screen.getByRole("button", { name: /delete x/i })).toBeTruthy();
  });
});
