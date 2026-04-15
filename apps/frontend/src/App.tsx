import { Navigate, Route, Routes } from 'react-router-dom';
import { Home } from '@/routes/Home';
import { Login } from '@/routes/Login';
import { Register } from '@/routes/Register';
import { Onboarding } from '@/routes/Onboarding';
import { Workspace } from '@/routes/Workspace';
import { TaxpayerWizard } from '@/routes/taxpayer/TaxpayerWizard';
import { TaxpayerWizardGe } from '@/routes/taxpayer/TaxpayerWizardGe';
import { useAuthStore } from '@/stores/authStore';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/workspace" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <Register />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        path="/workspace"
        element={
          <RequireAuth>
            <Workspace />
          </RequireAuth>
        }
      />
      <Route
        path="/taxpayer/ge/:year"
        element={
          <RequireAuth>
            <TaxpayerWizardGe />
          </RequireAuth>
        }
      />
      <Route
        path="/taxpayer/:year"
        element={
          <RequireAuth>
            <TaxpayerWizard />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
