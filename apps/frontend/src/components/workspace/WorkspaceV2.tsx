import { useActiveCompany } from '@/stores/companiesStore';
import { PmWorkspace } from './v2/PmWorkspace';
import { PpWorkspace } from './v2/PpWorkspace';
import type { LegalForm } from '@/api/types';
import './v2/workspace-v2-theme.css';

/** Formes juridiques considérées PM (personne morale) */
const PM_FORMS: LegalForm[] = ['sa', 'sca', 'sarl', 'cooperative', 'sa_etrangere', 'snc', 'senc'];

export function WorkspaceV2() {
  const company = useActiveCompany();

  // SA, Sàrl, Coopérative, SNC, SEnC → PM
  // raison_individuelle, société_simple, association, fondation, autre → PP
  // Override: ?v2variant=pm pour forcer PM en preview/test
  const urlParams = new URLSearchParams(window.location.search);
  const forceVariant = urlParams.get('v2variant');
  const isPm = forceVariant === 'pm'
    || (company?.legalForm && PM_FORMS.includes(company.legalForm));

  return (
    <div className="workspace-v2-theme absolute inset-0 flex flex-col">
      {isPm ? <PmWorkspace /> : <PpWorkspace />}
    </div>
  );
}
