import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Wraps any route that should only be reachable when logged in.
// Anonymous visitors get redirected straight to /login.
function ProtectedRoute({ children }) {
  const { status } = useAuth();

  if (status === "loading") return <main className="grid min-h-screen place-items-center" aria-live="polite">Restoring your session…</main>;
  if (status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
