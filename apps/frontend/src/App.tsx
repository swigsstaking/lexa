import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Home } from '@/routes/Home';
import { Login } from '@/routes/Login';
import { Register } from '@/routes/Register';
import { SsoCallback } from '@/routes/SsoCallback';
import { Onboarding } from '@/routes/Onboarding';
import { Welcome } from '@/routes/Welcome';
import { Workspace } from '@/routes/Workspace';
import { NotFound } from '@/routes/NotFound';
import { cantonGE } from '@/config/cantons/ge';
import { cantonVD } from '@/config/cantons/vd';
import { cantonVS } from '@/config/cantons/vs';
import { cantonFR } from '@/config/cantons/fr';
import { cantonNE } from '@/config/cantons/ne';
import { cantonJU } from '@/config/cantons/ju';
import { cantonBJ } from '@/config/cantons/bj';
import { useAuthStore } from '@/stores/authStore';

// Lazy-loaded heavy routes (code splitting S36)
const Fiduciaire = lazy(() =>
  import('@/routes/Fiduciaire').then((m) => ({ default: m.Fiduciaire }))
);
const TaxpayerWizardCanton = lazy(() =>
  import('@/routes/taxpayer/TaxpayerWizardCanton').then((m) => ({
    default: m.TaxpayerWizardCanton,
  }))
);
const PmWizardVs = lazy(() =>
  import('@/routes/company/PmWizardVs').then((m) => ({ default: m.PmWizardVs }))
);
const PmWizardCanton = lazy(() =>
  import('@/routes/company/PmWizardCanton').then((m) => ({
    default: m.PmWizardCanton,
  }))
);
const DocumentsRouter = lazy(() =>
  import('@/routes/DocumentsRouter').then((m) => ({ default: m.DocumentsRouter }))
);
const CloseYear = lazy(() =>
  import('@/routes/close/CloseYear').then((m) => ({ default: m.CloseYear }))
);
const AuditYear = lazy(() =>
  import('@/routes/audit/AuditYear').then((m) => ({ default: m.AuditYear }))
);
const Conseiller = lazy(() =>
  import('@/routes/conseiller/Conseiller').then((m) => ({
    default: m.Conseiller,
  }))
);
const EmailForwardSettings = lazy(() =>
  import('@/routes/settings/EmailForwardSettings').then((m) => ({
    default: m.EmailForwardSettings,
  }))
);
const ProSyncSettings = lazy(() =>
  import('@/routes/settings/ProSyncSettings').then((m) => ({
    default: m.ProSyncSettings,
  }))
);
const SettingsIndex = lazy(() =>
  import('@/routes/settings/SettingsIndex').then((m) => ({
    default: m.SettingsIndex,
  }))
);
const AppearanceSettings = lazy(() =>
  import('@/routes/settings/AppearanceSettings').then((m) => ({
    default: m.AppearanceSettings,
  }))
);
const AddAccount = lazy(() =>
  import('@/routes/onboarding/AddAccount').then((m) => ({ default: m.AddAccount }))
);
// BUG-P2-06 : redirect /pp/:canton/:year → /taxpayer/:year (VS) ou /taxpayer/:canton/:year
function RedirectToTaxpayer() {
  const { canton, year } = useParams<{ canton: string; year: string }>();
  const cantonUpper = canton?.toUpperCase();
  if (cantonUpper === 'VS') {
    return <Navigate to={`/taxpayer/${year ?? '2026'}`} replace />;
  }
  if (['GE', 'VD', 'FR', 'NE', 'JU', 'BJ'].includes(cantonUpper ?? '')) {
    return <Navigate to={`/taxpayer/${cantonUpper!.toLowerCase()}/${year ?? '2026'}`} replace />;
  }
  return <Navigate to="/workspace" replace />;
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <Loader2 className="w-8 h-8 animate-spin text-accent" />
    </div>
  );
}

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
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* V1.1 SSO — callback depuis apps.swigs.online */}
        <Route path="/sso-callback" element={<SsoCallback />} />
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
          path="/welcome"
          element={
            <RequireAuth>
              <Welcome />
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
          path="/taxpayer/ne/:year"
          element={
            <RequireAuth>
              <TaxpayerWizardCanton canton={cantonNE} />
            </RequireAuth>
          }
        />
        <Route
          path="/taxpayer/ju/:year"
          element={
            <RequireAuth>
              <TaxpayerWizardCanton canton={cantonJU} />
            </RequireAuth>
          }
        />
        <Route
          path="/taxpayer/bj/:year"
          element={
            <RequireAuth>
              <TaxpayerWizardCanton canton={cantonBJ} />
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
              <DocumentsRouter />
            </RequireAuth>
          }
        />
        {/* PM wizard — Personnes Morales (session 27 VS + session 28 GE/VD/FR) */}
        <Route
          path="/pm/vs/:year"
          element={
            <RequireAuth>
              <PmWizardVs />
            </RequireAuth>
          }
        />
        <Route
          path="/pm/ge/:year"
          element={
            <RequireAuth>
              <PmWizardCanton canton="GE" />
            </RequireAuth>
          }
        />
        <Route
          path="/pm/vd/:year"
          element={
            <RequireAuth>
              <PmWizardCanton canton="VD" />
            </RequireAuth>
          }
        />
        <Route
          path="/pm/fr/:year"
          element={
            <RequireAuth>
              <PmWizardCanton canton="FR" />
            </RequireAuth>
          }
        />
        {/* PM wizard — Neuchâtel, Jura, Jura bernois (session 35) */}
        <Route
          path="/pm/ne/:year"
          element={
            <RequireAuth>
              <PmWizardCanton canton="NE" />
            </RequireAuth>
          }
        />
        <Route
          path="/pm/ju/:year"
          element={
            <RequireAuth>
              <PmWizardCanton canton="JU" />
            </RequireAuth>
          }
        />
        <Route
          path="/pm/bj/:year"
          element={
            <RequireAuth>
              <PmWizardCanton canton="BJ" />
            </RequireAuth>
          }
        />
        {/* Clôture continue — Session 29 */}
        <Route
          path="/close/:year"
          element={
            <RequireAuth>
              <CloseYear />
            </RequireAuth>
          }
        />
        {/* Audit intégrité IA — Session 30 */}
        <Route
          path="/audit/:year"
          element={
            <RequireAuth>
              <AuditYear />
            </RequireAuth>
          }
        />
        {/* Conseiller fiscal proactif — Session 31 */}
        <Route
          path="/conseiller/:year"
          element={
            <RequireAuth>
              <Conseiller />
            </RequireAuth>
          }
        />
        {/* BUG-P2-06 : redirect /pp/:canton/:year → /taxpayer */}
        <Route
          path="/pp/:canton/:year"
          element={
            <RequireAuth>
              <RedirectToTaxpayer />
            </RequireAuth>
          }
        />
        {/* Settings — index hub */}
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsIndex />
            </RequireAuth>
          }
        />
        {/* Settings — apparence (thème light/dark) */}
        <Route
          path="/settings/appearance"
          element={
            <RequireAuth>
              <AppearanceSettings />
            </RequireAuth>
          }
        />
        {/* Settings — email forward (Phase 1 V1.2) */}
        <Route
          path="/settings/email-forward"
          element={
            <RequireAuth>
              <EmailForwardSettings />
            </RequireAuth>
          }
        />
        {/* Settings — Intégrations Swigs Pro (Phase 3 V1.1) */}
        <Route
          path="/settings/integrations/pro"
          element={
            <RequireAuth>
              <ProSyncSettings />
            </RequireAuth>
          }
        />
        {/* Onboarding — ajouter un compte additionnel */}
        <Route
          path="/onboarding/add-account"
          element={
            <RequireAuth>
              <AddAccount />
            </RequireAuth>
          }
        />
        {/* Portefeuille fiduciaire — vue cross-tenants */}
        <Route
          path="/fiduciaire"
          element={
            <RequireAuth>
              <Fiduciaire />
            </RequireAuth>
          }
        />
        {/* BUG-T03 : page 404 custom */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
