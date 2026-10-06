import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axios from "axios";

const MSG = "Your account has been blocked. Please contact an administrator.";
const blocked403 = { response: { status: 403, data: { code: "account_blocked", message: MSG } } };

vi.mock("../api", async () => {
  const actual = await vi.importActual("../api");
  return {
    ...actual,
    default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
    refreshAccessToken: vi.fn(),
  };
});
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const { default: api, refreshAccessToken } = await import("../api");
const { default: toast } = await import("react-hot-toast");
const { AuthProvider } = await import("../context/AuthContext");
const { default: Login } = await import("../pages/Login");
const { default: ProtectedRoute } = await import("../components/ProtectedRoute");
const { getAccessToken, setAccessToken } = await import("../utils/auth");

const tree = (path) => (
  <MemoryRouter initialEntries={[path]}>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/:role" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><p>user home</p></ProtectedRoute>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>
);
const fill = () => {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "a@x.co" } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secret12" } });
};

beforeEach(() => {
  vi.clearAllMocks();
  setAccessToken(null);
  refreshAccessToken.mockRejectedValue({ response: { status: 401, data: {} } });
});
afterEach(() => cleanup());

describe("blocked accounts (web)", () => {
  it.each([["user", /sign in as user/i], ["admin", /sign in as admin/i]])("a blocked %s login shows a persistent alert instead of a toast", async (role, btn) => {
    api.post.mockRejectedValue(blocked403);
    render(tree(`/login/${role}`));
    await screen.findByLabelText(/email address/i);
    fill();
    fireEvent.click(screen.getByRole("button", { name: btn }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(MSG));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a session ended by account_blocked lands on login with the notice", async () => {
    api.get.mockResolvedValue({ data: { user: { id: 3, role: "user", name: "A" } } });
    refreshAccessToken.mockResolvedValue({});
    setAccessToken("tok");
    render(tree("/dashboard"));
    await screen.findByText("user home");

    act(() => {
      window.dispatchEvent(new CustomEvent("tracktrail:session-ended", { detail: { reason: "blocked", message: MSG } }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(MSG));
    expect(screen.queryByText("user home")).toBeNull();
  });

  it("restore() failing with account_blocked shows the notice", async () => {
    refreshAccessToken.mockRejectedValue({ ...blocked403, userMessage: MSG });
    render(tree("/dashboard"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(MSG));
  });
});

describe("api interceptor", () => {
  it("403 account_blocked clears the token and dispatches session-ended (but not for /auth/login)", async () => {
    const { default: realApi } = await vi.importActual("../api");
    const fail = () => async (config) => {
      throw new axios.AxiosError("Forbidden", "ERR_BAD_REQUEST", config, null, { status: 403, data: { code: "account_blocked", message: MSG }, headers: {}, config, statusText: "Forbidden" });
    };
    const handler = vi.fn();
    window.addEventListener("tracktrail:session-ended", handler);
    try {
      setAccessToken("tok");
      realApi.defaults.adapter = fail();
      const err = await realApi.get("/jobs").catch((e) => e);
      expect(err.userMessage).toBe(MSG);
      expect(getAccessToken()).toBeNull();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].detail).toEqual({ reason: "blocked", message: MSG });

      handler.mockClear();
      setAccessToken("tok");
      const loginErr = await realApi.post("/auth/login", {}).catch((e) => e);
      expect(loginErr.userMessage).toBe(MSG);
      expect(handler).not.toHaveBeenCalled();
      expect(getAccessToken()).toBe("tok");
    } finally {
      window.removeEventListener("tracktrail:session-ended", handler);
    }
  });
});
