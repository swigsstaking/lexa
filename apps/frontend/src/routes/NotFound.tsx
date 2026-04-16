/**
 * NotFound — Page 404 personnalisée (BUG-T03)
 * Design sobre cohérent avec le dark mode Lexa.
 */
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg text-ink grid place-items-center px-4">
      <div className="text-center">
        <div className="text-7xl font-bold text-accent/30 select-none mb-4 mono-num">
          404
        </div>
        <h1 className="text-xl font-semibold mb-2">Page introuvable</h1>
        <p className="text-sm text-muted mb-8 max-w-xs">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <button
          onClick={() => navigate('/workspace')}
          className="btn-primary"
        >
          <Home className="w-4 h-4" />
          Retour au workspace
        </button>
      </div>
    </div>
  );
}
