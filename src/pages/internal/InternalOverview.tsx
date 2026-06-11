const InternalOverview = () => {
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-dc-text mb-1">DragonCandy AIOS</h1>
      <p className="text-dc-text-muted mb-6">
        Internal operating surface — platform stats, KPIs, weight, briefings, and strategy.
      </p>
      <div className="rounded-2xl border border-teal-300 bg-dc-card p-6">
        <h2 className="font-bold text-dc-text mb-1">Platform stats land here next</h2>
        <p className="text-sm text-dc-text-muted">
          Users per role, campaigns, DragonShares, promotions, revenue, AI spend, and
          compute weight arrive with the stats slice (PR 2 of the AIOS build).
        </p>
      </div>
    </div>
  );
};

export default InternalOverview;
