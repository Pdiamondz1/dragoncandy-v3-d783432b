import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface CGCPrefs {
  auto_post_enabled: boolean;
  default_platforms: string[];
  default_timing: 'immediate' | 'optimal';
  caption_style: 'ai' | 'template';
  custom_caption_template: string | null;
}

const DEFAULT_PREFS: CGCPrefs = {
  auto_post_enabled: true,
  default_platforms: [],
  default_timing: 'immediate',
  caption_style: 'ai',
  custom_caption_template: null,
};

export function CGCPostingPreferences() {
  const [prefs, setPrefs] = useState<CGCPrefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuth();
  const { data: accounts = [] } = useLocationSocialAccounts(user?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data } = await supabase
        .from('business_profiles')
        .select('cgc_posting_preferences')
        .eq('user_id', authUser.id)
        .single();
      if (data?.cgc_posting_preferences) {
        setPrefs(data.cgc_posting_preferences as CGCPrefs);
      } else {
        setPrefs({ ...DEFAULT_PREFS, default_platforms: accounts.map(a => a.platform) });
      }
      setLoaded(true);
    };
    load();
  }, [accounts]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('business_profiles')
        .update({ cgc_posting_preferences: prefs as unknown as Record<string, unknown> })
        .eq('user_id', authUser.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['cgc-posting-preferences'] });
      toast.success('CGC posting preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setPrefs(prev => ({
      ...prev,
      default_platforms: prev.default_platforms.includes(platform)
        ? prev.default_platforms.filter(p => p !== platform)
        : [...prev.default_platforms, platform],
    }));
  };

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-2xl border border-dc-teal/10 p-6 space-y-5">
      <h3 className="font-bold text-sm text-dc-text">CGC Auto-Post Preferences</h3>

      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-sm text-dc-text">Auto-post on approval</Label>
        <Switch
          checked={prefs.auto_post_enabled}
          onCheckedChange={v => setPrefs(p => ({ ...p, auto_post_enabled: v }))}
        />
      </div>

      {/* Default platforms */}
      {accounts.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
            Default platforms
          </Label>
          <div className="flex flex-wrap gap-2">
            {accounts.map(account => (
              <button
                key={account.id}
                type="button"
                onClick={() => togglePlatform(account.platform)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  prefs.default_platforms.includes(account.platform)
                    ? 'bg-dc-teal text-white'
                    : 'bg-dc-teal/5 text-dc-text-muted'
                }`}
              >
                {account.platform} — @{account.platform_handle}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Default timing */}
      <div>
        <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
          Default timing
        </Label>
        <div className="flex gap-2">
          {(['immediate', 'optimal'] as const).map(timing => (
            <button
              key={timing}
              type="button"
              onClick={() => setPrefs(p => ({ ...p, default_timing: timing }))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                prefs.default_timing === timing
                  ? 'bg-dc-teal text-white'
                  : 'bg-dc-teal/5 text-dc-text-muted'
              }`}
            >
              {timing === 'immediate' ? 'Post immediately' : 'Schedule for optimal time'}
            </button>
          ))}
        </div>
      </div>

      {/* Caption style */}
      <div>
        <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
          Caption style
        </Label>
        <div className="flex gap-2">
          {(['ai', 'template'] as const).map(style => (
            <button
              key={style}
              type="button"
              onClick={() => setPrefs(p => ({ ...p, caption_style: style }))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                prefs.caption_style === style
                  ? 'bg-dc-teal text-white'
                  : 'bg-dc-teal/5 text-dc-text-muted'
              }`}
            >
              {style === 'ai' ? 'AI-generated' : 'Custom template'}
            </button>
          ))}
        </div>
        {prefs.caption_style === 'template' && (
          <Textarea
            value={prefs.custom_caption_template || ''}
            onChange={e => setPrefs(p => ({ ...p, custom_caption_template: e.target.value }))}
            placeholder="Use {{customer_name}}, {{restaurant_name}}, {{discount}} as merge tags"
            className="mt-2 rounded-xl text-sm min-h-[60px]"
          />
        )}
      </div>

      <Button
        onClick={save}
        disabled={saving}
        className="rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white"
      >
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Preferences
      </Button>
    </div>
  );
}
