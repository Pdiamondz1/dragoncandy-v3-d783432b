import { LegalPageLayout } from './LegalPageLayout';
import { TERMS_LAST_UPDATED, TermsOfServiceBody } from './TermsOfServiceBody';

// The terms TEXT moved to TermsOfServiceBody.tsx so the same source can be rendered
// to the static public/terms.html that survives the site gate. This file is now only
// the in-app chrome around it. See TermsOfServiceBody.tsx for why.

export default function TermsOfService() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      description="The terms and conditions that govern your use of DragonCandy."
      path="/terms"
      lastUpdated={TERMS_LAST_UPDATED}
    >
      <TermsOfServiceBody />
    </LegalPageLayout>
  );
}
