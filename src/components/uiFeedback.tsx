"use client";

// Feedback layer: toasts (save / issue confirmations, errors) and modal
// confirm / prompt dialogs — replacing window.alert / confirm / prompt so
// every interaction gets the same clean, animated response.

import Link from "next/link";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

// --------------------------------------------------------------- toasts

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  leaving?: boolean;
}

interface ToastApi {
  show: (t: Omit<ToastItem, "id">) => void;
  success: (title: string, detail?: string, action?: ToastItem["action"]) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string, action?: ToastItem["action"]) => void;
}

const ToastCtx = createContext<ToastApi>({
  show: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
});

export function useToast(): ToastApi {
  return useContext(ToastCtx);
}

function ToastHost({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2">
      {items.map((t) => {
        const Icon = t.kind === "success" ? CircleCheck : t.kind === "error" ? CircleAlert : Info;
        const color = t.kind === "success" ? "var(--good)" : t.kind === "error" ? "var(--poor)" : "var(--damp)";
        return (
          <div
            key={t.id}
            role="status"
            className={`toast pointer-events-auto ${t.leaving ? "opacity-0 translate-x-3" : "slide-in-right"}`}
            style={{ transition: "opacity 200ms ease, transform 200ms ease", borderLeft: `3px solid ${color}` }}
          >
            <Icon size={18} className={t.kind === "success" ? "pop" : ""} style={{ color }} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t.title}</div>
              {t.detail && <div className="mt-0.5 text-xs text-dim">{t.detail}</div>}
              {t.action &&
                (t.action.href ? (
                  <Link href={t.action.href} className="link mt-1 inline-block text-xs font-semibold" onClick={() => dismiss(t.id)}>
                    {t.action.label} →
                  </Link>
                ) : (
                  <button
                    className="link mt-1 text-xs font-semibold"
                    onClick={() => {
                      t.action?.onClick?.();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label} →
                  </button>
                ))}
            </div>
            <button className="btn-ghost rounded-md p-0.5 text-faint hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------- dialogs

interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOpts extends ConfirmOpts {
  label?: string;
  placeholder?: string;
  initial?: string;
  required?: boolean;
}

interface DialogApi {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
}

const DialogCtx = createContext<DialogApi>({
  confirm: async () => false,
  prompt: async () => null,
});

export function useDialog(): DialogApi {
  return useContext(DialogCtx);
}

type Pending =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void };

function DialogHost({ pending, close }: { pending: Pending | null; close: () => void }) {
  const [value, setValue] = useState(pending?.kind === "prompt" ? (pending.opts.initial ?? "") : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
      if (e.key === "Enter" && pending.kind === "confirm") {
        e.preventDefault();
        ok();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, value]);

  if (!pending) return null;

  function cancel() {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(false);
    else pending.resolve(null);
    close();
  }
  function ok() {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(true);
    else {
      if (pending.opts.required && !value.trim()) {
        inputRef.current?.focus();
        return;
      }
      pending.resolve(value.trim());
    }
    close();
  }

  const o = pending.opts;
  return (
    <div className="backdrop flex items-center justify-center p-4" onMouseDown={cancel}>
      <div
        role="dialog"
        aria-modal
        className="card scale-in w-full max-w-md p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">{o.title}</h2>
        {o.body && <div className="mt-1.5 text-sm text-dim">{o.body}</div>}
        {pending.kind === "prompt" && (
          <label className="mt-4 block">
            {pending.opts.label && <span className="lbl">{pending.opts.label}</span>}
            <input
              ref={inputRef}
              autoFocus
              className="input"
              value={value}
              placeholder={pending.opts.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ok()}
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={cancel}>
            {o.cancelLabel ?? "Cancel"}
          </button>
          <button className={`btn ${o.danger ? "btn-danger" : "btn-primary"}`} onClick={ok} autoFocus={pending.kind === "confirm"}>
            {o.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- provider

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dialogSeq, setDialogSeq] = useState(0);
  const seq = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 220);
  }, []);

  const show = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = seq.current++;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.kind === "error" ? 7000 : 4200);
    },
    [dismiss]
  );

  const toastApi = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, detail, action) => show({ kind: "success", title, detail, action }),
      error: (title, detail) => show({ kind: "error", title, detail }),
      info: (title, detail, action) => show({ kind: "info", title, detail, action }),
    }),
    [show]
  );

  const dialogApi = useMemo<DialogApi>(
    () => ({
      confirm: (opts) =>
        new Promise<boolean>((resolve) => {
          setDialogSeq((n) => n + 1);
          setPending({ kind: "confirm", opts, resolve });
        }),
      prompt: (opts) =>
        new Promise<string | null>((resolve) => {
          setDialogSeq((n) => n + 1);
          setPending({ kind: "prompt", opts, resolve });
        }),
    }),
    []
  );

  return (
    <ToastCtx.Provider value={toastApi}>
      <DialogCtx.Provider value={dialogApi}>
        {children}
        <ToastHost items={toasts} dismiss={dismiss} />
        <DialogHost key={dialogSeq} pending={pending} close={() => setPending(null)} />
      </DialogCtx.Provider>
    </ToastCtx.Provider>
  );
}
