import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const auth = { status: "authenticated", user: { id: 1, role: "user" }, isAdmin: false, logout: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../components/NotificationBell", () => ({ default: () => null }));
vi.mock("../components/ThemeToggle", () => ({ default: () => null }));

import AdminRoute from "../components/AdminRoute";
import Navbar from "../components/Navbar";
import AdminDeleteButton from "../components/AdminDeleteButton";

const setRole = (role) => { auth.user = { id: 1, role }; auth.isAdmin = role === "admin"; };

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/job-discovery"]}>
      <Routes>
        <Route path="/job-discovery" element={<AdminRoute><p>secret discovery</p></AdminRoute>} />
        <Route path="/dashboard" element={<p>dashboard home</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

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
