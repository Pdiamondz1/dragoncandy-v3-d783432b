ALTER TABLE donny_messages ADD COLUMN IF NOT EXISTS quick_actions JSONB DEFAULT NULL;

COMMENT ON COLUMN donny_messages.quick_actions IS 'Optional quick-action buttons rendered below the message. Array of {label, action, url?} objects.';
