
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface CreatorSocialMediaLinksProps {
  formData: {
    instagram_url: string;
    tiktok_url: string;
    youtube_url: string;
    facebook_url: string;
    linkedin_url: string;
    x_url: string;
    other_social_url: string;
    website_url: string;
  };
  onInputChange: (field: string, value: string) => void;
}

export const CreatorSocialMediaLinks = ({ formData, onInputChange }: CreatorSocialMediaLinksProps) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Social Media & Website</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="instagram_url">Instagram</Label>
          <Input
            id="instagram_url"
            value={formData.instagram_url}
            onChange={(e) => onInputChange('instagram_url', e.target.value)}
            placeholder="https://instagram.com/yourcreator"
          />
        </div>
        <div>
          <Label htmlFor="tiktok_url">TikTok</Label>
          <Input
            id="tiktok_url"
            value={formData.tiktok_url}
            onChange={(e) => onInputChange('tiktok_url', e.target.value)}
            placeholder="https://tiktok.com/@yourcreator"
          />
        </div>
        <div>
          <Label htmlFor="youtube_url">YouTube</Label>
          <Input
            id="youtube_url"
            value={formData.youtube_url}
            onChange={(e) => onInputChange('youtube_url', e.target.value)}
            placeholder="https://youtube.com/c/yourcreator"
          />
        </div>
        <div>
          <Label htmlFor="facebook_url">Facebook</Label>
          <Input
            id="facebook_url"
            value={formData.facebook_url}
            onChange={(e) => onInputChange('facebook_url', e.target.value)}
            placeholder="https://facebook.com/yourcreator"
          />
        </div>
        <div>
          <Label htmlFor="linkedin_url">LinkedIn</Label>
          <Input
            id="linkedin_url"
            value={formData.linkedin_url}
            onChange={(e) => onInputChange('linkedin_url', e.target.value)}
            placeholder="https://linkedin.com/in/yourcreator"
          />
        </div>
        <div>
          <Label htmlFor="x_url">X (Twitter)</Label>
          <Input
            id="x_url"
            value={formData.x_url}
            onChange={(e) => onInputChange('x_url', e.target.value)}
            placeholder="https://x.com/yourcreator"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="website_url">Website</Label>
          <Input
            id="website_url"
            value={formData.website_url}
            onChange={(e) => onInputChange('website_url', e.target.value)}
            placeholder="https://yourwebsite.com"
          />
        </div>
        <div>
          <Label htmlFor="other_social_url">Other Social Media</Label>
          <Input
            id="other_social_url"
            value={formData.other_social_url}
            onChange={(e) => onInputChange('other_social_url', e.target.value)}
            placeholder="Any other social media link"
          />
        </div>
      </div>
    </div>
  );
};
