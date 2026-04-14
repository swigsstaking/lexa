import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Home } from '@/routes/Home';
import { Onboarding } from '@/routes/Onboarding';
import { Dashboard } from '@/routes/Dashboard';
import { Chat } from '@/routes/Chat';
import { Ledger } from '@/routes/Ledger';
import { useCompanyStore } from '@/stores/companyStore';

function RequireCompany({ children }: { children: React.ReactNode }) {
  const company = useCompanyStore((s) => s.company);
  if (!company) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route
        element={
          <RequireCompany>
            <AppShell />
          </RequireCompany>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/chat" element={<Chat />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
