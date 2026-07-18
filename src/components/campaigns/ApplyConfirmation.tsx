import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

interface ApplyConfirmationProps {
  open: boolean;
  onClose: () => void;
  businessName?: string;
}

export function ApplyConfirmation({ open, onClose, businessName }: ApplyConfirmationProps) {
  const navigate = useNavigate();

  if (!open) return null;

  // Portal to <body> so the full-screen `fixed inset-0` overlay is positioned
  // relative to the viewport. Rendered in place, it sits inside the Framer-Motion
  // PageTransition wrapper whose `transform` becomes the containing block for
  // `position: fixed` — which sized this overlay to the full (scrolled) page and
  // left the centered confirmation off-screen (user had to scroll up to see it).
  return createPortal(
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
      {/* Checkmark animation */}
      <div className="w-20 h-20 rounded-full bg-dc-teal flex items-center justify-center mb-6 animate-in zoom-in duration-500">
        <svg
          className="w-10 h-10 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
            className="animate-draw-check"
          />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Application Sent!</h2>
      <p className="text-sm text-gray-500 text-center max-w-xs mb-8">
        {businessName ? `${businessName} will` : 'The business will'} respond within 24h.
        We'll ping you here and on push notifications.
      </p>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => {
            onClose();
            navigate('/dashboard/creator/campaigns');
          }}
          className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3.5"
        >
          Browse more campaigns
        </button>
        <button
          onClick={() => {
            onClose();
            navigate('/dashboard/creator/my-campaigns?tab=applied');
          }}
          className="w-full rounded-full border-2 border-dc-teal/20 text-gray-600 font-semibold py-3"
        >
          View my applications
        </button>
      </div>

      <style>{`
        @keyframes draw-check {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .animate-draw-check {
          stroke-dasharray: 24;
          animation: draw-check 0.4s ease-out 0.3s forwards;
          stroke-dashoffset: 24;
        }
      `}</style>
    </div>,
    document.body,
  );
}
