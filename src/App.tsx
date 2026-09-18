import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { I18nProvider } from './shared/i18n';
import { ErrorBoundary } from './shared/components';
import { LifecycleRunner } from './features/notifications';
import { AuthGate } from './pages/AuthGate';
import { Landing, Wizard, Dashboard } from './pages';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/wizard" element={<Wizard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppProvider>
          {/* Router wraps the auth gate so the login screen can navigate. */}
          <BrowserRouter>
            <AuthGate>
              <AppRoutes />
            </AuthGate>
          </BrowserRouter>
          {/* Simulated backend clock: fires the verified/approved/finalised SMS + WhatsApp milestones. */}
          <LifecycleRunner />
        </AppProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

export default App;
