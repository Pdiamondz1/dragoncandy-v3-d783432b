import { useState } from 'react';
import { motion } from '@/lib/motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LandingButton } from '@/components/landing/LandingButton';
import { Check, Loader2, MapPin } from 'lucide-react';

interface AddressStepProps {
  address: string;
  onAddressChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  /**
   * True only once the SERVER has stamped `address_verified_at`. A saved address is
   * not a verified one — the whole point of the column is that a geocoder agreed.
   */
  verified: boolean;
  /** Set when the save landed but verification has not come back yet. */
  pending: boolean;
}

export function AddressStep({
  address, onAddressChange, onSave, saving, verified, pending,
}: AddressStepProps) {
  const [touched, setTouched] = useState(false);

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
        <p className="text-landing-ink font-semibold">Address confirmed</p>
        <p className="text-sm text-landing-ink-soft text-center">{address}</p>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <motion.div className="w-full" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Label htmlFor="onboarding-address" className="sr-only">Street address</Label>
        <div className="relative">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-landing-ink-soft" />
          <Input
            id="onboarding-address"
            value={address}
            onChange={(e) => { onAddressChange(e.target.value); setTouched(true); }}
            placeholder="123 Washington St, Hoboken, NJ 07030"
            className="pl-12 text-base font-medium h-14 rounded-2xl border-2 border-landing-line bg-white text-landing-ink focus-visible:ring-2 focus-visible:ring-landing-mint placeholder:text-landing-ink-soft"
            autoComplete="street-address"
            autoFocus
          />
        </div>
      </motion.div>

      <LandingButton
        type="button"
        onClick={onSave}
        disabled={address.trim().length < 6 || saving}
        className="w-full"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm address'}
      </LandingButton>

      {/*
        Saved-but-unverified is its own state and says so. Reporting it as done would be
        the failure mode this column exists to prevent: `address_verified_at` is written
        server-side by `verify-address`, and a geocode that cannot resolve leaves it null.
      */}
      {pending && !verified && (
        <p role="status" className="text-sm text-center text-landing-ink-soft">
          Saved. We're checking the address — this can take a moment, and you can carry on.
        </p>
      )}
      {touched && !pending && (
        <p className="text-xs text-center text-landing-ink-soft">
          We use this to match you with creators nearby.
        </p>
      )}
    </div>
  );
}
