import { Component } from "react";
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { const endpoint = import.meta.env.VITE_ERROR_REPORTING_ENDPOINT; if (endpoint && import.meta.env.PROD) fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Web application error", name: error.name }) }).catch(() => {}); }
  render() { if (!this.state.error) return this.props.children; return <main className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-2xl font-bold">Something went wrong</h1><p className="mt-2 text-slate-600">Your data is safe. Reload the page to continue.</p><button className="mt-5 min-h-11 rounded-xl bg-slate-950 px-5 text-white" onClick={() => window.location.reload()}>Reload</button></div></main>; }
}
