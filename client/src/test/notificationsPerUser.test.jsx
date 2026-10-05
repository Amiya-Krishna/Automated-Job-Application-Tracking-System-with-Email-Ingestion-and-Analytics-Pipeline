import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";

const auth = { user: { id: 1, role: "user" } };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
const inboxes = { 1: [{ id: 10, kind: "interview", title: "A: interview tomorrow", body: "", read: false, createdAt: new Date().toISOString() }], 2: [] };
const apiGet = vi.fn(async () => ({ data: { data: inboxes[auth.user?.id] || [] } }));
vi.mock("../api", () => ({ default: { get: (...a) => apiGet(...a), post: vi.fn(), delete: vi.fn() } }));

import { NotificationProvider, useNotifications } from "../context/NotificationContext";

function Probe() {
  const { notifications, unreadCount } = useNotifications();
  return <p data-testid="p">{unreadCount}|{notifications.map((n) => n.title).join(",")}</p>;
}
const tree = () => <NotificationProvider><Probe /></NotificationProvider>;

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("notifications are per account (web)", () => {
  it("loads the signed-in user's inbox from the server and drops it when the account changes", async () => {
    auth.user = { id: 1, role: "user" };
    const { rerender } = render(tree());
    await waitFor(() => expect(screen.getByTestId("p").textContent).toBe("1|A: interview tomorrow"));

    // User B signs in on the same browser: A's notifications must disappear at once
    auth.user = { id: 2, role: "user" };
    await act(async () => { rerender(tree()); });
    await waitFor(() => expect(screen.getByTestId("p").textContent).toBe("0|"));
    expect(apiGet).toHaveBeenLastCalledWith("/notifications/inbox");

    // signed out: nothing is shown and nothing is fetched
    apiGet.mockClear();
    auth.user = null;
    await act(async () => { rerender(tree()); });
    expect(screen.getByTestId("p").textContent).toBe("0|");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("wipes the legacy shared localStorage list", async () => {
    window.localStorage.setItem("tracktrail-notifications", JSON.stringify([{ id: "x", title: "someone else's", read: false }]));
    auth.user = { id: 2, role: "user" };
    render(tree());
    await waitFor(() => expect(window.localStorage.getItem("tracktrail-notifications")).toBeNull());
    expect(screen.getByTestId("p").textContent).toBe("0|");
  });
});
