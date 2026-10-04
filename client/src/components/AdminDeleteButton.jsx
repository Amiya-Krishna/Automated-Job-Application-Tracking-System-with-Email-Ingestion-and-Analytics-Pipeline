import { useState } from "react";
import toast from "react-hot-toast";
import api from "../api";
import { useAuth } from "../context/AuthContext";

// Admin-only delete control for catalog rows (matched jobs, companies, sources).
// Renders nothing for normal users; the server enforces the same rule
// (DELETE /api/admin/* is behind requireAdmin).
//
//   kind   "jobs" | "companies" | "sources"
//   hasJobs  true when deleting needs the explicit "also delete their jobs" opt-in
function AdminDeleteButton({ kind, id, label, hasJobs = false, onDeleted, className = "" }) {
  const { isAdmin } = useAuth(false);
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return null;

  const run = async () => {
    const withJobs = hasJobs && window.confirm(
      `"${label}" still has jobs.\n\nOK = delete it AND its jobs.\nCancel = keep everything.`
    );
    if (hasJobs && !withJobs) return;
    if (!hasJobs && !window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/${kind}/${id}`, { params: withJobs ? { withJobs: "true" } : undefined });
      toast.success("Deleted");
      onDeleted?.(id);
    } catch (err) {
      toast.error(err.response?.data?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      aria-label={`Delete ${label}`}
      className={`inline-flex h-8 items-center justify-center rounded-lg border border-red-200 dark:border-red-900 px-3 text-xs font-semibold text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 ${className}`}
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}

export default AdminDeleteButton;
