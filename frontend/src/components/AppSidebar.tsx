import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarFooter,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/context/AuthContext/AuthContext';
import { useNoteEditor } from '@/context/NoteEditorContext';
import {
  Bot,
  BrainCog,
  ChevronsUpDownIcon,
  Cog,
  MessageCircle,
  Notebook,
  PlusIcon,
  UserCogIcon,
  Users,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { Button } from './ui/button';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const fakeThreads = [
  {
    id: '1',
    title: 'React Performance Optimization',
    lastMessage: 'How to optimize React components for better performance?',
  },
  { id: '2', title: 'TypeScript Best Practices' },
  { id: '3', title: 'Database Design Discussion' },
  { id: '4', title: 'API Security Implementation' },
  { id: '5', title: 'CSS Grid vs Flexbox' },
  { id: '6', title: 'State Management Solutions' },
  { id: '7', title: 'Testing Strategies' },
  { id: '8', title: 'Docker Containerization' },
  { id: '9', title: 'GraphQL Implementation' },
  { id: '10', title: 'PWA Development' },
  { id: '11', title: 'Accessibility Guidelines' },
  { id: '12', title: 'Performance Monitoring' },
  { id: '13', title: 'Code Splitting Techniques' },
  { id: '14', title: 'Error Boundary Setup' },
  { id: '15', title: 'Build Optimization' },
  { id: '16', title: 'Microservices Architecture' },
  { id: '17', title: 'WebSocket Implementation' },
  { id: '18', title: 'SEO Best Practices' },
  { id: '19', title: 'Mobile Responsive Design' },
  { id: '20', title: 'CI/CD Pipeline Setup' },
  { id: '21', title: 'Serverless Functions' },
  { id: '22', title: 'Data Visualization' },
  { id: '23', title: 'Authentication Patterns' },
  { id: '24', title: 'Caching Strategies' },
  { id: '25', title: 'Monitoring & Logging' },
];

export function AppSidebar() {
  const { t } = useTranslation();

  const menu = useMemo(
    () => ({
      pages: [
        {
          title: t('personal_notes'),
          description: t('personal_notes_description'),
          icon: <Notebook className="h-6 w-6" />,
          url: '/notes',
        },
        {
          title: t('ai_assistant'),
          description: t('ai_assistant_description'),
          icon: <Bot className="h-6 w-6" />,
          url: '/',
        },
      ],
      adminPages: [
        {
          title: t('admin_notes'),
          description: t('admin_notes_description'),
          icon: <MessageCircle className="h-6 w-6" />,
          url: '/admin/notes',
          adminOnly: true,
        },
        {
          title: t('user_management'),
          description: t('user_management_description'),
          icon: <Users className="h-6 w-6" />,
          url: '/admin/users',
          adminOnly: true,
        },
      ],
    }),
    [t]
  );

  const { isAdmin } = useAuth();
  const { setOpenMobile } = useSidebar();

  const handleNavigation = (url?: string) => {
    setOpenMobile(false);
  };

  const { openEditor } = useNoteEditor();

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarGroupContent>
          <div className="flex justify-between items-center mb-2 px-1">
            <div className="font-bold text-lg">MySert AI</div>
            <Button variant="ghost" asChild>
              <NavLink to={'/settings'} className="h-fit grid py-3 text-base" onClick={() => handleNavigation()}>
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
                <Button className="w-full justify-between font-black bg-destructive/25" size="lg" variant="secondary">
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
                          className="h-fit grid py-3 text-base"
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
                    className="h-fit grid py-3 text-base transition-all"
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
      {/* <SidebarContent>
        <SidebarGroup className="relative">
          <Input
            className="sticky top-2 z-10 backdrop-blur-lg"
            id="search-threads"
            placeholder="Search threads"
          ></Input>

          <SidebarGroupContent className="text-foreground/75 mt-2.5">
            <SidebarMenu>
              {fakeThreads.map(thread => (
                <SidebarMenuItem key={thread.id}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={`/thread/${thread.id}`}
                      className="h-fit grid py-2"
                      onClick={() => handleNavigation(`/thread/${thread.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{thread.title}</span>
                      </div>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent> */}
      <SidebarFooter />
    </Sidebar>
  );
}
