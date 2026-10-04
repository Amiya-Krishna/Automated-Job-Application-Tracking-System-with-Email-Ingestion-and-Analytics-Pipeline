import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const JobForm = lazy(() => import("./pages/JobForm"));
const JobDiscovery = lazy(() => import("./pages/JobDiscovery"));
const AppliedJobs = lazy(() => import("./pages/AppliedJobs"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Profile = lazy(() => import("./pages/Profile"));
const Analytics = lazy(() => import("./pages/Analytics"));
const MatchedJobs = lazy(() => import("./pages/MatchedJobs"));
const EngineApplications = lazy(() => import("./pages/EngineApplications"));
const Companies = lazy(() => import("./pages/Companies"));
const Sources = lazy(() => import("./pages/Sources"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResumeTailoring = lazy(() => import("./pages/ResumeTailoring"));
const ResumeVersions = lazy(() => import("./pages/ResumeVersions"));
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<main className="grid min-h-screen place-items-center" aria-live="polite">Loading…</main>}><Routes>
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
            <AdminRoute>
              <JobDiscovery />
            </AdminRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
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

        <Route
          path="/tailor"
          element={
            <ProtectedRoute>
              <ResumeTailoring />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resumes"
          element={
            <ProtectedRoute>
              <ResumeVersions />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes></Suspense>
    </BrowserRouter>
  );
}

export default App;
