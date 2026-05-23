import { type ReactNode } from 'react';

interface PrerequisiteGateProps {
  feature: string;
  children: ReactNode;
  inline?: boolean;
}

export function PrerequisiteGate({ children }: PrerequisiteGateProps) {
  // Temporarily bypass gate while social media + Stripe integrations are being fixed
  return <>{children}</>;
}
