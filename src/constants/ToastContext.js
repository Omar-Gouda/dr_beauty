"use client";

import { createContext, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(24rem,calc(100vw-3rem))] sm:max-w-sm">
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex min-w-0 items-start justify-between gap-3 rounded-2xl border p-3 text-xs font-semibold shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-300 sm:items-center sm:p-4 ${
                isSuccess
                  ? "bg-[var(--color-surface)] border-[var(--color-success)]/40 text-[var(--color-text)]"
                  : "bg-[var(--color-surface)] border-red-500/40 text-[var(--color-text)]"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
                {isSuccess ? (
                  <CheckCircle2 className="h-5 w-5 text-[var(--color-success)] shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                )}
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                type="button"
                aria-label="Dismiss notification"
                className="shrink-0 rounded-full p-1 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
