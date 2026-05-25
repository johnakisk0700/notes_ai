import { Route, Routes } from 'react-router';
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

function App() {
  return (
    <Routes>
      <Route path="/auth" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={
              <StreamChatProvider>
                <MainChatPage />
              </StreamChatProvider>
            }
          />

          <Route
            path="/thread/:thread"
            element={
              <StreamChatProvider>
                <MainChatPage />
              </StreamChatProvider>
            }
          />

          <Route path="/notes" element={<NotesPage />} />

          <Route path="/settings" element={<SettingsPage />} />

          <Route element={<AdminGuard />}>
            <Route path="/admin/notes" element={<AdminNotes></AdminNotes>} />

            <Route path="/admin/users" element={<UserManagementPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
