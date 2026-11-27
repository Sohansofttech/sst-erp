"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface DestructiveActionDialogProps {
  action: (formData: FormData) => Promise<void>;
  buttonText: string;
  buttonClass?: string;
  buttonStyle?: React.CSSProperties;
  dialogTitle: string;
  dialogDescription: string;
  confirmButtonText?: string;
  confirmInputMatch?: string;
  confirmInputLabel?: string;
  isDestructive?: boolean;
  children?: ReactNode; // Hidden inputs
}

export function DestructiveActionDialog({
  action,
  buttonText,
  buttonClass = "sa-button sa-button-danger",
  buttonStyle,
  dialogTitle,
  dialogDescription,
  confirmButtonText,
  confirmInputMatch,
  confirmInputLabel,
  isDestructive = true,
  children,
}: DestructiveActionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isConfirmationValid = !confirmInputMatch || typedConfirmation.trim().toLowerCase() === confirmInputMatch.trim().toLowerCase();

  const handleOpen = () => {
    setTypedConfirmation("");
    setError(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isPending) return;
    setIsOpen(false);
    setTypedConfirmation("");
    setError(null);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isConfirmationValid || isPending) return;

    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await action(formData);
        setIsOpen(false);
      } catch (err) {
        console.error("Action error:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        style={buttonStyle}
        onClick={handleOpen}
      >
        {buttonText}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="destructive-dialog-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "480px",
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid #f1f5f9",
                backgroundColor: isDestructive ? "#fff1f2" : "#f8fafc",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    backgroundColor: isDestructive ? "#ffe4e6" : "#e0e7ff",
                    color: isDestructive ? "#e11d48" : "#4338ca",
                  }}
                >
                  <AlertTriangle size={18} />
                </div>
                <h3
                  id="destructive-dialog-title"
                  style={{
                    margin: 0,
                    fontSize: "1.125rem",
                    fontWeight: 650,
                    color: isDestructive ? "#9f1239" : "#1e293b",
                  }}
                >
                  {dialogTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#64748b",
                  cursor: isPending ? "not-allowed" : "pointer",
                  padding: "4px",
                  borderRadius: "6px",
                  display: "grid",
                  placeItems: "center",
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form & Body */}
            <form onSubmit={handleSubmit} style={{ padding: "1.5rem" }}>
              {children}

              <p
                style={{
                  margin: "0 0 1rem",
                  fontSize: "0.875rem",
                  lineHeight: 1.5,
                  color: "#475569",
                }}
              >
                {dialogDescription}
              </p>

              {confirmInputMatch && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <label
                    htmlFor="type-confirmation-input"
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "#1e293b",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {confirmInputLabel || `Type "${confirmInputMatch}" to confirm:`}
                  </label>
                  <input
                    id="type-confirmation-input"
                    type="text"
                    value={typedConfirmation}
                    onChange={(e) => setTypedConfirmation(e.target.value)}
                    placeholder={confirmInputMatch}
                    disabled={isPending}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.875rem",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      outline: "none",
                      backgroundColor: "#f8fafc",
                    }}
                  />
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: "0.625rem 0.875rem",
                    marginBottom: "1rem",
                    borderRadius: "6px",
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    fontSize: "0.8125rem",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  marginTop: "1.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="sa-button sa-button-secondary"
                  style={{ minWidth: "80px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isConfirmationValid || isPending}
                  className={isDestructive ? "sa-button sa-button-danger" : "sa-button sa-button-primary"}
                  style={{
                    minWidth: "100px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    opacity: !isConfirmationValid || isPending ? 0.6 : 1,
                    cursor: !isConfirmationValid || isPending ? "not-allowed" : "pointer",
                  }}
                >
                  {isPending && <Loader2 size={14} className="sa-spinner" />}
                  {confirmButtonText || (isDestructive ? "Confirm Action" : "Proceed")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
