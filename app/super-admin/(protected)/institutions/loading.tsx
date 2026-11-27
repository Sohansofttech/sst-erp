export default function InstitutionsLoading() {
  return (
    <div className="sa-module-page" role="status" aria-label="Loading institutions">
      <div className="sa-page-intro">
        <div>
          <h2>Institution Management</h2>
          <p>Loading institutions…</p>
        </div>
      </div>
      <section className="sa-card sa-module-panel">
        <p className="sa-muted-copy">Loading institution records and subscription counts…</p>
      </section>
    </div>
  );
}
