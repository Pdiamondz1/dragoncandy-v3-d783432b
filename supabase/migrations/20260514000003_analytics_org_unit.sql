ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_org_unit_id
  ON analytics_events(org_unit_id);
