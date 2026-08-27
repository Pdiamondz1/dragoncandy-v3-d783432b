import { LegalPageLayout } from './LegalPageLayout';
import { PRIVACY_LAST_UPDATED, PrivacyPolicyBody } from './PrivacyPolicyBody';

// The policy TEXT moved to PrivacyPolicyBody.tsx so the same source can be rendered
// to the static public/privacy.html that survives the site gate. This file is now
// only the in-app chrome around it. See PrivacyPolicyBody.tsx for why.

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description="How DragonCandy collects, uses, shares, and protects your personal information."
      path="/privacy"
      lastUpdated={PRIVACY_LAST_UPDATED}
    >
      <PrivacyPolicyBody />
    </LegalPageLayout>
  );
}
