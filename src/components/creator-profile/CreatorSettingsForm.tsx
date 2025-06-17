
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Upload } from 'lucide-react';
import { SkillsSelection } from './SkillsSelection';
import type { CreatorProfileFormData } from '@/hooks/useCreatorProfileForm';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

interface CreatorSettingsFormProps {
  formData: CreatorProfileFormData;
  selectedSkills: CreatorSkill[];
  avatarFile: File | null;
  loading: boolean;
  onInputChange: (field: string, value: string) => void;
  onSkillChange: (skillId: CreatorSkill, checked: boolean) => void;
  onAvatarFileChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const CreatorSettingsForm = ({
  formData,
  selectedSkills,
  avatarFile,
  loading,
  onInputChange,
  onSkillChange,
  onAvatarFileChange,
  onSubmit
}: CreatorSettingsFormProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Creator Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          {/* Creator Name */}
          <div>
            <Label htmlFor="creator_name">Creator Name *</Label>
            <Input
              id="creator_name"
              value={formData.creator_name}
              onChange={(e) => onInputChange('creator_name', e.target.value)}
              placeholder="Your Creator Name"
              required
            />
          </div>

          {/* Avatar Upload */}
          <div>
            <Label>Profile Picture</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="text-sm text-gray-600 mb-2">
                {avatarFile ? avatarFile.name : 'Click to upload your profile picture'}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onAvatarFileChange(e.target.files?.[0] || null)}
                className="hidden"
                id="avatar-upload"
              />
              <Button type="button" variant="outline" asChild>
                <label htmlFor="avatar-upload" className="cursor-pointer">
                  Choose File
                </label>
              </Button>
            </div>
          </div>

          {/* Bio */}
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => onInputChange('bio', e.target.value)}
              placeholder="Tell us about yourself..."
              rows={4}
            />
          </div>

          {/* Skills */}
          <SkillsSelection 
            selectedSkills={selectedSkills}
            onSkillChange={onSkillChange}
          />

          {/* Location & Rate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => onInputChange('location', e.target.value)}
                placeholder="City, Country"
              />
            </div>
            <div>
              <Label htmlFor="base_rate_per_hour">Hourly Rate ($)</Label>
              <Input
                id="base_rate_per_hour"
                type="number"
                value={formData.base_rate_per_hour}
                onChange={(e) => onInputChange('base_rate_per_hour', e.target.value)}
                placeholder="50"
              />
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="bg-pink-600 hover:bg-pink-700"
            disabled={loading}
          >
            {loading ? 'Updating...' : 'Update Profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
