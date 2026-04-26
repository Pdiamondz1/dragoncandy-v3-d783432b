interface InvitationBannerProps {
  businessName?: string;
}

export function InvitationBanner({ businessName }: InvitationBannerProps) {
  return (
    <div className="bg-amber-50 border-b border-amber-300 px-5 py-3 flex items-center gap-3">
      <span className="text-xl">📩</span>
      <div>
        <p className="text-sm font-semibold text-amber-900">You're invited!</p>
        <p className="text-xs text-amber-700">
          {businessName
            ? `${businessName} personally invited you to this campaign`
            : 'You were personally invited to this campaign'}
        </p>
      </div>
    </div>
  );
}
