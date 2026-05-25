import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/integrations/api';
import { useUser } from '@clerk/clerk-react';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';

// Shown only when a signed-in user has no name in Clerk (e.g. an OAuth provider
// that supplied none). ProtectedRoute redirects here; once a name is set the
// guard lets the user through, so this page self-dismisses for everyone else.
export const OnboardingPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, user } = useUser();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isSignedIn || !user) return <Navigate to="/auth" replace />;
  // Already named (the common case) — nothing to complete.
  if (user.firstName?.trim() && user.lastName?.trim()) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const first = firstName.trim();
    const last = lastName.trim();
    try {
      // Clerk owns identity — update it first so the route guard (which reads
      // user.firstName/lastName) lets us in.
      await user.update({ firstName: first, lastName: last });
      // Mirror onto our profile row; non-fatal since the name now lives in Clerk.
      try {
        await api.post('update-profile-name', { first_name: first, last_name: last });
      } catch {
        /* the mirror can lag; verifyJWT already created the row */
      }
      navigate('/', { replace: true });
    } catch (err) {
      const e = err as { errors?: { longMessage?: string; message?: string }[]; message?: string };
      setError(e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? e?.message ?? t('something_went_wrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-balance">{t('complete_profile')}</h1>
          <p className="text-sm text-muted-foreground">{t('complete_profile_subtitle')}</p>
        </div>
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>{t('error')}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">{t('first_name')}</Label>
                  <Input
                    id="firstName"
                    autoFocus
                    autoComplete="given-name"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    placeholder={t('first_name')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lastName">{t('last_name')}</Label>
                  <Input
                    id="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    placeholder={t('last_name')}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2Icon className="animate-spin" /> : t('confirm')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
