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
  // Détection basée uniquement sur company.legalForm (le param ?v2variant était un override
  // de debug temporaire, retiré : il restait collé à l'URL après switch de tenant et
  // forçait la mauvaise vue, cf. switch Demo V2 SA depuis URL ?v2variant=pp).
  const isPm = !!(company?.legalForm && PM_FORMS.includes(company.legalForm));

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
