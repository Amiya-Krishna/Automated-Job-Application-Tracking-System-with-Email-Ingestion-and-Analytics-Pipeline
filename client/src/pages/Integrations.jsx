import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";
import { parseJobEmail } from "../utils/emailParser";

function Integrations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [connected, setConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    const status = searchParams.get("gmail");

    if (status === "connected") {
      toast.success("Gmail connected");
    } else if (status === "no_refresh_token") {
      toast.error(
        "Google didn't return a fresh permission grant. Remove TrackTrail's access at myaccount.google.com/permissions and try connecting again."
      );
    } else if (status === "error") {
      toast.error("Couldn't connect Gmail. Please try again.");
    }

    if (status) {
      searchParams.delete("gmail");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await api.get("/gmail/status");
        setConnected(res.data.connected);
      } catch (err) {
        console.error(err);
      } finally {
        setIsChecking(false);
      }
    };

    checkStatus();
  }, []);

  const connectGmail = async () => {
    try {
      const res = await api.get("/gmail/auth-url");
      window.location.href = res.data.url;
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          "Gmail integration isn't configured on the backend yet"
      );
    }
  };

  const disconnectGmail = async () => {
    try {
      await api.post("/gmail/disconnect");
      setConnected(false);
      setResults(null);
      toast.success("Gmail disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const scanInbox = async () => {
    try {
      setIsScanning(true);
      const res = await api.get("/gmail/scan");

      const parsed = res.data.messages.map((msg) => ({
        ...msg,
        parsed: parseJobEmail(`${msg.subject}\n${msg.snippet}`),
      }));

      setResults(parsed);

      if (parsed.length === 0) {
        toast("No matching emails found in the last 30 days", { icon: "📭" });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Scan failed");
    } finally {
      setIsScanning(false);
    }
  };

  const addToPipeline = async (item) => {
    try {
      setSavingId(item.id);
      // BUG FIX (integration audit): this call went straight to
      // POST /api/jobs without ever setting sourceName, so every job
      // added from a Gmail scan was silently misattributed as "manual"
      // in the Applied Jobs / Sources views (the /api/gmail/import route
      // this app also has was never actually reached by the web client —
      // only the browser extension's dashboard uses it). Tagging
      // sourceName: "gmail" and the Gmail message id as externalJobId
      // here fixes the attribution and lets the same dedup-by-
      // externalJobId logic in POST /api/jobs work for repeat imports.
      await api.post("/jobs", {
        company: item.parsed.company || "Unknown company",
        role: item.parsed.role || "Unknown role",
        status: item.parsed.status,
        interviewDate: item.parsed.interviewDate,
        notes: `From email: "${item.subject}"`,
        sourceName: "gmail",
        externalJobId: item.id || null,
      });
      toast.success("Added to your pipeline");
      setResults((prev) => prev.filter((r) => r.id !== item.id));
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate("/dashboard")}
          className="mb-6 text-sm font-semibold text-slate-500 dark:text-slate-400 transition hover:text-slate-800"
        >
          ← Back to dashboard
        </button>

        <span className="inline-flex rounded-full bg-cyan-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800">
          Integrations
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Connect Gmail
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
          Scan your inbox for interview invites, offers, and rejections, and
          add them to your pipeline in one click. TrackTrail only requests
          read-only access and never stores your email content.
        </p>

        <div className="mt-8 rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8">
          {isChecking ? (
            <div className="h-10 w-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ) : connected ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Gmail connected
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={scanInbox}
                  disabled={isScanning}
                  className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {isScanning ? "Scanning..." : "Scan inbox"}
                </button>
                <button
                  onClick={disconnectGmail}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-slate-300"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Not connected yet. You'll be asked to sign in with Google and
                approve read-only inbox access.
              </p>
              <button
                onClick={connectGmail}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Connect Gmail
              </button>
            </div>
          )}
        </div>

        {results && results.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Found {results.length} matching email{results.length === 1 ? "" : "s"}
            </h2>

            {results.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.subject || "(no subject)"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {item.from}
                    </p>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      Detected:{" "}
                      <span className="font-semibold">
                        {item.parsed.company || "—"}
                      </span>{" "}
                      · {item.parsed.role || "—"} ·{" "}
                      <span className="font-semibold">{item.parsed.status}</span>
                      {item.parsed.interviewDate && ` · ${item.parsed.interviewDate}`}
                    </p>
                  </div>

                  <button
                    onClick={() => addToPipeline(item)}
                    disabled={savingId === item.id}
                    className="shrink-0 rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingId === item.id ? "Adding..." : "Add to pipeline"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Integrations;
