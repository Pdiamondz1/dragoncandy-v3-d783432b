import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

export const SKILL_OPTIONS: { value: CreatorSkill; label: string }[] = [
  { value: 'video_editing', label: 'Video Editing' },
  { value: 'photography', label: 'Photography' },
  { value: 'ugc_creation', label: 'UGC Creation' },
  { value: 'social_media_management', label: 'Social Media Management' },
  { value: 'copywriting', label: 'Copywriting' },
  { value: 'graphic_design', label: 'Graphic Design' },
  { value: 'animation', label: 'Animation' },
  { value: 'content_strategy', label: 'Content Strategy' },
  { value: 'influencer_marketing', label: 'Influencer Marketing' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'other', label: 'Other' },
];

const skillLabelMap = new Map(SKILL_OPTIONS.map(s => [s.value, s.label]));

export function formatSkillLabel(skill: string): string {
  return skillLabelMap.get(skill as CreatorSkill) ?? skill.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
