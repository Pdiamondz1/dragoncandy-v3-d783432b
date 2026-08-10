import { LegalPageLayout } from './LegalPageLayout';
import { PRIVACY_EMAIL } from '@/lib/contactAddresses';

const LAST_UPDATED = 'June 6, 2026';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description="How DragonCandy collects, uses, shares, and protects your personal information."
      path="/privacy"
      lastUpdated={LAST_UPDATED}
    >
      <p>
        This Privacy Policy explains how DragonCandy ("DragonCandy," "we," "us," or
        "our") collects, uses, shares, and protects information about you when you use
        our website at dragoncandy.com, our iOS application, and related services
        (collectively, the "Service"). By using the Service, you agree to the practices
        described in this policy.
      </p>

      <h2>1. Information We Collect</h2>
      <p>We collect the following categories of information:</p>
      <ul>
        <li>
          <strong>Account information.</strong> Your name, email address, password, and
          account type (restaurant/business, content creator, or brand/sponsor).
        </li>
        <li>
          <strong>Profile information.</strong> Profile photos, bios, location, portfolio
          links, social media handles, and other details you choose to add.
        </li>
        <li>
          <strong>Content you submit.</strong> Photos, videos, captions, campaign briefs,
          messages, reviews, and other content you upload or create on the Service.
        </li>
        <li>
          <strong>Payment information.</strong> Payments are processed by Stripe. We do not
          store full card numbers; we receive limited transaction metadata (such as amount,
          status, and the last four digits) needed to operate the marketplace.
        </li>
        <li>
          <strong>Connected social accounts.</strong> When you link a social platform
          (Instagram, TikTok, or YouTube) through our integration partner Outstand, we
          receive account identifiers, tokens, and analytics needed to enable posting and
          reporting on your behalf.
        </li>
        <li>
          <strong>Location data.</strong> Business addresses and geocoding data processed
          through Google Maps to support discovery and matching.
        </li>
        <li>
          <strong>Usage and device information.</strong> Log data, device identifiers, app
          version, interactions, and analytics events. On the iOS app, with your permission,
          we collect a push notification device token to deliver notifications.
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To provide, operate, and maintain the Service;</li>
        <li>To match creators, restaurants, and brands and to power campaign workflows;</li>
        <li>To process payments and payouts and to calculate platform fees;</li>
        <li>To send transactional messages, notifications, and service updates;</li>
        <li>To provide AI-assisted features (see "AI Processing" below);</li>
        <li>To detect, prevent, and address fraud, abuse, and security issues;</li>
        <li>To comply with legal obligations and enforce our Terms of Service.</li>
      </ul>

      <h2>3. How We Share Information</h2>
      <p>
        We do not sell your personal information. We share information only as described
        below:
      </p>
      <ul>
        <li>
          <strong>With other users.</strong> Your public profile and content you post are
          visible to other users as part of the marketplace.
        </li>
        <li>
          <strong>With service providers.</strong> We share information with vendors that
          help us operate the Service, including Supabase (hosting, database, and
          authentication), Stripe (payments), Outstand (social media integration), Google
          Maps (geocoding), and Anthropic (AI processing).
        </li>
        <li>
          <strong>For legal reasons.</strong> When required by law, or to protect the
          rights, property, or safety of DragonCandy, our users, or the public.
        </li>
        <li>
          <strong>Business transfers.</strong> In connection with a merger, acquisition, or
          sale of assets, subject to this policy.
        </li>
      </ul>

      <h2>4. AI Processing</h2>
      <p>
        Our AI assistant, Donny, uses third-party AI models provided by Anthropic (Claude)
        to generate campaign briefs, suggest matches, and assist with content. Information
        you provide to AI features may be processed by these models to produce responses.
        We do not use this data to train third-party foundation models.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We retain your information for as long as your account is active or as needed to
        provide the Service. When you request account deletion, your profile is deactivated
        immediately and your data is scheduled for permanent deletion after a 30-day grace
        period, except where we must retain certain records to comply with legal, tax, or
        accounting obligations.
      </p>

      <h2>6. Your Choices and Rights</h2>
      <ul>
        <li>
          <strong>Access and update.</strong> You can review and edit your profile and
          account information at any time in Settings.
        </li>
        <li>
          <strong>Deletion.</strong> You can delete your account from Settings, which
          starts the 30-day deletion process described above.
        </li>
        <li>
          <strong>Notifications.</strong> You can manage notification preferences in
          Settings and adjust push permissions in your device settings.
        </li>
        <li>
          <strong>Regional rights.</strong> Depending on where you live, you may have
          additional rights to access, correct, port, or delete your personal information.
          Contact us to exercise these rights.
        </li>
      </ul>

      <h2>7. Security</h2>
      <p>
        We use industry-standard safeguards, including encryption in transit, access
        controls, and row-level security on our database, to protect your information. No
        method of transmission or storage is completely secure, and we cannot guarantee
        absolute security.
      </p>

      <h2>8. Children's Privacy</h2>
      <p>
        The Service is not directed to children under 18, and we do not knowingly collect
        personal information from children under 18. If you believe a child has provided us
        with personal information, please contact us so we can remove it.
      </p>

      <h2>9. International Users</h2>
      <p>
        DragonCandy is based in the United States. If you access the Service from outside
        the United States, your information may be transferred to, stored, and processed in
        the United States.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will revise the
        "Last updated" date above and, where appropriate, provide additional notice.
      </p>

      <h2>11. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy or our data practices, contact us at{' '}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>
    </LegalPageLayout>
  );
}
