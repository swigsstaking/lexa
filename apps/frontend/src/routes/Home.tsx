import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Shield, Zap, BookOpen } from 'lucide-react';
import { useCompanyStore } from '@/stores/companyStore';

export function Home() {
  const company = useCompanyStore((s) => s.company);
  if (company) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-2xl w-full text-center"
      >
        <div className="inline-flex items-center gap-2 chip mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-lexa-success" />
          Backend v0.1 prêt — 5388 points KB
        </div>
        <h1 className="text-5xl md:text-6xl font-display mb-4 leading-tight">
          La compta PME suisse,
          <br />
          <span className="text-lexa-primary">pilotée par l'IA.</span>
        </h1>
        <p className="text-lg text-lexa-muted mb-10 max-w-xl mx-auto">
          Lexa classifie vos transactions, gère votre grand livre et répond à vos questions
          TVA et fiscales avec citations légales à l'appui.
        </p>

        <Link to="/onboarding" className="btn-primary text-base px-6 py-3">
          Commencer l'onboarding
          <ArrowRight className="w-4 h-4" />
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16">
          <Feature
            icon={Zap}
            title="Classification auto"
            text="lexa-classifier mappe chaque transaction au plan comptable Käfer"
          />
          <Feature
            icon={BookOpen}
            title="Grand livre auto-balancé"
            text="Event-sourced, chaque écriture est traçable et reversible"
          />
          <Feature
            icon={Shield}
            title="Conformité LTVA"
            text="Réponses citées LTVA, OLTVA, Info TVA, circulaires AFC"
          />
        </div>
      </motion.div>
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof Zap; title: string; text: string }) {
  return (
    <div className="card p-5 text-left">
      <Icon className="w-5 h-5 text-lexa-primary mb-3" />
      <div className="font-medium mb-1">{title}</div>
      <div className="text-sm text-lexa-muted">{text}</div>
    </div>
  );
}
