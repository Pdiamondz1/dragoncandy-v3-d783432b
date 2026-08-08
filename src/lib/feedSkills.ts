import { formatSkillLabel } from '@/lib/skillUtils';

/**
 * Skill filtering for the Dragon Feed.
 *
 * `creator_profiles.skills` already rides on every feed item, is already fetched, and is already
 * rendered as chips on creator search rows — it had just never been used as a filter. Using it
 * costs no new storage and no AI: "show me the photographers' work" is answerable today.
 *
 * It is a CREATOR-level attribute, not a per-item one, so every item by a given creator carries
 * the same skills. That is a real limitation (a video editor's stills are still tagged "Video
 * Editing"), and the reason per-item tagging remains on the roadmap — but it is honest, and it is
 * infinitely better than the single image/video dropdown it joins.
 */

export interface SkillFilterable {
  skills?: string[];
}

export interface FeedSkillOption {
  value: string;
  label: string;
  count: number;
}

/**
 * The skills actually present in the loaded feed, most-common first, then alphabetical by label.
 *
 * Derived from the data rather than from the full enum on purpose: a chip that matches nothing is
 * a dead end, and with a small feed most of the enum would be dead ends.
 */
export function availableSkills(items: SkillFilterable[]): FeedSkillOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    // One item can carry several skills; count each once per item.
    for (const skill of new Set(item.skills ?? [])) {
      if (skill) counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, label: formatSkillLabel(value) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Items matching the selected skill. A null selection means "no skill filter". */
export function filterBySkill<T extends SkillFilterable>(items: T[], skill: string | null): T[] {
  if (!skill) return items;
  return items.filter((item) => item.skills?.includes(skill));
}
