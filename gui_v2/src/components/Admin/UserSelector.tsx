import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUsersContext } from '@/context/UsersContext/UsersProvider';
import { useMediaQuery } from '@/hooks/use-media-query';
import Fuse from 'fuse.js';
import { Loader2Icon, User2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Toggle } from '../ui/toggle';
import { useTranslation } from 'react-i18next';

export function UserSelector({ selectedUsers, setSelectedUsers }) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const users = useUsersContext();
  const [isInitialised, setIsInitialised] = useState(false);

  // Fix: Set all users as selected only on the initial load when users become available.
  useEffect(() => {
    if (users.length > 0 && !isInitialised) {
      setSelectedUsers(users.map(user => user.id));
      setIsInitialised(true);
    }
  }, [users, isInitialised, setSelectedUsers]);

  // utils
  const toggleAllUsers = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(user => user.id));
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // Text/Query Part
  const [searchQuery, setSearchQuery] = useState('');
  const fuse = useMemo(
    () =>
      new Fuse(users, {
        threshold: 0.6,
        includeScore: false,
        keys: [{ name: 'userIdentifier', weight: 1 }],
      }),
    [users]
  );
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!searchQuery) return users;
    return fuse.search(searchQuery).map(res => res.item);
  }, [users, searchQuery, fuse]);

  const buttonCss =
    filteredUsers.length === selectedUsers.length
      ? 'bg-destructive/60 text-foreground transition-none'
      : 'bg-destructive/15 text-foreground transition-none';

  if (!users.length)
    return (
      <Button className="bg-destructive/15 text-foreground" variant="secondary" disabled={true}>
        <Loader2Icon className="animate-spin" />
      </Button>
    );

  const TriggerButton = (
    <Button className={buttonCss} variant="secondary">
      <User2Icon />
      {filteredUsers.length === selectedUsers.length ? t('all') : t('users')}
    </Button>
  );

  const SelectorContent = (
    <>
      <div className="flex items-center mb-4 gap-2">
        <Input placeholder="Search users" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <Toggle
          pressed={users.length === selectedUsers.length}
          onPressedChange={() => toggleAllUsers()}
          className="text-xs"
          variant="outline"
        >
          {t('all')}
        </Toggle>
      </div>

      <ScrollArea className="h-[40dvh]">
        <div className="flex flex-col gap-2">
          {filteredUsers.map((user, i) => (
            <div className="flex gap-2" key={`${user.id}_${i}`}>
              <Checkbox
                id={user.id}
                checked={selectedUsers.includes(user.id)}
                onCheckedChange={() => toggleUser(user.id)}
              />
              <label
                htmlFor={user.id}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {user.userIdentifier}
              </label>
            </div>
          ))}
          {filteredUsers.length === 0 ? <div>{t('no_users_found')}</div> : <></>}
        </div>
      </ScrollArea>
    </>
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{TriggerButton}</PopoverTrigger>
        <PopoverContent className="w-[300px]" align="start" sideOffset={5}>
          {SelectorContent}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{TriggerButton}</DrawerTrigger>
      <DrawerContent>
        <div className="mt-4 border-t p-4">{SelectorContent}</div>
      </DrawerContent>
    </Drawer>
  );
}
