import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const auth = { status: "anonymous", user: null, isAdmin: false, login: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
const post = vi.fn();
vi.mock("../api", () => ({ default: { post: (...a) => post(...a) } }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import Login from "../pages/Login";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/:role" element={<Login />} />
        <Route path="/admin" element={<p>admin home</p>} />
        <Route path="/dashboard" element={<p>user home</p>} />
        <Route path="/register" element={<p>register page</p>} />
      </Routes>
    </MemoryRouter>
  );
}
const fill = () => {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "a@x.co" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secret12" } });
};

beforeEach(() => { post.mockReset(); auth.login.mockReset(); auth.status = "anonymous"; });

afterEach(() => cleanup());

describe("role-based login (web)", () => {
  it("/login offers a clear User / Admin choice", () => {
    renderAt("/login");
    expect(screen.getByRole("link", { name: /continue as user/i }).getAttribute("href")).toBe("/login/user");
    expect(screen.getByRole("link", { name: /continue as admin/i }).getAttribute("href")).toBe("/login/admin");
  });

  it("unknown role paths fall back to the chooser", () => {
    renderAt("/login/root");
    expect(screen.getByText(/who is signing in/i)).toBeTruthy();
  });

  it("user flow posts role=user and lands on the dashboard", async () => {
    post.mockResolvedValue({ data: { token: "t", user: { id: 2, name: "U", role: "user" } } });
    renderAt("/login/user");
    fill();
    fireEvent.click(screen.getByRole("button", { name: /sign in as user/i }));
    await waitFor(() => expect(screen.getByText("user home")).toBeTruthy());
    expect(post.mock.calls[0][1].role).toBe("user");
  });

  it("admin flow posts role=admin and lands on the admin panel", async () => {
    post.mockResolvedValue({ data: { token: "t", user: { id: 1, name: "A", role: "admin" } } });
    renderAt("/login/admin");
    fill();
    fireEvent.click(screen.getByRole("button", { name: /sign in as admin/i }));
    await waitFor(() => expect(screen.getByText("admin home")).toBeTruthy());
    expect(post.mock.calls[0][1].role).toBe("admin");
  });

  it("a server refusal (403 admin_required) shows an error and never starts a session", async () => {
    post.mockRejectedValue({ response: { data: { code: "admin_required", message: "This account does not have administrator access." } } });
    renderAt("/login/admin");
    fill();
    fireEvent.click(screen.getByRole("button", { name: /sign in as admin/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/administrator access/i));
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("even if a response claims success, a non-admin user object is never accepted on the admin door", async () => {
    post.mockResolvedValue({ data: { token: "t", user: { id: 2, name: "U", role: "user" } } });
    renderAt("/login/admin");
    fill();
    fireEvent.click(screen.getByRole("button", { name: /sign in as admin/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("the admin door has no sign-up link and never redirects to register", async () => {
    post.mockRejectedValue({ response: { data: { message: "Invalid email or password" } } });
    renderAt("/login/admin");
    expect(screen.queryByText(/create one now/i)).toBeNull();
  });
});
