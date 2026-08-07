import { Users } from 'lucide-react';
import type { CreatorGroupInvitation } from '@/hooks/useCreatorGroupInvitations';

interface GroupInviteCardProps {
  invitation: CreatorGroupInvitation;
  onAccept: () => void;
  onDecline: () => void;
  isPending?: boolean;
}

/**
 * A pending crew ("creator group") invitation card for the creator marketplace
 * "Crews" tab. Styled to match the Invitations-tab cards.
 *
 * The crew name normally resolves: `get_creator_pending_group_invitations()` is
 * a SECURITY DEFINER RPC that returns the crew name and inviting business past
 * RLS (see useCreatorGroupInvitations). The fallback chain below is defensive
 * only.
 */
export function GroupInviteCard({ invitation, onAccept, onDecline, isPending = false }: GroupInviteCardProps) {
  const crewName = invitation._group_name ?? invitation._business_name ?? 'A crew';
  const businessName = invitation._business_name;
  const avatarUrl = invitation._owner_avatar_url;

  return (
    <div className="bg-teal-50 border-2 border-dc-teal rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-9 h-9 rounded-full object-cover ring-2 ring-teal-400"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-dc-teal flex items-center justify-center text-white">
            <Users className="w-4 h-4" aria-hidden="true" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">{crewName}</p>
          <p className="text-xs text-gray-500">
            Invited {new Date(invitation.invited_at).toLocaleDateString()}
          </p>
        </div>
        <span className="text-[10px] font-semibold text-dc-teal bg-white border border-dc-teal px-2 py-0.5 rounded-full whitespace-nowrap">
          Crew invite
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-3">
        {businessName
          ? `${businessName} invited you to their crew.`
          : "You've been invited to join a crew."}
      </p>

      <div className="rounded-xl bg-dc-teal/[0.04] border border-dc-teal/20 p-3 space-y-1.5 mb-3">
        <p className="text-xs text-gray-600">
          <span className="font-semibold text-gray-900">⚡ Crew-only</span> — these collabs never
          go public, so you're not competing with the whole marketplace. One tap to apply.
        </p>
        <p className="text-xs text-gray-600">
          <span className="font-semibold text-gray-900">🎁 Free collabs</span> — crew campaigns are
          unpaid, so there's no budget or payment step. You're getting first dibs, not a fee.
        </p>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Accepting adds you to their roster and shows their crew collabs here. Whether you apply is
        always up to you.
      </p>

      <div className="flex gap-2">
        <button
          onClick={onAccept}
          disabled={isPending}
          className="flex-1 bg-dc-teal text-white font-semibold py-2 rounded-full text-sm hover:bg-dc-teal/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Accept invite
        </button>
        <button
          onClick={onDecline}
          disabled={isPending}
          className="flex-1 bg-white text-pink-500 font-semibold py-2 rounded-full text-sm border-2 border-dc-teal/30 hover:bg-dc-teal/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
