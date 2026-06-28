// Presentation only — maps a stored tier key to label/emoji/badge classes.
// Brand-adjacent colors, never gray (DESIGN_SYSTEM: "Never use gray badges").
export type DragonTierKey = 'egg' | 'scout' | 'knight' | 'master' | 'legend';

export interface DragonTierMeta {
  key: DragonTierKey;
  label: string;
  emoji: string;
  colorClasses: string;
}

// "Creator standing" ladder — mature labels for an older/professional audience.
// Keys stay (egg/scout/knight/master/legend) so dre_config + the engine are untouched;
// only display labels changed. Emojis intentionally dropped (clean colored pill reads
// more mature than fantasy icons); the field is kept empty for interface stability.
export const DRAGON_TIERS: Record<DragonTierKey, DragonTierMeta> = {
  egg:    { key: 'egg',    label: 'Rising',      emoji: '', colorClasses: 'bg-amber-100 text-amber-700' },
  scout:  { key: 'scout',  label: 'Established', emoji: '', colorClasses: 'bg-emerald-100 text-emerald-700' },
  knight: { key: 'knight', label: 'Pro',        emoji: '', colorClasses: 'bg-sky-100 text-sky-700' },
  master: { key: 'master', label: 'Elite',      emoji: '', colorClasses: 'bg-dc-yellow/25 text-yellow-800' },
  legend: { key: 'legend', label: 'Icon',       emoji: '', colorClasses: 'bg-dc-pink-accent/15 text-dc-pink-accent' },
};

export function getDragonTier(tier: string | null | undefined): DragonTierMeta {
  return DRAGON_TIERS[(tier as DragonTierKey)] ?? DRAGON_TIERS.egg;
}
