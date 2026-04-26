import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { supabase } from '@/integrations/supabase/client';
import { uploadProfileAsset } from '@/lib/storage/uploadProfileAsset';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];
type IndustryType = Database['public']['Enums']['industry_type'];

const CREATOR_SKILLS: { value: CreatorSkill; label: string }[] = [
  { value: 'ugc_creation', label: 'UGC' },
  { value: 'video_editing', label: 'Video' },
  { value: 'photography', label: 'Photo' },
  { value: 'graphic_design', label: 'Design' },
  { value: 'copywriting', label: 'Copy' },
  { value: 'social_media_management', label: 'Social' },
  { value: 'animation', label: 'Animation' },
  { value: 'content_strategy', label: 'Strategy' },
  { value: 'influencer_marketing', label: 'Influencer' },
  { value: 'other', label: 'Other' },
];

const INDUSTRIES: { value: IndustryType; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'technology', label: 'Tech' },
  { value: 'travel', label: 'Travel' },
  { value: 'health', label: 'Health' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'education', label: 'Education' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'finance', label: 'Finance' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'other', label: 'Other' },
];

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const autoDetect = useAutoDetect();

  const role = user?.user_metadata?.role as string;
  const isCreator = role === 'content_creator';

  // Creator state
  const [creatorName, setCreatorName] = useState('');
  const [bio, setBio] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<CreatorSkill[]>([]);

  // Business state
  const [businessName, setBusinessName] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryType | ''>('');

  // Shared state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const toggleSkill = (skill: CreatorSkill) => {
    setSelectedSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const isValid = isCreator
    ? creatorName.trim() && bio.trim() && selectedSkills.length > 0
    : businessName.trim() && selectedIndustry;

  const handleSubmit = async () => {
    if (!user || !isValid) return;
    setLoading(true);

    try {
      let avatarUrl: string | null = null;
      if (avatarFile) {
        const result = await uploadProfileAsset({
          file: avatarFile,
          userId: user.id,
          kind: isCreator ? 'avatar' : 'logo',
        });
        avatarUrl = result.path;
      }

      if (isCreator) {
        const { error } = await supabase.from('creator_profiles').upsert({
          user_id: user.id,
          creator_name: creatorName.trim(),
          bio: bio.trim(),
          skills: selectedSkills,
          avatar_url: avatarUrl,
          city: autoDetect.city || null,
          country: autoDetect.country || null,
          timezone: autoDetect.timezone || null,
          is_completed: true,
        });
        if (error) throw error;
        toast.success('Your creator profile is live!');
        navigate('/dashboard/creator');
      } else {
        const { error } = await supabase.from('business_profiles').upsert({
          user_id: user.id,
          business_name: businessName.trim(),
          industry: selectedIndustry as IndustryType,
          logo_url: avatarUrl,
          city: autoDetect.city || null,
          country: autoDetect.country || null,
          timezone: autoDetect.timezone || null,
          is_completed: true,
        });
        if (error) throw error;
        toast.success('Your business profile is live!');
        navigate('/dashboard/business');
      }
    } catch (err) {
      toast.error('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-400 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl p-6 shadow-lg">
          {/* Avatar / Logo upload */}
          <div className="flex flex-col items-center mb-6">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Preview"
                  className={`w-20 h-20 object-cover ${isCreator ? 'rounded-full ring-2 ring-teal-400' : 'rounded-xl ring-2 ring-pink-400'}`}
                />
              ) : (
                <div
                  className={`w-20 h-20 border-[3px] border-dashed flex items-center justify-center text-2xl ${
                    isCreator
                      ? 'rounded-full border-teal-400 text-teal-400'
                      : 'rounded-xl border-pink-400 text-pink-400'
                  }`}
                >
                  +
                </div>
              )}
            </label>
            <p className="text-xs text-gray-400 mt-2">
              {isCreator ? 'Tap to add photo' : 'Add your logo'}
            </p>
          </div>

          {isCreator ? (
            <>
              {/* Creator: Name */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  Your name
                </Label>
                <Input
                  value={creatorName}
                  onChange={e => setCreatorName(e.target.value)}
                  placeholder="Creative name or real name"
                  className="mt-1"
                />
              </div>

              {/* Creator: Skills */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  What do you create?
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CREATOR_SKILLS.map(skill => (
                    <button
                      key={skill.value}
                      type="button"
                      onClick={() => toggleSkill(skill.value)}
                      className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                        selectedSkills.includes(skill.value)
                          ? 'bg-teal-400 text-white'
                          : 'border border-gray-300 text-gray-600 hover:border-teal-400'
                      }`}
                    >
                      {skill.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Creator: Bio */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  One-liner bio
                </Label>
                <Input
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="I create viral food content for restaurants"
                  className="mt-1"
                />
              </div>
            </>
          ) : (
            <>
              {/* Business: Name */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  Business name
                </Label>
                <Input
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="Your company or brand name"
                  className="mt-1"
                />
              </div>

              {/* Business: Industry */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  What's your industry?
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {INDUSTRIES.map(ind => (
                    <button
                      key={ind.value}
                      type="button"
                      onClick={() => setSelectedIndustry(ind.value)}
                      className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                        selectedIndustry === ind.value
                          ? 'bg-pink-400 text-white'
                          : 'border border-gray-300 text-gray-600 hover:border-pink-400'
                      }`}
                    >
                      {ind.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Auto-detected location */}
          {!autoDetect.loading && (autoDetect.city || autoDetect.country) && (
            <div className={`rounded-lg p-3 mb-4 text-xs flex items-center gap-2 ${
              isCreator ? 'bg-teal-50 text-teal-600' : 'bg-pink-50 text-pink-600'
            }`}>
              <MapPin className="w-3 h-3" />
              Auto-detected: {[autoDetect.city, autoDetect.country].filter(Boolean).join(', ')}
              {autoDetect.timezone && ` · ${autoDetect.timezone}`}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className={`w-full rounded-full py-6 text-base font-bold ${
              isCreator
                ? 'bg-teal-400 hover:bg-teal-500 text-white'
                : 'bg-pink-400 hover:bg-pink-500 text-white'
            }`}
          >
            {loading
              ? 'Setting up...'
              : isCreator
                ? 'Go Live'
                : 'Start Finding Creators'}
          </Button>

          <p className="text-center text-xs text-gray-400 mt-3">
            {isCreator
              ? 'You can add rates, portfolio & social links anytime'
              : 'Add description, social links & samples anytime'}
          </p>
        </div>
      </div>
    </div>
  );
}
