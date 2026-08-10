import { LegalPageLayout } from './LegalPageLayout';
import { PRIVACY_EMAIL } from '@/lib/contactAddresses';

const LAST_UPDATED = 'June 6, 2026';

export default function TermsOfService() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      description="The terms and conditions that govern your use of DragonCandy."
      path="/terms"
      lastUpdated={LAST_UPDATED}
    >
      <p>
        These Terms of Service ("Terms") govern your access to and use of the DragonCandy
        website at dragoncandy.com, our iOS application, and related services (collectively,
        the "Service"), operated by DragonCandy ("DragonCandy," "we," "us," or "our"). By
        creating an account or using the Service, you agree to these Terms. If you do not
        agree, do not use the Service.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 18 years old and able to form a binding contract to use the
        Service. By using the Service, you represent that you meet these requirements.
      </p>

      <h2>2. Your Account</h2>
      <p>
        You are responsible for maintaining the confidentiality of your account credentials
        and for all activity under your account. Provide accurate information and keep it up
        to date. Notify us promptly of any unauthorized use.
      </p>

      <h2>3. The Service</h2>
      <p>
        DragonCandy is a marketplace that connects restaurants and businesses, content
        creators, and brands for short-form social media campaigns and content services,
        with AI-assisted tools provided by our Donny AI assistant. We do not guarantee any
        particular result, match, or outcome from use of the Service.
      </p>

      <h2>4. Payments and Fees</h2>
      <p>
        Payments are processed through Stripe. For marketplace transactions (such as
        campaign payments, sponsorships, and DragonShare boosts), DragonCandy may retain a
        platform fee, and creators receive the remainder according to the applicable split.
        Subscription plans and any usage-based charges are billed through your web account.
        All fees are disclosed before you complete a transaction. Except as required by law,
        fees are non-refundable.
      </p>

      <h2>5. User Content</h2>
      <p>
        You retain ownership of the content you create or upload ("User Content"). By
        submitting User Content, you grant DragonCandy a worldwide, non-exclusive,
        royalty-free license to host, store, reproduce, display, and distribute that content
        as needed to operate and promote the Service and to enable the cross-posting and
        campaign features you use. You are responsible for ensuring you have the rights to
        the content you submit.
      </p>

      <h2>6. Acceptable Use and Objectionable Content</h2>
      <p>
        <strong>
          DragonCandy has zero tolerance for objectionable content or abusive behavior.
        </strong>{' '}
        You agree not to post, share, or transmit content that is unlawful, harassing,
        hateful, defamatory, obscene, sexually explicit, threatening, infringing, deceptive,
        or otherwise objectionable, and not to harass, abuse, or harm other users. You also
        agree not to misuse the Service, attempt to circumvent its security, or use it for
        any fraudulent or illegal purpose.
      </p>

      <h2>7. Content Moderation, Reporting, and Removal</h2>
      <p>
        Users can report content and conduct that violates these Terms. We review reports of
        objectionable content and abusive users and will act on them, which may include
        removing content and ejecting the offending user, within 24 hours where reasonably
        practicable. We may remove content or suspend or terminate accounts that violate
        these Terms, at our discretion.
      </p>

      <h2>8. Intellectual Property</h2>
      <p>
        The Service, including its software, design, trademarks, and content (excluding User
        Content), is owned by DragonCandy or its licensors and protected by intellectual
        property laws. We grant you a limited, non-exclusive, non-transferable license to use
        the Service for its intended purpose.
      </p>

      <h2>9. Third-Party Services</h2>
      <p>
        The Service integrates with third-party services, including Stripe, Outstand, the
        connected social platforms (Instagram, TikTok, YouTube), Google Maps, and Toast. Your
        use of those services is governed by their own terms and policies, and we are not
        responsible for them.
      </p>

      <h2>10. Apple App Store</h2>
      <p>
        If you download or use our iOS application from the Apple App Store, you also agree
        to Apple's{' '}
        <a
          href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Licensed Application End User License Agreement (Standard EULA)
        </a>
        . These Terms are between you and DragonCandy, not Apple, and DragonCandy is solely
        responsible for the application and its content. Apple and its subsidiaries are
        third-party beneficiaries of these Terms and may enforce them against you. Apple has
        no obligation to provide maintenance or support for the application.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        The Service is provided "as is" and "as available" without warranties of any kind,
        whether express or implied, including warranties of merchantability, fitness for a
        particular purpose, and non-infringement. We do not warrant that the Service will be
        uninterrupted, secure, or error-free.
      </p>

      <h2>12. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, DragonCandy will not be liable for any
        indirect, incidental, special, consequential, or punitive damages, or any loss of
        profits or revenues, arising out of or related to your use of the Service. Our total
        liability for any claim relating to the Service will not exceed the greater of the
        amounts you paid us in the twelve months before the claim or one hundred U.S. dollars.
      </p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to indemnify and hold DragonCandy harmless from any claims, damages, and
        expenses arising out of your User Content, your use of the Service, or your violation
        of these Terms.
      </p>

      <h2>14. Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time. We may suspend or
        terminate your access if you violate these Terms or if we discontinue the Service.
      </p>

      <h2>15. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of New Jersey, without regard to
        its conflict-of-laws rules. Disputes will be resolved in the state or federal courts
        located in New Jersey.
      </p>

      <h2>16. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. When we do, we will revise the "Last
        updated" date above. Your continued use of the Service after changes take effect
        constitutes acceptance of the revised Terms.
      </p>

      <h2>17. Contact Us</h2>
      <p>
        Questions about these Terms? Contact us at{' '}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>
    </LegalPageLayout>
  );
}
