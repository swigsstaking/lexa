import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StartActionCards } from '@/components/onboarding/StartActionCards';
import { useActiveCompany } from '@/stores/companiesStore';

export function Welcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const company = useActiveCompany();

  const greeting = company?.name
    ? t('welcome.greeting', { company: company.name })
    : t('welcome.title');

  return (
    <div className="min-h-screen grid place-items-center px-6 bg-bg py-12">
      <div className="w-full max-w-3xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-accent text-accent-fg grid place-items-center font-semibold text-sm">
            L
          </div>
          <span className="text-lg font-semibold text-ink">{t('app.name')}</span>
        </div>

        {/* En-tête */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-ink mb-3">{greeting}</h1>
          <p className="text-sm text-muted max-w-md mx-auto">{t('welcome.subtitle')}</p>
        </div>

        {/* 3 cards CTAs */}
        <StartActionCards />

        {/* Lien skip */}
        <div className="text-center mt-8">
          <button
            type="button"
            onClick={() => navigate('/workspace')}
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            {t('welcome.explore_first')}
          </button>
        </div>
      </div>
    </div>
  );
}
