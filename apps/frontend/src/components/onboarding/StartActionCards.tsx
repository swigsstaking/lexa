import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Landmark, FileText, FileSignature } from 'lucide-react';
import { useActiveCompany } from '@/stores/companiesStore';

type ActionKey = 'camt053' | 'ocr' | 'tax';

interface StartActionCardsProps {
  onSelect?: (key: ActionKey) => void;
}

export function StartActionCards({ onSelect }: StartActionCardsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const company = useActiveCompany();

  const year = new Date().getFullYear();

  function getTaxPath(): string {
    const legalForm = company?.legalForm ?? 'raison_individuelle';
    const canton = (company?.canton ?? 'VS').toUpperCase();

    const isPM = legalForm === 'sarl' || legalForm === 'sa' || legalForm === 'cooperative';

    if (isPM) {
      const pmCantons = ['VS', 'GE', 'VD', 'FR', 'NE', 'JU', 'BJ'];
      const c = pmCantons.includes(canton) ? canton.toLowerCase() : 'vs';
      return `/pm/${c}/${year}`;
    }

    // PP (raison_individuelle, association, fondation, autre)
    if (canton === 'GE') return `/taxpayer/ge/${year}`;
    if (canton === 'VD') return `/taxpayer/vd/${year}`;
    if (canton === 'FR') return `/taxpayer/fr/${year}`;
    if (canton === 'NE') return `/taxpayer/ne/${year}`;
    if (canton === 'JU') return `/taxpayer/ju/${year}`;
    if (canton === 'BJ') return `/taxpayer/bj/${year}`;
    return `/taxpayer/${year}`;
  }

  function handleAction(key: ActionKey) {
    if (onSelect) {
      onSelect(key);
      return;
    }
    if (key === 'camt053') {
      navigate('/documents', { state: { focus: 'camt053' } });
    } else if (key === 'ocr') {
      navigate('/documents', { state: { focus: 'ocr' } });
    } else {
      navigate(getTaxPath());
    }
  }

  const cards: Array<{
    key: ActionKey;
    Icon: typeof Landmark;
    title: string;
    desc: string;
    badge: string;
  }> = [
    {
      key: 'camt053',
      Icon: Landmark,
      title: t('welcome.cta.camt053.title'),
      desc: t('welcome.cta.camt053.desc'),
      badge: t('welcome.cta.camt053.badge'),
    },
    {
      key: 'ocr',
      Icon: FileText,
      title: t('welcome.cta.ocr.title'),
      desc: t('welcome.cta.ocr.desc'),
      badge: t('welcome.cta.ocr.badge'),
    },
    {
      key: 'tax',
      Icon: FileSignature,
      title: t('welcome.cta.tax.title'),
      desc: t('welcome.cta.tax.desc'),
      badge: t('welcome.cta.tax.badge'),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map(({ key, Icon, title, desc, badge }) => (
        <button
          key={key}
          type="button"
          onClick={() => handleAction(key)}
          className="card-elevated p-6 text-left hover:border-accent/40 transition-colors"
        >
          <Icon className="w-6 h-6 text-accent mb-3" />
          <h3 className="text-base font-semibold text-ink mb-2">{title}</h3>
          <p className="text-sm text-muted mb-3">{desc}</p>
          <span className="text-2xs text-muted uppercase tracking-wider">{badge}</span>
        </button>
      ))}
    </div>
  );
}
