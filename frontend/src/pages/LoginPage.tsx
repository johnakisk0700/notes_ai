import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Logo } from '@/components/Common/Logo';
import { api } from '@/integrations/api';
import { useSignIn, useSignUp } from '@clerk/clerk-react';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

// Extracts the most useful message out of a Clerk error.
function clerkErrorMessage(err: unknown, fallback: string): string {
  const e = err as { errors?: { longMessage?: string; message?: string }[]; message?: string };
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? e?.message ?? fallback;
}

// Google's multicolor "G" mark — lucide-react ships no brand icons.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  // Set when the user explicitly bails out of a resumed verification, so the
  // effect below doesn't immediately snap them back onto it (see the trap fix).
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [code, setCode] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  });

  // If the user refreshed mid-verification, Clerk still holds the in-progress
  // signUp — resume the verification step automatically. Unless they chose to
  // start over: without that guard the verification screen would be inescapable
  // (a refresh always re-derives missing_requirements).
  useEffect(() => {
    if (signUpLoaded && signUp?.status === 'missing_requirements' && !resumeDismissed) {
      setPendingVerification(true);
    }
  }, [signUpLoaded, signUp?.status, resumeDismissed]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Social sign-in. Calling it on `signIn` covers returning users; Clerk
  // transfers an unknown Google identity into a sign-up on the callback, so the
  // single button handles both. The backend lazily provisions the profile row
  // from the Clerk user on the first authenticated request (see verifyJWT).
  const handleGoogleAuth = async () => {
    if (!signInLoaded) return;
    setError(null);
    setOauthLoading(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (err) {
      setError(clerkErrorMessage(err, t('something_went_wrong')));
      setOauthLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInLoaded) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: formData.email,
        password: formData.password,
      });

      if (result.status === 'complete') {
        await setActiveSignIn({ session: result.createdSessionId });
        navigate('/');
      } else {
        setError(t('something_went_wrong'));
      }
    } catch (err) {
      setError(clerkErrorMessage(err, t('something_went_wrong')));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded) return;
    setLoading(true);
    setError(null);

    try {
      await signUp.create({
        emailAddress: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
      });

      // Clerk sends a one-time code to the email; collect it in the next step.
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setResumeDismissed(false);
      setPendingVerification(true);
    } catch (err) {
      setError(clerkErrorMessage(err, t('something_went_wrong')));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === 'complete') {
        await setActiveSignUp({ session: result.createdSessionId });

        // Best-effort profile row; verifyJWT also provisions it on first request.
        try {
          await api.post('create-profile', {
            id: result.createdUserId,
            first_name: formData.firstName,
            last_name: formData.lastName,
            email: formData.email,
            role: 'user',
          });
        } catch {
          /* backend lazily provisions the profile, so this is non-fatal */
        }

        toast.success(t('successful_registration'));
        navigate('/');
      } else {
        setError(t('something_went_wrong'));
      }
    } catch (err) {
      setError(clerkErrorMessage(err, t('something_went_wrong')));
    } finally {
      setLoading(false);
    }
  };

  // Escape hatch out of the verification step back to the sign-up form. The
  // dismissed flag stops the resume effect from re-trapping us this session;
  // re-submitting the form starts a fresh Clerk sign-up attempt.
  const handleStartOver = () => {
    setResumeDismissed(true);
    setPendingVerification(false);
    setCode('');
    setError(null);
  };

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
          <h1 aria-label="Mneme Labs">
            <Logo size="lg" animate suffix="Labs" />
          </h1>
          <p className="text-sm text-muted-foreground">{t('auth_subtitle')}</p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-5">
            {/* Google OAuth — shared by sign in & sign up */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleAuth}
              disabled={oauthLoading || !signInLoaded}
            >
              {oauthLoading ? <Loader2Icon className="animate-spin" /> : <GoogleIcon className="size-4" />}
              {t('continue_with_google')}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">{t('or_continue_with_email')}</span>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>{t('error')}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {pendingVerification ? (
              <form onSubmit={handleVerify} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">{t('verify_email')}</h2>
                  {formData.email && (
                    <p className="text-sm text-muted-foreground">
                      {t('code_sent_to')} {formData.email}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="code">{t('verification_code')}</Label>
                  <Input
                    id="code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    required
                    placeholder="123456"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2Icon className="animate-spin" /> : t('confirm')}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={handleStartOver} disabled={loading}>
                  {t('use_different_email')}
                </Button>
              </form>
            ) : (
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="signin">{t('sign_in')}</TabsTrigger>
                  <TabsTrigger value="signup">{t('sign_up')}</TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="flex flex-col gap-5 pt-2">
                    <div className="grid gap-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="signin-password">{t('password')}</Label>
                      <Input
                        id="signin-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        value={formData.password}
                        onChange={handleInputChange}
                        required
                        placeholder={t('password')}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2Icon className="animate-spin" /> : t('sign_in')}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="flex flex-col gap-5 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="firstName">{t('first_name')}</Label>
                        <Input
                          id="firstName"
                          name="firstName"
                          type="text"
                          autoComplete="given-name"
                          value={formData.firstName}
                          onChange={handleInputChange}
                          required
                          placeholder={t('first_name')}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="lastName">{t('last_name')}</Label>
                        <Input
                          id="lastName"
                          name="lastName"
                          type="text"
                          autoComplete="family-name"
                          value={formData.lastName}
                          onChange={handleInputChange}
                          required
                          placeholder={t('last_name')}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="signup-password">{t('password')}</Label>
                      <Input
                        id="signup-password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        value={formData.password}
                        onChange={handleInputChange}
                        required
                        placeholder={t('password')}
                      />
                    </div>
                    {/* Clerk Smart CAPTCHA mounts here (bot protection on sign-up). */}
                    <div id="clerk-captcha" />
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2Icon className="animate-spin" /> : t('sign_up')}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
