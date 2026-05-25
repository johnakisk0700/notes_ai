import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react';
import { Loader2Icon } from 'lucide-react';

// Where Clerk redirects back to after a social (Google) auth round-trip.
// AuthenticateWithRedirectCallback finishes the handshake — completing the
// sign-in, or transferring an unknown OAuth identity into a fresh sign-up —
// then sends the user on. It renders nothing, so we show a spinner meanwhile.
export const SSOCallbackPage = () => {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center">
      <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
    </div>
  );
};
