import type { ForecastModel, ForecastScenario } from './forecastModel';

/** The demo headline scenario — the 1,000,000-DAU row of a built forecast (null if absent). */
export function selectDemoScaleScenario(model: ForecastModel): ForecastScenario | null {
  return model.scenarios.find((s) => s.dau === 1_000_000) ?? null;
}
