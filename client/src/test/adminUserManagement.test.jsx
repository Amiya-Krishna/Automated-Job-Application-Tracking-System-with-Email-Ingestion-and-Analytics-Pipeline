import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const auth = { status: "authenticated", user: { id: 1, role: "admin" }, isAdmin: true };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../components/Navbar", () => ({ default: () => null }));
vi.mock("../api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const { default: api } = await import("../api");
const { default: toast } = await import("react-hot-toast");
const { default: Admin } = await import("../pages/Admin");

const base = { createdAt: "2026-01-02T00:00:00Z", blockedAt: null, gmailConnected: false, trackedJobs: 3, lastActiveAt: null };
const USERS = [
  { ...base, id: 1, name: "Root Admin", email: "root@x.co", role: "admin", status: "ACTIVE" },
  { ...base, id: 2, name: "Other Admin", email: "admin2@x.co", role: "admin", status: "ACTIVE" },
  { ...base, id: 3, name: "Alice", email: "alice@x.co", role: "user", status: "ACTIVE", gmailConnected: true },
  { ...base, id: 4, name: "Bob", email: "bob@x.co", role: "user", status: "BLOCKED" },
];

function mockGets() {
  api.get.mockImplementation(async (url) => {
    if (url === "/admin/overview") return { data: { data: { users: 4, admins: 2, blockedUsers: 1, jobs: 0, companies: 0, sources: 0, discoveryRuns: 0 } } };
    if (url === "/admin/users") return { data: { data: USERS, meta: { total: 4, page: 1, pageSize: 50 } } };
    return { data: { data: [] } };
  });
}
const usersCalls = () => api.get.mock.calls.filter((c) => c[0] === "/admin/users");
const lastParams = () => usersCalls().at(-1)[1].params;
const renderAdmin = () => render(<MemoryRouter><Admin /></MemoryRouter>);
const rowOf = (name) => screen.getByText(name, { selector: "td" }).closest("tr");

beforeEach(() => {
  vi.clearAllMocks();
  mockGets();
});
afterEach(() => cleanup());

describe("admin user management (web)", () => {
  it("lists users with textual Active / Blocked badges and the Blocked stat", async () => {
    renderAdmin();
    await screen.findByText("Alice", { selector: "td" });
    expect(within(rowOf("Alice")).getByText("Active")).toBeTruthy();
    expect(within(rowOf("Bob")).getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("Blocked", { selector: "p" })).toBeTruthy();
    expect(screen.getByText(/4 users · Page 1 of 1/)).toBeTruthy();
  });

  it("offers no block/delete on your own row or admin rows, only on normal users", async () => {
    renderAdmin();
    await screen.findByText("Alice", { selector: "td" });
    const self = within(rowOf("Root Admin"));
    expect(self.getByText("You")).toBeTruthy();
    expect(self.queryByRole("button")).toBeNull();
    const other = within(rowOf("Other Admin"));
    expect(other.getByText("Administrator")).toBeTruthy();
    expect(other.queryByRole("button", { name: /block|delete/i })).toBeNull();
    expect(other.getByRole("button", { name: /make user/i })).toBeTruthy();
    const alice = within(rowOf("Alice"));
    expect(alice.getByRole("button", { name: "Block Alice" })).toBeTruthy();
    expect(alice.getByRole("button", { name: "Delete Alice" })).toBeTruthy();
    expect(within(rowOf("Bob")).getByRole("button", { name: "Unblock Bob" })).toBeTruthy();
  });

  it("blocks after confirmation", async () => {
    api.post.mockResolvedValue({ data: { message: "User blocked", data: { id: 3, status: "BLOCKED" } } });
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText("Alice", { selector: "td" });
    await user.click(screen.getByRole("button", { name: "Block Alice" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/data is kept/i);
    expect(api.post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: /block user/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/users/3/block"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("User blocked"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("unblocks directly with the right endpoint", async () => {
    api.post.mockResolvedValue({ data: { message: "User unblocked", data: { id: 4, status: "ACTIVE" } } });
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText("Bob", { selector: "td" });
    await user.click(screen.getByRole("button", { name: "Unblock Bob" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/users/4/unblock"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("User unblocked"));
  });

  it("deletes after confirmation and explains it is permanent", async () => {
    api.delete.mockResolvedValue({ data: { message: "User deleted", data: { id: 3 } } });
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText("Alice", { selector: "td" });
    await user.click(screen.getByRole("button", { name: "Delete Alice" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/permanently/i);
    expect(dialog.textContent).toMatch(/preserved/i);
    expect(api.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: /delete permanently/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/admin/users/3"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("User deleted"));
  });

  it("shows the server error inside the dialog and keeps it open", async () => {
    api.delete.mockRejectedValue({ response: { status: 403, data: { code: "cannot_manage_admin", message: "Demote the administrator first." } } });
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText("Alice", { selector: "td" });
    await user.click(screen.getByRole("button", { name: "Delete Alice" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /delete permanently/i }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/demote/i);
  });

  it("sends search (debounced) and status filter as server-side query params", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText("Alice", { selector: "td" });
    expect(lastParams()).toEqual({ page: 1, pageSize: 50 });

    await user.type(screen.getByLabelText("Search users"), "ali");
    await waitFor(() => expect(lastParams()).toMatchObject({ q: "ali", page: 1 }));

    await user.selectOptions(screen.getByLabelText("Status"), "BLOCKED");
    await waitFor(() => expect(lastParams()).toMatchObject({ q: "ali", status: "BLOCKED" }));
  });

  it("paginates with meta.total", async () => {
    api.get.mockImplementation(async (url, cfg) => {
      if (url === "/admin/overview") return { data: { data: {} } };
      if (url === "/admin/users") return { data: { data: USERS, meta: { total: 120, page: cfg.params.page, pageSize: 50 } } };
      return { data: { data: [] } };
    });
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText("Alice", { selector: "td" });
    expect(screen.getByText(/120 users · Page 1 of 3/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous" }).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastParams().page).toBe(2));
  });
});
