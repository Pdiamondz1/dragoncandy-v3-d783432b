/**
 * InternalForecast — the /internal/forecast page. Wires the existing internal hooks into a
 * measured input for the pure forecast model, then renders the scenario table + the
 * admin-editable assumptions panel. Admin-gated at the route (reads admin-only cost sources).
 * Dark ops-deck theme; the model/table/panel are pure — this page only sources + composes.
 */
import { useForecast } from '@/hooks/internal/useForecast';
import { useForecastAssumptions } from '@/hooks/internal/useForecastAssumptions';
import { ForecastTable } from '@/components/internal/ForecastTable';
import { ForecastAssumptionsPanel } from '@/components/internal/ForecastAssumptionsPanel';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { SectionHeading, ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';
import { isDemoScale } from '@/lib/internal/demoScale';

const InternalForecast = () => {
  const { model, isLoading, isError, businessSharePct } = useForecast();
  // Kept separate: the assumptions panel needs the raw editable assumptions, not just the built model.
  // react-query dedupes this against useForecast()'s internal call by query key.
  const assumptionsQuery = useForecastAssumptions();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  // Any core cost/footprint input that ERRORS must surface — forecasting from a silent $0 (AI spend,
  // revenue, opex) or 0 bytes (weight) would understate cost / inflate margin, an honesty-rail violation.
  // (isLoading is fine — those secondary queries fill in; only isError is fatal.) An empty-but-successful
  // weight legitimately degrades to 0s below (only the measured "Today" column is affected).
  if (isError || !model || assumptionsQuery.isError || !assumptionsQuery.data) {
    return <ErrorCard message="Forecast failed to load — check your internal access and try again." />;
  }

  const assumptions = assumptionsQuery.data;

  return (
    <PageContainer size="xl">
      <PageHeader
        title="Scale & cost forecast"
        subtitle="A what-if capacity + unit-economics model — measured where possible, assumptions elsewhere. Not a growth projection."
      />

      <ForecastTable model={model} emphasizeLabel={isDemoScale() ? '1M' : undefined} />

      <SectionHeading>Assumptions</SectionHeading>
      <ForecastAssumptionsPanel
        assumptions={assumptions}
        hints={{ business_share_pct: `current: ${businessSharePct}% of users are businesses` }}
      />

      <p className="mt-4 text-xs text-white/45">
        Today is measured from live platform data; 500K / 750K / 1M are modeled from the assumptions
        above. This is a capacity + unit-economics what-if, not a growth projection.
      </p>
    </PageContainer>
  );
};

export default InternalForecast;
