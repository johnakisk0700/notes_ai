import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/integrations/api';
import { useSignIn, useSignUp } from '@clerk/clerk-react';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

// Extracts the most useful message out of a Clerk error.
function clerkErrorMessage(err: unknown, fallback: string): string {
  const e = err as { errors?: { longMessage?: string; message?: string }[]; message?: string };
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? e?.message ?? fallback;
}

export const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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
        unsafeMetadata: { phone_number: formData.phoneNumber },
      });

      // Clerk sends a one-time code to the email; collect it in the next step.
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
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

  return (
    <div className="w-dvw flex flex-col justify-center items-center p-4">
      <h1 className="text-center text-4xl font-extrabold tracking-tight text-balance mb-5">MySert AI Labs</h1>
      <div className="flex justify-center gap-4 max-w-full w-full">
        <Tabs defaultValue={'signin'} className="w-full md:w-[24rem]">
          <TabsList className="w-full">
            <TabsTrigger value="signin">{t('sign_in')}</TabsTrigger>
            <TabsTrigger value="signup">{t('sign_up')}</TabsTrigger>
          </TabsList>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('error')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4">
              <Card className="">
                <CardHeader>
                  <CardTitle className="text-xl">{t('login')}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="grid gap-3">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      placeholder="Email"
                    ></Input>
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor="password">{t('password')}</Label>
                    <Input
                      value={formData.password}
                      onChange={handleInputChange}
                      id="password"
                      name="password"
                      type="password"
                      required
                      placeholder={t('password')}
                    ></Input>
                  </div>
                  <CardFooter className="mt-6 px-0">
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2Icon className="animate-spin" /> : t('sign_in')}
                    </Button>
                  </CardFooter>
                </CardContent>
              </Card>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            {pendingVerification ? (
              <form onSubmit={handleVerify} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{t('verify_email') || 'Verify your email'}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <div className="grid gap-3">
                      <Label htmlFor="code">{t('verification_code') || 'Verification code'}</Label>
                      <Input
                        id="code"
                        name="code"
                        type="text"
                        inputMode="numeric"
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        required
                        placeholder="123456"
                      ></Input>
                    </div>
                    <CardFooter className="mt-6 px-0">
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <Loader2Icon className="animate-spin" /> : t('confirm')}
                      </Button>
                    </CardFooter>
                  </CardContent>
                </Card>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{t('sign_up')}</CardTitle>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-5">
                    <div className="grid gap-3">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                        placeholder="Email"
                      ></Input>
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="password">{t('password')}</Label>
                      <Input
                        value={formData.password}
                        onChange={handleInputChange}
                        id="password"
                        name="password"
                        type="password"
                        required
                        placeholder={t('password')}
                      ></Input>
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="firstName">{t('first_name')}</Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        required
                        placeholder={t('first_name')}
                      ></Input>
                    </div>
                    <div className="grid gap-3">
                      <Label htmlFor="lastName">{t('last_name')}</Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        type="text"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        required
                        placeholder={t('last_name')}
                      ></Input>
                    </div>
                    {/* Clerk Smart CAPTCHA mounts here (bot protection on sign-up). */}
                    <div id="clerk-captcha" />
                    <CardFooter className="mt-6 px-0">
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <Loader2Icon className="animate-spin" /> : t('sign_up')}
                      </Button>
                    </CardFooter>
                  </CardContent>
                </Card>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
