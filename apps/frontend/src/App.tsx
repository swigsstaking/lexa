import { Navigate, Route, Routes } from 'react-router-dom';
import { Home } from '@/routes/Home';
import { Login } from '@/routes/Login';
import { Register } from '@/routes/Register';
import { Onboarding } from '@/routes/Onboarding';
import { Workspace } from '@/routes/Workspace';
import { Documents } from '@/routes/Documents';
import { TaxpayerWizardCanton } from '@/routes/taxpayer/TaxpayerWizardCanton';
import { PmWizardVs } from '@/routes/company/PmWizardVs';
import { cantonGE } from '@/config/cantons/ge';
import { cantonVD } from '@/config/cantons/vd';
import { cantonVS } from '@/config/cantons/vs';
import { cantonFR } from '@/config/cantons/fr';
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
            <TaxpayerWizardCanton canton={cantonGE} />
          </RequireAuth>
        }
      />
      <Route
        path="/taxpayer/vd/:year"
        element={
          <RequireAuth>
            <TaxpayerWizardCanton canton={cantonVD} />
          </RequireAuth>
        }
      />
      <Route
        path="/taxpayer/fr/:year"
        element={
          <RequireAuth>
            <TaxpayerWizardCanton canton={cantonFR} />
          </RequireAuth>
        }
      />
      <Route
        path="/taxpayer/:year"
        element={
          <RequireAuth>
            <TaxpayerWizardCanton canton={cantonVS} />
          </RequireAuth>
        }
      />
      <Route
        path="/documents"
        element={
          <RequireAuth>
            <Documents />
          </RequireAuth>
        }
      />
      {/* PM wizard — Personnes Morales (session 27) */}
      <Route
        path="/pm/vs/:year"
        element={
          <RequireAuth>
            <PmWizardVs />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
