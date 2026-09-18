import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { ErrorBoundary } from './shared/components';
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
      <AppProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
