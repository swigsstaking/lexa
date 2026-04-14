import { Navigate, Route, Routes } from 'react-router-dom';
import { Home } from '@/routes/Home';
import { Onboarding } from '@/routes/Onboarding';
import { Workspace } from '@/routes/Workspace';
import { useActiveCompany } from '@/stores/companiesStore';

function RequireCompany({ children }: { children: React.ReactNode }) {
  const company = useActiveCompany();
  if (!company) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route
        path="/workspace"
        element={
          <RequireCompany>
            <Workspace />
          </RequireCompany>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
