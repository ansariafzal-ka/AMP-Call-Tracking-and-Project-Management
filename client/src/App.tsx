import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminCallsPage } from './pages/AdminCallsPage';
import { AdminProjectsPage } from './pages/AdminProjectsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminContactsPage } from './pages/AdminContactsPage';
import { CallerContactsPage } from './pages/CallerContactsPage';
import { FollowUpsPage } from './pages/FollowUpsPage';
import { SettingsPage } from './pages/SettingsPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-maroon border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AdminProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-maroon border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const SmartDashboardRoute: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <DashboardPage />;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-maroon border-t-transparent animate-spin" />
      </div>
    );
  }

  if (token) {
    return <Navigate to={user?.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />;
  }

  return <>{children}</>;
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnlyRoute>
                <RegisterPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* Caller or Auto-Redirect Dashboard */}
            <Route path="/dashboard" element={<SmartDashboardRoute />} />
            <Route path="/contacts" element={<CallerContactsPage />} />
            <Route path="/follow-ups" element={<FollowUpsPage />} />

            {/* Admin Dedicated Dashboard */}
            <Route
              path="/admin/dashboard"
              element={
                <AdminProtectedRoute>
                  <AdminDashboardPage />
                </AdminProtectedRoute>
              }
            />

            {/* Admin Team Call Logs */}
            <Route
              path="/admin/calls"
              element={
                <AdminProtectedRoute>
                  <AdminCallsPage />
                </AdminProtectedRoute>
              }
            />

            {/* Admin Projects Management */}
            <Route
              path="/admin/projects"
              element={
                <AdminProtectedRoute>
                  <AdminProjectsPage />
                </AdminProtectedRoute>
              }
            />

            {/* Admin Contacts Database */}
            <Route
              path="/admin/contacts"
              element={
                <AdminProtectedRoute>
                  <AdminContactsPage />
                </AdminProtectedRoute>
              }
            />

            {/* Admin Users & Targets */}
            <Route
              path="/admin/users"
              element={
                <AdminProtectedRoute>
                  <AdminUsersPage />
                </AdminProtectedRoute>
              }
            />

            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
