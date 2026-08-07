import { Navigate } from "react-router-dom";
import { getStoredToken } from "../utils/auth";

// Wraps any route that should only be reachable when logged in.
// Anonymous visitors get redirected straight to /login.
function ProtectedRoute({ children }) {
  const token = getStoredToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
