import { useActiveCompany } from '@/stores/companiesStore';
import { useAuthStore } from '@/stores/authStore';
import { PmWorkspace } from './v2/PmWorkspace';
import { PpWorkspace } from './v2/PpWorkspace';
import type { LegalForm } from '@/api/types';
import './v2/workspace-v2-theme.css';

/** Formes juridiques considérées PM (personne morale) */
const PM_FORMS: LegalForm[] = ['sa', 'sca', 'sarl', 'cooperative', 'sa_etrangere', 'snc', 'senc'];

export function WorkspaceV2() {
  const company = useActiveCompany();
  // BUG-6 RGPD fix : clé de remontage forcé au switch tenant — garantit que
  // PpWorkspace/PmWorkspace est re-créé avec le bon tenant, sans aucun state résiduel.
  const activeTenantId = useAuthStore((s) => s.activeTenantId);

  // SA, Sàrl, Coopérative, SNC, SEnC → PM
  // raison_individuelle, société_simple, association, fondation, autre → PP
  // Override: ?v2variant=pm pour forcer PM, ?v2variant=pp pour forcer PP
  // BUG-7 fix : la détection se base sur company.legalForm, pas ?v2variant (déprecié)
  const urlParams = new URLSearchParams(window.location.search);
  const forceVariant = urlParams.get('v2variant');
  const isPm = forceVariant === 'pp'
    ? false  // force PP même si legalForm est PM
    : forceVariant === 'pm'
      ? true  // force PM
      : !!(company?.legalForm && PM_FORMS.includes(company.legalForm));

  return (
    <div className="workspace-v2-theme absolute inset-0 flex flex-col">
      {/* key={activeTenantId} force le remontage complet au switch tenant (isolation RGPD) */}
      {isPm
        ? <PmWorkspace key={`pm-${activeTenantId ?? 'default'}`} />
        : <PpWorkspace key={`pp-${activeTenantId ?? 'default'}`} />
      }
    </div>
  );
}
