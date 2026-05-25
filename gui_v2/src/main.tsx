import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { UsersProvider } from './context/UsersContext/UsersProvider';
import { WineProvider } from './context/WineContext/WineProvider';
import { CustomerProvider } from './context/CustomerProvider';
import { BrowserRouter } from 'react-router';
import { ThemeProvider } from './context/ThemeContext/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { SidebarProvider } from './components/ui/sidebar';
import { NotesProvider } from './context/NotesContext';
import { NoteEditorProvider } from './context/NoteEditorContext';
import { NoteEditor } from './components/Notes/NoteEditor';
import { ClerkProvider } from '@clerk/clerk-react';
import './translations/i18n';

// Import your Publishable Key
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <BrowserRouter>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
          <UsersProvider>
            <WineProvider>
              <CustomerProvider>
                <NotesProvider>
                  <NoteEditorProvider>
                    <SidebarProvider>
                      <App />
                      <NoteEditor />
                    </SidebarProvider>
                  </NoteEditorProvider>
                </NotesProvider>
                <Toaster />
              </CustomerProvider>
            </WineProvider>
          </UsersProvider>
        </ClerkProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
