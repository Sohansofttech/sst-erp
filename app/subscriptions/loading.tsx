export default function SubscriptionsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Subscription Center" className="sc-shell">
      <main className="sc-content">
        <div className="sc-preview-notice">Opening your subscription workspace…</div>
        <div className="sc-page">
          <div className="sc-card sc-loading-card"><span /><span /><span /></div>
          <div className="sc-stat-grid">{Array.from({ length: 4 }, (_, index) => <div className="sc-card sc-loading-stat" key={index} />)}</div>
          <div className="sc-two-column"><div className="sc-card sc-loading-panel" /><div className="sc-card sc-loading-panel" /></div>
        </div>
      </main>
    </div>
  );
}
