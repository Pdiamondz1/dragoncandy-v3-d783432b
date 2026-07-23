export interface BootInputs {
  stripeSecret: string | undefined;
  stripePublishable: string | undefined;
  killSwitch: boolean | null; // null = could not read the flag → fail closed
}

export function assertBootSafety(i: BootInputs): void {
  if (!i.stripeSecret?.startsWith("sk_test_") || !i.stripePublishable?.startsWith("pk_test_")) {
    throw new Error("Refusing to run: Stripe keys must be TEST keys (sk_test_/pk_test_).");
  }
  if (i.killSwitch !== true) {
    throw new Error("Refusing to run: SYNTHETIC_BOTS_ENABLED must be explicitly enabled (fail-closed).");
  }
}
