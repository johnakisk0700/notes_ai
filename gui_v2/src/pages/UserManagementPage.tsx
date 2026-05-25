import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { api } from '@/integrations/api';
import type { Profile } from '@shared/db/schema/profile';
import type { Tefteri } from '@shared/db/schema/tefteri';
import { ShieldUser, Trash, UserIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

interface UserProfile {
  profile: Profile;
  tefteri: Tefteri | null;
}

export const UserManagementPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const {
        data: { data: profiles },
      } = await api.get<{ data: { profile: Profile; tefteri: Tefteri | null }[] }>('get-profiles');
      setProfiles(profiles);
    } catch (error) {
      console.error('Error loading profiles:', error);
      toast.error(t('failed_to_load_profiles'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleToggle = (user: UserProfile) => {
    setSelectedUser(user);
    setShowConfirmDialog(true);
  };

  const handleDeleteClick = (user: UserProfile) => {
    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!selectedUser) return;

    try {
      await api.post('delete-user', { userId: selectedUser.profile.id });

      setProfiles(prevUsers => prevUsers.filter(user => user.profile.id !== selectedUser.profile.id));

      toast.success(`${selectedUser.profile.first_name || selectedUser.profile.email} has been deleted`);
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(t('failed_deletion'));
    } finally {
      setShowDeleteDialog(false);
      setSelectedUser(null);
    }
  };

  const confirmRoleChange = async () => {
    if (!selectedUser) return;

    try {
      const newRole = selectedUser.profile.role === 'admin' ? 'user' : 'admin';
      await api.post('update-profile-role', {
        profileId: selectedUser.profile.id,
        role: newRole,
      });

      setProfiles(prevProfiles =>
        prevProfiles.map(profile =>
          profile.profile.id === selectedUser.profile.id
            ? { profile: { ...profile.profile, role: newRole }, tefteri: profile.tefteri }
            : profile
        )
      );

      toast.success(`${t('successful_update')} ${selectedUser.profile.first_name || selectedUser.profile.email}`);
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    } finally {
      setShowConfirmDialog(false);
      setSelectedUser(null);
    }
  };

  const getUserDisplayName = (user: UserProfile | null) => {
    if (user?.profile.first_name && user.profile.last_name) {
      return `${user.profile.first_name} ${user.profile.last_name}`;
    }
    return user?.profile.email || 'Unknown User';
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="h-[calc(100%-3.5rem)] pb-8 overflow-auto">
      <Table>
        <TableCaption>{t('user_management')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t('name')}</TableHead>
            <TableHead className="text-right">{t('tefteri')}</TableHead>
            <TableHead className="text-right">{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.length
            ? profiles.map(user => (
                <TableRow key={user.profile.id}>
                  <TableCell className="font-medium">
                    <div
                      className={
                        user.profile.role === 'admin'
                          ? 'text-yellow-700 flex items-center gap-1.5'
                          : 'flex items-center gap-1.5'
                      }
                    >
                      <Avatar className="size-5">
                        {user.profile.role === 'admin' ? (
                          <ShieldUser className="size-5" />
                        ) : (
                          <UserIcon className="size-5" />
                        )}
                      </Avatar>
                      {getUserDisplayName(user)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" className="text-foreground">
                      <span>{user.tefteri ? user.tefteri.totalCost : '0'} €</span>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" onClick={() => handleRoleToggle(user)}>
                        {t('change_role')}
                      </Button>
                      <Button variant="destructive" onClick={() => handleDeleteClick(user)}>
                        <Trash />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            : null}
        </TableBody>
      </Table>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('are_you_sure')}</DialogTitle>
            <DialogDescription>{t('account_deletion_warning')}</DialogDescription>
          </DialogHeader>
          <Button variant="secondary" onClick={() => setShowDeleteDialog(false)}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" onClick={confirmDelete}>
            {t('confirm')}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('are_you_sure')}</DialogTitle>
            <DialogDescription>
              {t('change_role_warning')} <Badge className="mx-1 px-1">{getUserDisplayName(selectedUser || null)}</Badge>{' '}
              {t('from')} {selectedUser?.profile.role} {t('to')}{' '}
              {selectedUser?.profile.role === 'admin' ? 'user' : 'admin'}?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 ml-auto">
            <Button variant="secondary" onClick={() => setShowConfirmDialog(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={confirmRoleChange}>{t('confirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
