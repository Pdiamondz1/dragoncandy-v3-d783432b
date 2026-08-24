import { useState } from 'react';
import { motion } from '@/lib/motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LandingButton } from '@/components/landing/LandingButton';
import { Check, Loader2 } from 'lucide-react';
import { usePhoneVerification, toE164, isE164 } from '@/hooks/usePhoneVerification';

interface PhoneStepProps {
  /** Called once the server has confirmed the number, never on a local guess. */
  onVerified: (phoneE164: string) => void;
  verified: boolean;
}

const FIELD =
  'text-center text-lg font-medium h-14 rounded-2xl border-2 border-landing-line bg-white ' +
  'text-landing-ink focus-visible:ring-2 focus-visible:ring-landing-mint placeholder:text-landing-ink-soft';

export function PhoneStep({ onVerified, verified }: PhoneStepProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { start, check, sending, checking, codeSent, setCodeSent } = usePhoneVerification();

  const e164 = toE164(phone);
  const canSend = isE164(e164) && !sending;

  async function handleSend() {
    setMessage(null);
    const result = await start(e164);
    if (!result.ok) setMessage(result.message);
  }

  async function handleCheck() {
    setMessage(null);
    const result = await check(e164, code.trim());
    // `verified` comes from the server's `status === 'met'` and nothing else — a
    // rejected code arrives as HTTP 200, so there is no local success to infer.
    if (result.verified) onVerified(e164);
    else setMessage(result.message ?? "That code didn't work.");
  }

  if (verified) {
    return (
      <motion.div
        className="flex flex-col items-center gap-3 py-6"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="w-14 h-14 rounded-full bg-landing-mint/20 flex items-center justify-center">
          <Check className="w-7 h-7 text-landing-mint" strokeWidth={3} />
        </div>
        <p className="text-landing-ink font-semibold">Phone verified</p>
        <p className="text-sm text-landing-ink-soft">{e164}</p>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <motion.div className="w-full" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Label htmlFor="onboarding-phone" className="sr-only">Phone number</Label>
        <Input
          id="onboarding-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setCodeSent(false); setMessage(null); }}
          placeholder="(201) 555-0134"
          className={FIELD}
          disabled={codeSent}
          autoFocus
        />
      </motion.div>

      {!codeSent && (
        <LandingButton type="button" onClick={handleSend} disabled={!canSend} className="w-full">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send code'}
        </LandingButton>
      )}

      {codeSent && (
        <motion.div className="w-full flex flex-col gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Label htmlFor="onboarding-phone-code" className="sr-only">Verification code</Label>
          <Input
            id="onboarding-phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setMessage(null); }}
            placeholder="6-digit code"
            className={FIELD}
            maxLength={10}
            autoFocus
          />
          <LandingButton
            type="button"
            onClick={handleCheck}
            disabled={code.trim().length < 4 || checking}
            className="w-full"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
          </LandingButton>
          <button
            type="button"
            onClick={() => { setCodeSent(false); setCode(''); setMessage(null); }}
            className="text-sm text-landing-ink-soft underline underline-offset-4"
          >
            Use a different number
          </button>
        </motion.div>
      )}

      {/*
        The server's own words, not ours. The throttle's 429 is the only place that says
        how long to wait, and the check endpoint distinguishes "didn't work" from
        "didn't match" — replacing either with generic copy loses the only actionable part.
      */}
      {message && (
        <p role="status" className="text-sm text-center text-landing-ink-soft">{message}</p>
      )}
    </div>
  );
}
