import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Accessible modal confirmation dialog: role="dialog" + aria-modal, focus moves in on open,
// Tab is trapped, Escape / backdrop click cancel (not while busy) and focus returns to the
// element that opened it. `children` is the body (extra inputs go there); `error` is shown inline.
function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  confirmDisabled = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const errorId = useId();
  const busyRef = useRef(busy);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    busyRef.current = busy;
    cancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector("[data-autofocus]") || panel?.querySelector(FOCUSABLE);
    first?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!busyRef.current) cancelRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || !panel.contains(document.activeElement))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (document.activeElement === lastEl || !panel.contains(document.activeElement))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "tt-btn tt-btn--danger"
      : "tt-btn tt-btn--primary";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && !confirmDisabled) onConfirm?.();
          }}
        >
          <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">{children}</div>
          {error && (
            <p id={errorId} role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" className="tt-btn border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
            <button type="submit" className={confirmClass} disabled={busy || confirmDisabled} aria-busy={busy || undefined}>
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmDialog;
