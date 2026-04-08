export interface PaymentMessage {
  title: string;
  description: string;
  action?: string;
}

export type PaymentEventType =
  | 'escrow_authorized' | 'escrow_held' | 'escrow_failed' | 'escrow_expired'
  | 'content_started' | 'content_submitted' | 'revision_requested' | 'content_resubmitted' | 'content_approved' | 'content_rejected'
  | 'payment_released' | 'transfer_created' | 'transfer_failed' | 'payout_completed' | 'payout_pending_wallet'
  | 'sponsorship_paid'
  | 'refund_initiated' | 'refund_completed' | 'dispute_created' | 'dispute_resolved';

export type UserRole = 'business' | 'creator' | 'brand';

const businessMessages: Partial<Record<PaymentEventType, PaymentMessage>> = {
  escrow_authorized: {
    title: "Payment Processing",
    description: "Your payment is being processed. Funds will be held securely until you approve the creator's content.",
  },
  escrow_held: {
    title: "Funds Held Securely",
    description: "Your payment is held in escrow. You won't be charged again. When you approve the content, the creator gets paid.",
  },
  escrow_failed: {
    title: "Payment Failed",
    description: "Your payment could not be processed. Please check your payment method and try again.",
    action: "Retry Payment",
  },
  escrow_expired: {
    title: "Payment Session Expired",
    description: "Your checkout session expired. Please initiate payment again to proceed.",
    action: "Pay Now",
  },
  content_started: {
    title: "Creator Working",
    description: "The creator has started working on your content. You'll be notified when it's ready for review.",
  },
  content_submitted: {
    title: "Content Ready for Review",
    description: "The creator has submitted their content. Review it and approve to release payment, or request a revision.",
    action: "Review Content",
  },
  revision_requested: {
    title: "Revision Requested",
    description: "You've requested changes. The creator will revise and resubmit.",
  },
  content_resubmitted: {
    title: "Revised Content Submitted",
    description: "The creator has resubmitted after your feedback. Review the updated content.",
    action: "Review Content",
  },
  content_approved: {
    title: "Content Approved",
    description: "You approved the content. The creator's payment is being processed now.",
  },
  content_rejected: {
    title: "Content Rejected",
    description: "You rejected the content and a refund has been initiated. Funds will be returned within 5-10 business days.",
  },
  refund_initiated: {
    title: "Refund Processing",
    description: "Your refund is being processed by Stripe. It will appear on your statement within 5-10 business days.",
  },
  payment_released: {
    title: "Payment Released",
    description: "Payment has been released to the creator. The project is complete.",
  },
  transfer_created: {
    title: "Payment Sent",
    description: "The creator's payment has been transferred successfully.",
  },
  transfer_failed: {
    title: "Transfer Issue",
    description: "There was an issue sending payment to the creator. Our team is looking into it.",
  },
  payout_pending_wallet: {
    title: "Payment Held for Creator",
    description: "Payment is ready for the creator. They'll receive it once they complete their payout setup.",
  },
  refund_completed: {
    title: "Refund Processed",
    description: "Your refund has been processed and will appear on your statement within 5-10 business days.",
  },
  dispute_created: {
    title: "Payment Dispute Filed",
    description: "A dispute has been filed on this payment. Our team has been notified and will respond.",
  },
};

const creatorMessages: Partial<Record<PaymentEventType, PaymentMessage>> = {
  escrow_authorized: {
    title: "Payment Incoming",
    description: "The business is completing payment. Once confirmed, you can start working on the content.",
  },
  escrow_held: {
    title: "Payment Secured",
    description: "The business has paid. Your payment is locked in. Deliver your content and get paid when they approve it.",
  },
  escrow_failed: {
    title: "Payment Issue",
    description: "The business's payment didn't go through. They've been notified to try again.",
  },
  content_started: {
    title: "You're Working on It",
    description: "You've started creating content for this project. Submit when you're ready.",
  },
  content_submitted: {
    title: "Content Under Review",
    description: "Your content is being reviewed by the business. You'll be notified when it's approved or if changes are needed.",
  },
  revision_requested: {
    title: "Revision Requested",
    description: "The business has requested changes. Check their notes and resubmit when ready.",
    action: "View Feedback",
  },
  content_resubmitted: {
    title: "Resubmitted for Review",
    description: "Your revised content is being reviewed. You'll be notified of the result.",
  },
  content_approved: {
    title: "Content Approved!",
    description: "Great work! Your content has been approved and payment is on its way.",
  },
  content_rejected: {
    title: "Content Not Accepted",
    description: "The business did not accept your content for this project. The project has been cancelled.",
  },
  refund_initiated: {
    title: "Project Cancelled",
    description: "This project has been cancelled and the business has been refunded.",
  },
  payment_released: {
    title: "Getting Paid",
    description: "Your payment is being transferred now.",
  },
  transfer_created: {
    title: "You Got Paid!",
    description: "Payment has been transferred to your Stripe account. It may take 1-2 business days to arrive in your bank.",
  },
  transfer_failed: {
    title: "Payout Issue",
    description: "There was a problem with your payout. Please check your Stripe account settings.",
    action: "Check Payout Settings",
  },
  payout_pending_wallet: {
    title: "Payment in Your Wallet",
    description: "Your earnings are ready! Complete your Stripe setup to withdraw to your bank account.",
    action: "Set Up Payouts",
  },
  refund_completed: {
    title: "Payment Refunded",
    description: "The payment for this project has been refunded to the business.",
  },
  dispute_created: {
    title: "Payment Under Review",
    description: "A payment dispute has been filed. Our team is handling it — no action needed from you right now.",
  },
};

const brandMessages: Partial<Record<PaymentEventType, PaymentMessage>> = {
  escrow_authorized: {
    title: "Payment Processing",
    description: "Your sponsorship payment is being processed.",
  },
  sponsorship_paid: {
    title: "Sponsorship Paid",
    description: "Your sponsorship payment is confirmed. The campaign is funded and active.",
  },
  escrow_held: {
    title: "Funds Secured",
    description: "Your sponsorship funds are held securely until the campaign is complete.",
  },
  escrow_failed: {
    title: "Payment Failed",
    description: "Your sponsorship payment could not be processed. Please try again.",
    action: "Retry Payment",
  },
  payment_released: {
    title: "Payment Released",
    description: "Sponsorship payment has been released to the restaurant.",
  },
  transfer_created: {
    title: "Payment Sent",
    description: "The restaurant's sponsorship payment has been transferred successfully.",
  },
  refund_completed: {
    title: "Refund Processed",
    description: "Your sponsorship refund has been processed.",
  },
  dispute_created: {
    title: "Payment Dispute Filed",
    description: "A dispute has been filed on this sponsorship payment. Our team has been notified.",
  },
};

export const paymentEducation: Record<UserRole, Partial<Record<PaymentEventType, PaymentMessage>>> = {
  business: businessMessages,
  creator: creatorMessages,
  brand: brandMessages,
};

export function getPaymentMessage(role: UserRole, eventType: string): PaymentMessage | undefined {
  return paymentEducation[role]?.[eventType as PaymentEventType];
}
