"use client";

export default function SubscriptionsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="sc-error-page">
      <section className="sc-card" role="alert">
        <h1>Subscription Center could not load</h1>
        <p>The workspace could not be displayed. Retry, or contact an administrator if this continues.</p>
        <button className="sc-button sc-button-primary" onClick={reset} type="button">Retry</button>
      </section>
    </div>
  );
}
