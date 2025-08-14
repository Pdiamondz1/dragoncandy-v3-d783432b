-- Unarchive the direct conversation that was accidentally archived
UPDATE conversations 
SET is_archived = false 
WHERE type = 'direct' AND is_archived = true;