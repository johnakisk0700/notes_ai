import { AuthApiError, AuthError } from '@supabase/supabase-js';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { supabase as supa } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/integrations/api';
import { Loader2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
  });

  const handleError = (error: AuthError) => {
    if (error instanceof AuthApiError) {
      setError(t(error.code || '') || error.message);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: validationData, error: validationError } = await supa.rpc('validate_password', {
        password: formData.password,
      });

      if (validationError || !validationData) {
        setError(t('password_too_long'));
        return;
      }
      const { data, error } = await supa.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone_number: formData.phoneNumber,
          },
        },
      });

      if (error) {
        handleError(error);
      } else if (data.user?.id) {
        // After successful signup, create the profile
        await api.post('create-profile', {
          id: data.user.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          role: 'user',
        });
        const { error } = await signIn(formData.email, formData.password);
        if (error) handleError(error);
        else navigate('/');
        toast.success(t('successful_registration'));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('something_went_wrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await signIn(formData.email, formData.password);
      if (error) handleError(error);
      else navigate('/');
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
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
                    <Button type="submit" className="w-full">
                      {loading ? <Loader2Icon className="animate-spin" /> : t('sign_in')}
                    </Button>
                  </CardFooter>
                </CardContent>
              </Card>
            </form>
          </TabsContent>
          <TabsContent value="signup">
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
                  <CardFooter className="mt-6 px-0">
                    <Button type="submit" className="w-full">
                      {loading ? <Loader2Icon className="animate-spin" /> : t('sign_up')}
                    </Button>
                  </CardFooter>
                </CardContent>
              </Card>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
