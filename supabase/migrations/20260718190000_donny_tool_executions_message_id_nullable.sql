-- donny-orchestrator logs MCP/social tool calls but never holds a donny_messages id
-- (the assistant message is persisted client-side in useDonny), so a NOT NULL message_id
-- made that audit insert impossible. Relaxing the constraint is non-destructive: it cannot
-- invalidate existing rows. Also fixes a latent failure in donny-chat, which already
-- writes `message_id: savedAssistantMsg?.id ?? null`.
alter table public.donny_tool_executions
  alter column message_id drop not null;

comment on column public.donny_tool_executions.message_id is
  'Owning donny_messages row. NULL for callers that have no assistant message id at log time (e.g. donny-orchestrator, which streams and lets the client persist the message).';
