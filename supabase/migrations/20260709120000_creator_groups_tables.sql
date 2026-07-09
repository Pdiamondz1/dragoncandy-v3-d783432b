-- Standing per-business creator groups ("crews") + membership.
CREATE TABLE public.creator_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_creator_groups_owner ON public.creator_groups(owner_id);

CREATE TABLE public.creator_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.creator_groups(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','active','declined','removed')),
  invited_by uuid REFERENCES public.profiles(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, creator_id)
);
CREATE INDEX idx_cgm_group ON public.creator_group_members(group_id);
CREATE INDEX idx_cgm_creator ON public.creator_group_members(creator_id);

CREATE TRIGGER trg_creator_groups_updated_at BEFORE UPDATE ON public.creator_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_cgm_updated_at BEFORE UPDATE ON public.creator_group_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.creator_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_group_members ENABLE ROW LEVEL SECURITY;
