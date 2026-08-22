import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import JobForm from "./pages/JobForm";
import JobDiscovery from "./pages/JobDiscovery";
import AppliedJobs from "./pages/AppliedJobs";
import Integrations from "./pages/Integrations";
import Profile from "./pages/Profile";
import Analytics from "./pages/Analytics";
import MatchedJobs from "./pages/MatchedJobs";
import EngineApplications from "./pages/EngineApplications";
import Companies from "./pages/Companies";
import Sources from "./pages/Sources";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/add-job"
          element={
            <ProtectedRoute>
              <JobForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/edit-job/:id"
          element={
            <ProtectedRoute>
              <JobForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/job-discovery"
          element={
            <ProtectedRoute>
              <JobDiscovery />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applied-jobs"
          element={
            <ProtectedRoute>
              <AppliedJobs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/integrations"
          element={
            <ProtectedRoute>
              <Integrations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matched-jobs"
          element={
            <ProtectedRoute>
              <MatchedJobs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/engine-applications"
          element={
            <ProtectedRoute>
              <EngineApplications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies"
          element={
            <ProtectedRoute>
              <Companies />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sources"
          element={
            <ProtectedRoute>
              <Sources />
            </ProtectedRoute>
          }
        />

        {/* Backward-compatible redirect: "Applied Jobs" is the new home for
            what used to be reached (informally) via the manual tracker
            itself. No old route pointed here before, but /engine-applications
            (the automated apply-engine's own list) stays live as a
            distinct page — it is NOT the same data as Applied Jobs, see
            appliedJobsService.js. */}
        <Route path="/jobs" element={<Navigate to="/applied-jobs" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
