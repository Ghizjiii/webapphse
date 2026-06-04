import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import QuestionnairePage from './pages/QuestionnairePage';
import PublicFormPage from './pages/PublicFormPage';
import ReferencePage from './pages/ReferencePage';
import AdminUsersPage from './pages/AdminUsersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ConnectionWarningModal from './components/ConnectionWarningModal';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ConnectionWarningModal />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/form/:token" element={<PublicFormPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/questionnaire/:id"
              element={
                <ProtectedRoute>
                  <QuestionnairePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/analytics"
              element={
                <ProtectedRoute requireAdmin>
                  <AnalyticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/reference"
              element={
                <ProtectedRoute requireAdmin>
                  <ReferencePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
