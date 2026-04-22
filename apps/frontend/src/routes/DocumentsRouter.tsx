/**
 * Router Documents — dispatche selon le profile du tenant actif :
 *  - PP (RI, SS, null) → DocumentsPp (certificats salaire, 3a, fortune, etc.)
 *  - PM (SA, Sàrl, etc.) → Documents (factures fournisseurs, CAMT.053, grand livre)
 *
 * Même règle de détection que WorkspaceV2 et LexaCmdK.
 */

import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useActiveCompany } from '@/stores/companiesStore';
import type { LegalForm } from '@/api/types';

const PM_FORMS: LegalForm[] = ['sa', 'sca', 'sarl', 'cooperative', 'sa_etrangere', 'snc', 'senc'];

function detectProfile(legalForm: LegalForm | undefined): 'pp' | 'pm' {
  return legalForm && PM_FORMS.includes(legalForm) ? 'pm' : 'pp';
}

const DocumentsPm = lazy(() => import('@/routes/Documents').then((m) => ({ default: m.Documents })));
const DocumentsPp = lazy(() => import('@/routes/DocumentsPp').then((m) => ({ default: m.DocumentsPp })));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-accent" />
    </div>
  );
}

export function DocumentsRouter() {
  const activeCompany = useActiveCompany();
  const profile = detectProfile(activeCompany?.legalForm);

  return (
    <Suspense fallback={<LoadingScreen />}>
      {profile === 'pp' ? <DocumentsPp /> : <DocumentsPm />}
    </Suspense>
  );
}
