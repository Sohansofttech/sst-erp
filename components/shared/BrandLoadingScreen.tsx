type BrandLoadingScreenProps = {
  message?: string;
  compact?: boolean;
};

export function InlineBrandSpinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="sst-inline-spinner"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function BrandLoadingScreen({
  message = "PLEASE WAIT...",
  compact = false,
}: BrandLoadingScreenProps) {
  return (
    <div
      className={`sst-brand-loading ${compact ? "sst-brand-loading-compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`${message} SOHAN SOFT TECH`}
    >
      <div className="sst-brand-loading-ring" aria-hidden="true">
        <span className="sst-brand-loading-glow" />
        <span className="sst-brand-loading-rotator">
          <span className="sst-brand-loading-arc" />
          <span className="sst-brand-loading-indicator" />
        </span>
        <div className="sst-brand-loading-logo">
          <span className="sst-brand-loading-name">SOHAN</span>
          <span className="sst-brand-loading-name">SOFT TECH</span>
        </div>
      </div>
      <p className="sst-brand-loading-message">{message}</p>
    </div>
  );
}
