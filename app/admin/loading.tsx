export default function AdminLoading() {
  return (
    <div className="page-content skeleton-page" aria-label="Chargement du module" role="status">
      <div className="skeleton skeleton-kicker" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-copy" />
      <div className="skeleton-cards">{Array.from({ length: 4 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}</div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
