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
import { useNoteEditor } from '@/context/NoteEditorContext';
import { useThreads } from '@/context/ThreadsContext';
import { Bot, ChevronsUpDownIcon, Cog, MessageCircle, Notebook, PlusIcon, Trash2, Users } from 'lucide-react';
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
        {
          title: t('ai_assistant'),
          description: t('ai_assistant_description'),
          icon: <Bot className="size-5" />,
          url: '/',
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
      console.error('Failed to delete thread:', err);
    }
  };

  const { openEditor } = useNoteEditor();

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarGroupContent>
          <div className="flex justify-between items-center mb-2 px-1">
            <div className="font-serif text-xl tracking-tight">Mneme</div>
            <Button variant="ghost" asChild>
              <NavLink to={'/settings'} className="h-fit grid py-2.5 text-sm" onClick={() => handleNavigation()}>
                <Cog />
              </NavLink>
            </Button>
          </div>

          <Button className="size-10 w-full justify-between font-bold mb-2" size="lg" onClick={() => openEditor()}>
            {t('new_note')} <PlusIcon />
          </Button>

          {isAdmin && (
            <Collapsible className="mb-2">
              <CollapsibleTrigger asChild>
                <Button className="w-full justify-between font-semibold bg-destructive/20" size="lg" variant="secondary">
                  {t('administration')} <ChevronsUpDownIcon />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-0.5 bg-destructive/15 rounded-lg">
                <SidebarMenu>
                  {menu.adminPages.map(item => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          className="h-fit grid py-2.5 text-sm"
                          onClick={() => handleNavigation(item.url)}
                        >
                          <div className="flex items-center gap-2">
                            {item.icon}
                            <span>{item.title}</span>
                          </div>

                          <p className="text-foreground/50 text-xs">{item.description}</p>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </Collapsible>
          )}

          <SidebarMenu>
            {menu.pages.map(item => (
              <SidebarMenuItem key={item.title} className="border-1 rounded-md">
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    className="h-fit grid py-2.5 text-sm transition-all"
                    onClick={() => handleNavigation(item.url)}
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.title}</span>
                    </div>

                    <p className="text-foreground/50 text-xs">{item.description}</p>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <Button
            variant="secondary"
            className="w-full justify-between font-bold mb-2"
            size="lg"
            onClick={handleNewChat}
          >
            {t('new_chat')} <PlusIcon />
          </Button>

          {threads.length > 0 && (
            <SidebarGroupContent className="text-foreground/75">
              <div className="px-1 py-1 text-xs font-medium text-foreground/50">{t('recent_chats')}</div>
              <SidebarMenu>
                {threads.map(thread => (
                  <SidebarMenuItem key={thread.id} className="group/thread relative">
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={`/thread/${thread.id}`}
                        className={({ isActive }) =>
                          `h-fit py-2 pr-8 ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}`
                        }
                        onClick={() => handleNavigation(`/thread/${thread.id}`)}
                      >
                        <span className="truncate">{thread.title || t('untitled_thread')}</span>
                      </NavLink>
                    </SidebarMenuButton>
                    <button
                      type="button"
                      aria-label={t('delete_thread')}
                      title={t('delete_thread')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover/thread:opacity-100"
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
      <SidebarFooter />
    </Sidebar>
  );
}
