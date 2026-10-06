import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "../api";
import ConfirmDialog from "./ConfirmDialog";

const PAGE_SIZE = 50;
const card = "rounded-[24px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm";
const field = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

function StatusBadge({ status }) {
  const blocked = status === "BLOCKED";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${blocked ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"}`}
    >
      <span aria-hidden="true">{blocked ? "⛔" : "●"}</span>
      {blocked ? "Blocked" : "Active"}
    </span>
  );
}

// Admin "User management": server-side search/filter/pagination plus block / unblock / delete.
// Admin-role rows and the signed-in admin's own row never offer block or delete.
function UserManagement({ currentUserId, onChanged }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null); // { type: "block" | "delete", user }
  const [dialogError, setDialogError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const params = { page, pageSize: PAGE_SIZE };
    if (q) params.q = q;
    if (status) params.status = status;
    api
      .get("/admin/users", { params })
      .then((res) => {
        if (id !== reqId.current) return;
        const total = res.data?.meta?.total ?? 0;
        const size = res.data?.meta?.pageSize || PAGE_SIZE;
        // The last row of the last page was removed: step back one page.
        if (page > 1 && (res.data?.data || []).length === 0 && total > 0) {
          setPage(Math.max(1, Math.ceil(total / size)));
          return;
        }
        setRows(res.data?.data || []);
        setMeta({ total, page: res.data?.meta?.page || page, pageSize: size });
        setLoadError("");
      })
      .catch((err) => {
        if (id !== reqId.current) return;
        setLoadError(err.response?.data?.message || "Failed to load users");
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [q, status, page, reloadKey]);

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1);
    onChanged?.();
  }, [onChanged]);

  const changeRole = async (target) => {
    const role = target.role === "admin" ? "user" : "admin";
    setBusyId(target.id);
    try {
      const res = await api.patch(`/admin/users/${target.id}/role`, { role });
      setRows((prev) => prev.map((x) => (x.id === target.id ? { ...x, role: res.data?.data?.role || role } : x)));
      toast.success(`${target.email} is now ${role}`);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not change role");
    } finally {
      setBusyId(null);
    }
  };

  const unblock = async (target) => {
    setBusyId(target.id);
    try {
      const res = await api.post(`/admin/users/${target.id}/unblock`);
      toast.success(res.data?.message || "User unblocked");
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not unblock user");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDialog = async () => {
    const { type, user: target } = dialog;
    setBusyId(target.id);
    setDialogError("");
    try {
      const res =
        type === "block"
          ? await api.post(`/admin/users/${target.id}/block`)
          : await api.delete(`/admin/users/${target.id}`);
      toast.success(res.data?.message || (type === "block" ? "User blocked" : "User deleted"));
      setDialog(null);
      refresh();
    } catch (err) {
      setDialogError(err.response?.data?.message || (type === "block" ? "Could not block user" : "Could not delete user"));
    } finally {
      setBusyId(null);
    }
  };

  const openDialog = (type, target) => {
    setDialogError("");
    setDialog({ type, user: target });
  };
  const closeDialog = () => {
    if (busyId !== null) return;
    setDialog(null);
    setDialogError("");
  };

  const pageCount = Math.max(1, Math.ceil((meta.total || 0) / (meta.pageSize || PAGE_SIZE)));
  const label = (u) => u.name || u.email;

  return (
    <section className={`${card} mt-6`} aria-labelledby="user-mgmt-title">
      <h2 id="user-mgmt-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">User management</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Search accounts, block or unblock access, or permanently delete a user. Administrators must be demoted before they can be blocked or deleted.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="user-search" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Search users</label>
          <input
            id="user-search"
            type="search"
            className={`${field} w-full`}
            placeholder="Name or email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="user-status" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Status</label>
          <select
            id="user-status"
            className={field}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {loadError}{" "}
          <button type="button" className="font-semibold underline" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </p>
      )}

      <div className="mt-4 overflow-x-auto" aria-busy={loading}>
        <table className="w-full min-w-[56rem] text-left text-sm">
          <caption className="sr-only">Users</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th scope="col" className="py-2 pr-3 font-semibold">Name</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Email</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Role</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Status</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Created</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Tracked jobs</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Last active</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Gmail</th>
              <th scope="col" className="py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((u) => {
              const isSelf = u.id === currentUserId;
              const isAdminRow = u.role === "admin";
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className={u.status === "BLOCKED" ? "bg-amber-50/50 dark:bg-amber-950/10" : undefined}>
                  <td className="max-w-[10rem] truncate py-3 pr-3 font-semibold text-slate-900 dark:text-slate-100">{u.name || "—"}</td>
                  <td className="max-w-[14rem] truncate py-3 pr-3 text-slate-600 dark:text-slate-300">{u.email}</td>
                  <td className="py-3 pr-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isAdminRow ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>{u.role}</span>
                  </td>
                  <td className="py-3 pr-3"><StatusBadge status={u.status} /></td>
                  <td className="py-3 pr-3 text-slate-600 dark:text-slate-300">{fmtDate(u.createdAt)}</td>
                  <td className="py-3 pr-3 text-slate-600 dark:text-slate-300">{u.trackedJobs ?? 0}</td>
                  <td className="py-3 pr-3 text-slate-600 dark:text-slate-300">{fmtDate(u.lastActiveAt)}</td>
                  <td className="py-3 pr-3 text-slate-600 dark:text-slate-300">{u.gmailConnected ? "Connected" : "Not connected"}</td>
                  <td className="py-3">
                    <div className="tt-actions flex items-center gap-2">
                      {isSelf ? (
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">You</span>
                      ) : (
                        <>
                          {isAdminRow ? (
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Administrator</span>
                          ) : u.status === "BLOCKED" ? (
                            <button type="button" className="tt-btn tt-btn--primary" disabled={busy} aria-label={`Unblock ${label(u)}`} onClick={() => unblock(u)}>
                              {busy ? "Working…" : "Unblock"}
                            </button>
                          ) : (
                            <button type="button" className="tt-btn tt-btn--danger" disabled={busy} aria-label={`Block ${label(u)}`} onClick={() => openDialog("block", u)}>
                              Block
                            </button>
                          )}
                          {!isAdminRow && (
                            <button type="button" className="tt-btn tt-btn--danger" disabled={busy} aria-label={`Delete ${label(u)}`} onClick={() => openDialog("delete", u)}>
                              Delete
                            </button>
                          )}
                          <button type="button" className="tt-btn tt-btn--primary" disabled={busy} aria-label={`${isAdminRow ? "Make user" : "Make admin"}: ${label(u)}`} onClick={() => changeRole(u)}>
                            {isAdminRow ? "Make user" : "Make admin"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && !loadError && (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No users match your filters.</p>
        )}
        {loading && rows.length === 0 && <div className="mt-2 h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />}
      </div>

      <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300" aria-label="User pagination">
        <span aria-live="polite">{meta.total} {meta.total === 1 ? "user" : "users"} · Page {meta.page} of {pageCount}</span>
        <div className="flex gap-2">
          <button type="button" className="tt-btn tt-btn--primary" disabled={loading || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <button type="button" className="tt-btn tt-btn--primary" disabled={loading || page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </nav>

      <ConfirmDialog
        open={dialog?.type === "block"}
        title={`Block ${dialog ? label(dialog.user) : ""}?`}
        confirmLabel={busyId !== null ? "Blocking…" : "Block user"}
        busy={busyId !== null}
        error={dialogError}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        <p>
          <strong>{dialog?.user.email}</strong> will be signed out and will not be able to sign in or use the app while blocked.
        </p>
        <p>Their data is kept, and you can unblock them at any time.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.type === "delete"}
        title={`Delete ${dialog ? label(dialog.user) : ""}?`}
        confirmLabel={busyId !== null ? "Deleting…" : "Delete permanently"}
        busy={busyId !== null}
        error={dialogError}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        <p>
          This permanently deletes <strong>{dialog?.user.email}</strong> and everything they own: applications, Gmail and extension jobs, notifications, resumes and profile. This cannot be undone.
        </p>
        <p>Shared jobs and companies fetched by administrators are preserved.</p>
      </ConfirmDialog>
    </section>
  );
}

export default UserManagement;
