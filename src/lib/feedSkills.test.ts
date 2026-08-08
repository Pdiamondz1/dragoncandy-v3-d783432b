import { describe, it, expect } from 'vitest';
import { availableSkills, filterBySkill } from './feedSkills';

const item = (...skills: string[]) => ({ skills });

describe('availableSkills', () => {
  it('returns only skills actually present in the feed', () => {
    // A chip matching nothing is a dead end, so the full enum is deliberately NOT used.
    const options = availableSkills([item('photography'), item('photography', 'video_editing')]);
    expect(options.map((o) => o.value)).toEqual(['photography', 'video_editing']);
  });

  it('counts items per skill, most common first', () => {
    const options = availableSkills([
      item('photography'),
      item('photography'),
      item('video_editing'),
    ]);
    expect(options[0]).toMatchObject({ value: 'photography', count: 2 });
    expect(options[1]).toMatchObject({ value: 'video_editing', count: 1 });
  });

  it('counts a duplicated skill on one item only once', () => {
    expect(availableSkills([item('photography', 'photography')])[0].count).toBe(1);
  });

  it('breaks count ties alphabetically by label, for a stable chip order', () => {
    const options = availableSkills([item('video_editing'), item('animation')]);
    expect(options.map((o) => o.label)).toEqual(['Animation', 'Video Editing']);
  });

  it('uses human labels, including for legacy values', () => {
    const options = availableSkills([item('social_media_management'), item('ugc_creation')]);
    const byValue = Object.fromEntries(options.map((o) => [o.value, o.label]));
    expect(byValue.social_media_management).toBe('Social Media Management');
    expect(byValue.ugc_creation).toBe('UGC Creation');
  });

  it('ignores items with no skills', () => {
    expect(availableSkills([{}, { skills: undefined }, { skills: [] }])).toEqual([]);
  });
});

describe('filterBySkill', () => {
  const items = [item('photography'), item('video_editing'), item('photography', 'animation')];

  it('returns everything when no skill is selected', () => {
    expect(filterBySkill(items, null)).toHaveLength(3);
  });

  it('keeps items carrying the selected skill', () => {
    expect(filterBySkill(items, 'photography')).toHaveLength(2);
    expect(filterBySkill(items, 'animation')).toHaveLength(1);
  });

  it('returns nothing for a skill no item has', () => {
    expect(filterBySkill(items, 'copywriting')).toEqual([]);
  });

  it('does not throw on items with no skills', () => {
    expect(filterBySkill([{}], 'photography')).toEqual([]);
  });
});
