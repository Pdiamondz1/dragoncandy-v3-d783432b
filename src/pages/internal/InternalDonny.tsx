import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DonnyMessage } from '@/components/donny/DonnyMessage';
import { DonnyDateDivider } from '@/components/donny/DonnyDateDivider';
import { DonnyTypingIndicator } from '@/components/donny/DonnyTypingIndicator';
import { DonnyAvatar } from '@/components/donny/DonnyAvatar';
import { DonnyChatInput } from '@/components/donny/DonnyChatInput';
import { startsNewDayGroup } from '@/components/donny/donnyTime';
import { DonnyQuickChips } from '@/components/donny/DonnyQuickChips';
import { ExportToDocButton } from '@/components/internal/ExportToDocButton';
import { SaveToKnowledgeButton } from '@/components/internal/SaveToKnowledgeButton';
import { PendingCorrectionsBar } from '@/components/internal/PendingCorrectionsBar';
import { useInternalDonny } from '@/hooks/internal/useInternalDonny';

const STARTER_CHIPS = [
  { label: 'Platform snapshot', message: 'Give me a platform snapshot: users by role, campaigns, and DragonShare activity.' },
  { label: 'Revenue', message: "What's our total revenue and how does the DragonShare 80/20 split break down?" },
  { label: 'AI spend', message: "What's our AI spend this month?" },
  { label: 'Scaling', message: 'How heavy is the platform right now, and when do we need to scale disk or compute?' },
  { label: 'Kill-switches', message: 'Summarize our kill-switch thresholds and where we stand against them.' },
];

const InternalDonny = () => {
  const { messages, sendMessage, retry, isThinking, error, streaming } = useInternalDonny();
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isThinking, streaming?.text]);

  // A finished turn may have filed a correction proposal — refresh the inline
  // approval bar so it shows up without a manual reload.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['aios', 'corrections'] });
  }, [messages.length, queryClient]);

  // The originating question for the answer at index `idx`: the nearest PRIOR
  // user turn. On tool-using turns donny-chat persists `tool` (and tool-call
  // preamble assistant) messages between the user prompt and the final answer,
  // so the adjacent message is usually not the user's — search backward.
  const questionFor = (idx: number): string | undefined => {
    for (let j = idx - 1; j >= 0; j--) {
      if (messages[j].role === 'user') return messages[j].content ?? undefined;
    }
    return undefined;
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-bold text-white lg:text-2xl">INTERNAL DONNY</h1>
      <p className="mt-1 text-sm text-white/60">
        Answers from live platform data and the internal strategy library. Admin-only.
      </p>

      <div className="mt-4 flex flex-col rounded-2xl border border-dc-teal/25 bg-white/[0.04] backdrop-blur-sm">
        <PendingCorrectionsBar />
        <div
          ref={scrollRef}
          className="h-[55vh] space-y-3 overflow-y-auto overscroll-contain px-4 py-4 lg:h-[60vh]"
          role="log"
          aria-label="Internal Donny conversation"
          aria-live="polite"
        >
          {messages.length === 0 && !isThinking && (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-2 text-3xl">🐉</div>
              <p className="text-sm font-semibold text-white">Founders-only Donny</p>
              <p className="mt-1 text-xs text-white/60">
                Ask about platform stats, revenue, AI spend, scaling, or anything in the strategy library.
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={msg.id ?? i}>
              {startsNewDayGroup(messages, i) && <DonnyDateDivider iso={msg.created_at} />}
              <DonnyMessage message={msg} />
              {msg.role === 'assistant' && msg.content && (
                <div className="mt-1 flex justify-start gap-2 pl-2">
                  <ExportToDocButton
                    variant="ghost"
                    title={`Donny — ${new Date(msg.created_at ?? Date.now()).toLocaleDateString()}`}
                    markdown={msg.content}
                  />
                  {/* Save only FINAL answers — a message with tool_calls is a
                      tool-call preamble, not the answer worth saving. */}
                  {!msg.tool_calls?.length && (
                    <SaveToKnowledgeButton markdown={msg.content} question={questionFor(i)} />
                  )}
                </div>
              )}
            </div>
          ))}
          {isThinking && !streaming && <DonnyTypingIndicator />}
          {streaming && (
            <div className="flex gap-2 items-end">
              <DonnyAvatar size="sm" state="thinking" />
              <div className="max-w-[80%]">
                <div className="bg-dc-pink rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                  <p className="text-sm text-dc-text leading-relaxed whitespace-pre-wrap">
                    {streaming.text || ' '}
                  </p>
                </div>
                {streaming.status && (
                  <p className="mt-1 pl-1 text-[10px] text-dc-teal/70">{streaming.status}</p>
                )}
              </div>
            </div>
          )}
          {error && !isThinking && (
            <div className="mx-2 rounded-lg border border-dc-pink-accent/40 bg-dc-pink-accent/10 px-3 py-2">
              <p className="text-xs text-dc-pink">{error}</p>
              <button type="button" onClick={retry} className="mt-1.5 text-xs font-semibold text-dc-teal">
                Try Again
              </button>
            </div>
          )}
        </div>

        {!isThinking && (
          <div className="border-t border-dc-teal/20 px-3 py-1.5">
            <DonnyQuickChips chips={STARTER_CHIPS} onChipTap={sendMessage} />
          </div>
        )}

        <DonnyChatInput onSubmit={sendMessage} disabled={isThinking} />
      </div>
    </div>
  );
};

export default InternalDonny;
