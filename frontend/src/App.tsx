import React, { Suspense } from 'react';
import { Outlet, Route, Routes } from 'react-router';
import ProtectedRoute from './context/AuthContext/ProtectedRoute';
import { StreamChatProvider } from './context/StreamChatContext';
import Layout from './Layout';
import AdminGuard from './context/AuthContext/AdminGuard';

const AdminNotes = React.lazy(() => import('./pages/AdminNotesPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const SSOCallbackPage = React.lazy(() =>
  import('./pages/SSOCallbackPage').then((m) => ({ default: m.SSOCallbackPage })),
);
const OnboardingPage = React.lazy(() =>
  import('./pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const MainChatPage = React.lazy(() =>
  import('./pages/MainChatPage').then((m) => ({ default: m.MainChatPage })),
);
const NotesPage = React.lazy(() => import('./pages/NotesPage').then((m) => ({ default: m.NotesPage })));
const UserManagementPage = React.lazy(() =>
  import('./pages/UserManagementPage').then((m) => ({ default: m.UserManagementPage })),
);
const SettingsPage = React.lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

// One StreamChatProvider shared by "/" and "/thread/:thread". Because it lives
// on a layout route (not each page element), navigating between the two — e.g.
// when the first message of a new chat redirects to /thread/:id — does not
// remount it, so the in-flight stream and message state survive.
function ChatLayout() {
  return (
    <StreamChatProvider>
      <Outlet />
    </StreamChatProvider>
  );
}

function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/auth" element={<LoginPage />} />
        <Route path="/sso-callback" element={<SSOCallbackPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route element={<ChatLayout />}>
              <Route path="/" element={<MainChatPage />} />
              <Route path="/thread/:thread" element={<MainChatPage />} />
            </Route>

            <Route path="/notes" element={<NotesPage />} />

            <Route path="/settings" element={<SettingsPage />} />

            <Route element={<AdminGuard />}>
              <Route path="/admin/notes" element={<AdminNotes />} />

              <Route path="/admin/users" element={<UserManagementPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
