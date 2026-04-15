import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Shield, Zap, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';

export function Home() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/workspace" replace />;

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl w-full text-center"
      >
        <div className="inline-flex items-center gap-2 chip mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          {t('home.badge', { points: 5388 })}
        </div>
        <h1 className="text-5xl md:text-6xl mb-4 leading-tight font-semibold tracking-tight">
          {t('home.title_l1')}
          <br />
          <span className="text-accent">{t('home.title_l2')}</span>
        </h1>
        <p className="text-lg text-muted mb-10 max-w-xl mx-auto">
          {t('home.subtitle')}
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link to="/register" className="btn-primary text-base px-6 py-3">
            {t('home.cta')}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/login" className="btn-ghost text-base px-6 py-3">
            {t('auth.login_title')}
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16">
          <Feature
            icon={Zap}
            title={t('home.feature_classify')}
            text={t('home.feature_classify_text')}
          />
          <Feature
            icon={BookOpen}
            title={t('home.feature_ledger')}
            text={t('home.feature_ledger_text')}
          />
          <Feature
            icon={Shield}
            title={t('home.feature_vat')}
            text={t('home.feature_vat_text')}
          />
        </div>
      </motion.div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Zap;
  title: string;
  text: string;
}) {
  return (
    <div className="card p-5 text-left">
      <Icon className="w-5 h-5 text-accent mb-3" />
      <div className="font-medium mb-1">{title}</div>
      <div className="text-sm text-muted">{text}</div>
    </div>
  );
}
