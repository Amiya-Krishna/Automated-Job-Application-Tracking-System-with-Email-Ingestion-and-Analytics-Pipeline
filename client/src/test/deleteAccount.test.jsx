import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = { status: "authenticated", user: { id: 5, role: "user" }, isAdmin: false, endSession: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../components/Navbar", () => ({ default: () => null }));
vi.mock("../api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const { default: api } = await import("../api");
const { default: toast } = await import("react-hot-toast");
const { default: Profile } = await import("../pages/Profile");

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openDialog(user) {
  await user.click(await screen.findByRole("button", { name: "Delete account" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { data: { full_name: "A", email: "a@x.co", skills: [] } } });
});
afterEach(() => cleanup());

describe("delete account (web)", () => {
  it("shows a danger zone describing what is removed", async () => {
    renderProfile();
    expect(await screen.findByText("Danger zone")).toBeTruthy();
    expect(screen.getByText(/permanent and cannot be undone/i)).toBeTruthy();
    expect(screen.getByText(/not affected/i)).toBeTruthy();
  });

  it("opens an accessible dialog and keeps confirm disabled until DELETE and a password are given", async () => {
    const user = userEvent.setup();
    renderProfile();
    const dialog = await openDialog(user);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const confirm = within(dialog).getByRole("button", { name: /delete my account/i });
    expect(confirm.disabled).toBe(true);

    await user.type(within(dialog).getByLabelText(/type delete/i), "delete");
    await user.type(within(dialog).getByLabelText(/your password/i), "secret12");
    expect(confirm.disabled).toBe(true); // case-sensitive

    await user.clear(within(dialog).getByLabelText(/type delete/i));
    await user.type(within(dialog).getByLabelText(/type delete/i), "DELETE");
    expect(confirm.disabled).toBe(false);

    await user.clear(within(dialog).getByLabelText(/your password/i));
    expect(confirm.disabled).toBe(true);
  });

  it("Escape closes the dialog", async () => {
    const user = userEvent.setup();
    renderProfile();
    await openDialog(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("success deletes the account, ends the session and goes to login", async () => {
    api.delete.mockResolvedValue({ data: { message: "Account deleted" } });
    const user = userEvent.setup();
    renderProfile();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(/type delete/i), "DELETE");
    await user.type(within(dialog).getByLabelText(/your password/i), "secret12");
    await user.click(within(dialog).getByRole("button", { name: /delete my account/i }));

    await waitFor(() => expect(screen.getByText("login page")).toBeTruthy());
    expect(api.delete).toHaveBeenCalledWith("/auth/account", { data: { password: "secret12" }, _skipAuthRefresh: true });
    expect(auth.endSession).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Your account has been deleted.");
  });

  it("wrong password shows the error inline and keeps the session", async () => {
    api.delete.mockRejectedValue({ response: { status: 400, data: { message: "Password is incorrect" } } });
    const user = userEvent.setup();
    renderProfile();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(/type delete/i), "DELETE");
    await user.type(within(dialog).getByLabelText(/your password/i), "nope");
    await user.click(within(dialog).getByRole("button", { name: /delete my account/i }));

    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/password is incorrect/i);
    expect(auth.endSession).not.toHaveBeenCalled();
    expect(screen.queryByText("login page")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows the last-administrator message from a 409", async () => {
    api.delete.mockRejectedValue({ response: { status: 409, data: { code: "last_admin", message: "You are the last administrator." } } });
    const user = userEvent.setup();
    renderProfile();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(/type delete/i), "DELETE");
    await user.type(within(dialog).getByLabelText(/your password/i), "secret12");
    await user.click(within(dialog).getByRole("button", { name: /delete my account/i }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/last administrator/i);
  });
});
