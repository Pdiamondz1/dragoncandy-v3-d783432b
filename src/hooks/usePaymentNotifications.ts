import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getPaymentMessage, type UserRole } from "@/lib/paymentEducation";
import type { PaymentEvent } from "@/hooks/usePaymentTimeline";

export function usePaymentNotifications(
  events: PaymentEvent[] | undefined,
  userRole: UserRole,
) {
  const { toast } = useToast();
  const { user } = useAuth();
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    if (!events || !user?.id) return;

    // On first load, mark all existing events as seen
    if (seenIds.current.size === 0) {
      events.forEach(e => seenIds.current.add(e.id));
      return;
    }

    const newEvents = events.filter(
      e => !seenIds.current.has(e.id) && e.actor_id !== user.id
    );

    for (const event of newEvents) {
      seenIds.current.add(event.id);
      const message = getPaymentMessage(userRole, event.event_type, event.metadata);
      if (message) {
        toast({
          title: message.title,
          description: message.description,
        });
      }
    }
  }, [events, user?.id, userRole, toast]);
}
