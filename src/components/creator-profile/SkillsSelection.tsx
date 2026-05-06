import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

const skills: { id: CreatorSkill; label: string }[] = [
  { id: 'video_editing', label: 'Video Editing' },
  { id: 'ugc_creation', label: 'UGC Creation' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'photography', label: 'Photography' },
  { id: 'copywriting', label: 'Copywriting' },
  { id: 'social_media_management', label: 'Social Media Management' },
  { id: 'graphic_design', label: 'Graphic Design' },
  { id: 'animation', label: 'Animation' },
  { id: 'influencer_marketing', label: 'Influencer Marketing' },
  { id: 'content_strategy', label: 'Content Strategy' },
  { id: 'other', label: 'Other' }
];

interface SkillsSelectionProps {
  selectedSkills: CreatorSkill[];
  onSkillChange: (skillId: CreatorSkill, checked: boolean) => void;
}

export const SkillsSelection = ({ selectedSkills, onSkillChange }: SkillsSelectionProps) => {
  return (
    <div>
      <Label>Skills & Services *</Label>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
        {skills.map((skill) => (
          <div key={skill.id} className="flex items-center space-x-2">
            <Checkbox
              id={skill.id}
              checked={selectedSkills.includes(skill.id)}
              onCheckedChange={(checked) => onSkillChange(skill.id, checked as boolean)}
            />
            <Label htmlFor={skill.id} className="text-sm">
              {skill.label}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
};
