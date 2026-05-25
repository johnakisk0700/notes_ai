import { Outlet, Route, Routes } from 'react-router';
import ProtectedRoute from './context/AuthContext/ProtectedRoute';
import { StreamChatProvider } from './context/StreamChatContext';
import Layout from './Layout';
import AdminNotes from './pages/AdminNotesPage';
import { LoginPage } from './pages/LoginPage';
import { MainChatPage } from './pages/MainChatPage';
import { NotesPage } from './pages/NotesPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { SettingsPage } from './pages/SettingsPage';
import AdminGuard from './context/AuthContext/AdminGuard';

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
    <Routes>
      <Route path="/auth" element={<LoginPage />} />

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
  );
}

export default App;
