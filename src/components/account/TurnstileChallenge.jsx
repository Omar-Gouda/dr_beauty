"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const messages = {
  loading: "Loading security verification...",
  ready: "Complete the security check to continue.",
  success: "Security check complete.",
  expired: "Security check expired. Please complete it again.",
  error: "Security verification could not load. Please try again.",
  unavailable: "Security verification is not configured. Please try again later.",
};

const TurnstileChallenge = forwardRef(function TurnstileChallenge({ onTokenChange }, forwardedRef) {
  const widgetRef = useRef(null);
  const [status, setStatus] = useState(siteKey ? "loading" : "unavailable");
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 420px)");
    const updateSize = () => setCompact(query.matches);
    updateSize();
    query.addEventListener?.("change", updateSize);
    return () => query.removeEventListener?.("change", updateSize);
  }, []);

  const clearToken = useCallback((nextStatus) => {
    onTokenChange("");
    setStatus(nextStatus);
  }, [onTokenChange]);

  const reset = useCallback(() => {
    widgetRef.current?.reset();
    clearToken(siteKey ? "ready" : "unavailable");
  }, [clearToken]);

  useImperativeHandle(forwardedRef, () => ({ reset }), [reset]);

  const handleSuccess = useCallback((token) => {
    if (typeof token !== "string" || !token.trim()) {
      clearToken("error");
      return;
    }
    onTokenChange(token);
    setStatus("success");
  }, [clearToken, onTokenChange]);

  if (!siteKey) {
    return (
      <div className="auth-captcha" aria-live="polite">
        <span className="auth-label">Security check</span>
        <p role="status" className="auth-captcha-status auth-captcha-status-error">{messages.unavailable}</p>
      </div>
    );
  }

  return (
    <div className="auth-captcha" aria-live="polite">
      <span className="auth-label">Security check</span>
      <Turnstile
        key={compact ? "compact" : "normal"}
        ref={widgetRef}
        siteKey={siteKey}
        onWidgetLoad={() => setStatus("ready")}
        onSuccess={handleSuccess}
        onExpire={() => clearToken("expired")}
        onError={() => clearToken("error")}
        onUnsupported={() => clearToken("error")}
        onTimeout={() => clearToken("expired")}
        options={{
          theme: "light",
          size: compact ? "compact" : "normal",
          responseField: false,
          refreshExpired: "auto",
          retry: "auto",
          language: "auto",
        }}
        className="auth-captcha-widget"
      />
      <p
        role="status"
        className={`auth-captcha-status${status === "error" || status === "unavailable" ? " auth-captcha-status-error" : ""}`}
      >
        {messages[status]}
      </p>
    </div>
  );
});

export default TurnstileChallenge;
