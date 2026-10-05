import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Admin-only route guard. This is a UX layer only: every /api/admin/* and
// /api/scrape/* endpoint re-checks the role server-side (requireAdmin), so
// bypassing this component exposes no data. Non-admins are sent to the
// dashboard rather than shown a "forbidden" page, so admin pages are not
// advertised to them.
function AdminRoute({ children }) {
  const { status, isAdmin } = useAuth();

  if (status === "loading") return <main className="grid min-h-screen place-items-center" aria-live="polite">Restoring your session…</main>;
  if (status !== "authenticated") return <Navigate to="/login/admin" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return children;
}

export default AdminRoute;
