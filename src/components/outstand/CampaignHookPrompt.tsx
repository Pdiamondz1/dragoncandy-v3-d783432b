import React, { useState } from 'react';
import { type CampaignSocialHook } from '@/hooks/outstand/useCampaignSocialHooks';
import { Button } from '@/components/ui/button';
import { Send, CalendarDays, Edit3, SkipForward, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface CampaignHookPromptProps {
  hook: CampaignSocialHook;
  onDismiss: (hookId: string) => void;
  onPost: (hookId: string) => void;
  onTriplePost?: () => void;
}

const STAGE_LABELS: Record<number, string> = {
  1: 'Campaign Live',
  2: 'Sponsorship Confirmed',
  3: 'Creator Matched',
  4: 'Content Approved',
  5: 'Campaign Complete',
};

export const CampaignHookPrompt: React.FC<CampaignHookPromptProps> = ({
  hook, onDismiss, onPost, onTriplePost,
}) => {
  const [visible, setVisible] = useState(true);
  const isMobile = useIsMobile();

  if (!visible) return null;

  const stickyClass = isMobile ? 'sticky top-0 z-10' : '';

  if (hook.stage === 4 && onTriplePost) {
    return (
      <div className={`bg-gradient-to-r from-[#4DD9C0]/10 to-[#00E5CC]/10 border-2 border-dc-teal rounded-2xl p-4 mb-4 ${stickyClass}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-dc-teal uppercase tracking-wider">{STAGE_LABELS[4]}</span>
          <button type="button" onClick={() => { setVisible(false); onDismiss(hook.id); }} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-3">{hook.content_template}</p>
        <Button variant="dc-primary" size="sm" className="w-full" onClick={onTriplePost}>
          Post to Your Channels
        </Button>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm ${stickyClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-dc-teal uppercase tracking-wider">{STAGE_LABELS[hook.stage] ?? `Stage ${hook.stage}`}</span>
        <button type="button" onClick={() => { setVisible(false); onDismiss(hook.id); }} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-sm text-gray-700 mb-3">{hook.content_template}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="dc-primary" size="sm" onClick={() => { onPost(hook.id); toast.success('Posted!'); }}>
          <Send className="h-3.5 w-3.5 mr-1" />
          Post Now
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info('Scheduling coming soon')}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Schedule
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info('Edit coming soon')}>
          <Edit3 className="h-3.5 w-3.5 mr-1" />
          Edit First
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setVisible(false); onDismiss(hook.id); }}>
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip
        </Button>
      </div>
    </div>
  );
};
