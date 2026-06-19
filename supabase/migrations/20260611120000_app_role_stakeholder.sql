-- AIOS PR 1: add the 'stakeholder' tier to app_role.
-- MUST stay in its own migration file: Postgres forbids referencing a new enum
-- value in the same transaction that adds it, and each migration runs in one
-- transaction. is_internal_user() (which references it) lives in the next file.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stakeholder';
