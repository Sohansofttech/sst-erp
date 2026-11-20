"use client";

import React, { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root global error captured:", error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>SST ERP — System Notice</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          backgroundColor: "#EEF2F6",
          color: "#1E293B",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: "440px",
            width: "90%",
            backgroundColor: "#FFFFFF",
            borderRadius: "16px",
            border: "1px solid #E2E8F0",
            padding: "32px 24px",
            textAlign: "center",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              backgroundColor: "#FFFBEB",
              border: "1px solid rgba(245, 160, 0, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              color: "#D97706",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: "20px",
              fontWeight: 800,
              color: "#1E293B",
              margin: "0 0 8px 0",
              letterSpacing: "-0.025em",
            }}
          >
            SST ERP System Notice
          </h1>

          <p
            style={{
              fontSize: "13px",
              color: "#64748B",
              lineHeight: 1.6,
              margin: "0 0 24px 0",
            }}
          >
            We encountered a portal loading state issue. Your data and account remain completely secure.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "10px 18px",
                borderRadius: "10px",
                backgroundColor: "#123B5A",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
            >
              Reload Portal
            </button>

            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.replace("/login");
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "10px 18px",
                borderRadius: "10px",
                backgroundColor: "#FFFFFF",
                color: "#123B5A",
                fontSize: "13px",
                fontWeight: 700,
                border: "1px solid #E2E8F0",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
            >
              Return to Sign In
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
