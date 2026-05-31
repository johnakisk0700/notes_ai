import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { useAccount } from '@/context/AuthContext/useAccount';
import { useNoteEditor } from '@/context/NoteEditorContext';
import { useThreads } from '@/context/ThreadsContext';
import { DEV_AUTH_BYPASS } from '@/integrations/devAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Logo } from '@/components/Common/Logo';
import {
  ChevronsUpDownIcon,
  LogOut,
  MessageCircle,
  MessageSquarePlus,
  Notebook,
  PenLine,
  SlidersHorizontal,
  Trash2,
  Users,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { Button } from './ui/button';
import { useMemo, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

export function AppSidebar() {
  const { t } = useTranslation();

  const menu = useMemo(
    () => ({
      pages: [
        {
          title: t('personal_notes'),
          description: t('personal_notes_description'),
          icon: <Notebook className="size-5" />,
          url: '/notes',
        },
      ],
      adminPages: [
        {
          title: t('admin_notes'),
          description: t('admin_notes_description'),
          icon: <MessageCircle className="size-5" />,
          url: '/admin/notes',
          adminOnly: true,
        },
        {
          title: t('user_management'),
          description: t('user_management_description'),
          icon: <Users className="size-5" />,
          url: '/admin/users',
          adminOnly: true,
        },
      ],
    }),
    [t]
  );

  const { isAdmin } = useAuth();
  const { setOpenMobile } = useSidebar();
  const { threads, removeThread } = useThreads();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (_url?: string) => {
    setOpenMobile(false);
  };

  const handleNewChat = () => {
    setOpenMobile(false);
    navigate('/');
  };

  const handleDeleteThread = async (e: MouseEvent, id: string) => {
    // The delete control sits over the NavLink — don't let it navigate.
    e.preventDefault();
    e.stopPropagation();
    try {
      await removeThread(id);
      // If we just deleted the open thread, fall back to a fresh chat.
      if (location.pathname === `/thread/${id}`) navigate('/');
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to delete thread:', err);
    }
  };

  const { openEditor } = useNoteEditor();

  return (
    <Sidebar>
      <SidebarHeader className="gap-0 p-2 md:pr-4">
        {/* Title row roughly level with the floating sidebar toggle, so the controls
            sit at a similar height across the sidebar/page edge. */}
        <div className="mb-2 flex h-10 items-center justify-between px-1">
          <Logo />
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" asChild>
            <NavLink to={'/settings'} aria-label="Settings" onClick={() => handleNavigation()}>
              <SlidersHorizontal />
            </NavLink>
          </Button>
        </div>

        <div className="grid gap-1.5">
          <Button className="h-10 w-full justify-between px-3 font-semibold shadow-sm" onClick={() => openEditor()}>
            {t('new_note')} <PenLine />
          </Button>
          <Button
            variant="ghost"
            className="h-10 w-full justify-between border border-transparent px-3 font-medium text-sidebar-foreground hover:border-sidebar-border hover:bg-sidebar-accent/60"
            onClick={handleNewChat}
          >
            {t('new_chat')} <MessageSquarePlus />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="gap-3 pt-1 md:pr-4">
          <SidebarMenu>
            {menu.pages.map(item => (
              <SidebarMenuItem key={item.title} className="rounded-md border">
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    className="grid h-fit py-2.5 text-sm transition-all"
                    onClick={() => handleNavigation(item.url)}
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.title}</span>
                    </div>

                    <p className="text-xs text-foreground/50">{item.description}</p>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>

          {isAdmin && (
            <Collapsible className="border-t border-sidebar-border/70 pt-2">
              <CollapsibleTrigger asChild>
                <Button
                  className="h-9 w-full justify-between px-2 font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  size="sm"
                  variant="ghost"
                >
                  {t('administration')} <ChevronsUpDownIcon />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 rounded-lg bg-sidebar-accent/30 p-0.5">
                <SidebarMenu>
                  {menu.adminPages.map(item => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          className="grid h-fit py-2.5 text-sm"
                          onClick={() => handleNavigation(item.url)}
                        >
                          <div className="flex items-center gap-2">
                            {item.icon}
                            <span>{item.title}</span>
                          </div>

                          <p className="mt-0.5 pl-7 text-xs leading-snug text-sidebar-foreground/55">
                            {item.description}
                          </p>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </Collapsible>
          )}

          {threads.length > 0 && (
            <SidebarGroupContent className="border-t border-sidebar-border/70 pt-2 text-sidebar-foreground/75">
              <div className="px-2 pb-1.5 font-serif text-[0.82rem] tracking-tight text-sidebar-foreground/55">
                {t('recent_chats')}
              </div>
              <SidebarMenu>
                {threads.map(thread => (
                  <SidebarMenuItem key={thread.id} className="group/thread relative">
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={`/thread/${thread.id}`}
                        className="nb-thread h-fit py-2 pr-8"
                        onClick={() => handleNavigation(`/thread/${thread.id}`)}
                      >
                        <span className="nb-thread-title truncate">{thread.title || t('untitled_thread')}</span>
                      </NavLink>
                    </SidebarMenuButton>
                    <button
                      type="button"
                      aria-label={t('delete_thread')}
                      title={t('delete_thread')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-sidebar-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover/thread:opacity-100"
                      onClick={e => handleDeleteThread(e, thread.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <AccountFooter />
      </SidebarFooter>
    </Sidebar>
  );
}

// A compact account strip pinned to the sidebar bottom: avatar + name link through to
// Settings, with a quick sign-out beside it. Logout is hidden under the dev bypass
// (no Clerk session to end) — the full account controls still live on the Settings page.
function AccountFooter() {
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();
  const { user, isAdmin, name, email, initials, signOut } = useAccount();

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/30 p-1.5">
      <NavLink
        to="/settings"
        aria-label={t('account')}
        onClick={() => setOpenMobile(false)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 transition-colors hover:bg-sidebar-accent/60"
      >
        <Avatar size="sm">
          {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt={name} /> : null}
          <AvatarFallback className="font-medium">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-sidebar-foreground">{name}</div>
          <div className="truncate text-xs text-sidebar-foreground/55">
            {email || (isAdmin ? t('role_admin') : t('role_user'))}
          </div>
        </div>
      </NavLink>

      {!DEV_AUTH_BYPASS ? (
        <button
          type="button"
          onClick={signOut}
          aria-label={t('sign_out')}
          title={t('sign_out')}
          className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
