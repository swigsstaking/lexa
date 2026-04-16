import { useNavigate } from 'react-router-dom';
import { Laptop, Network } from 'lucide-react';
import { CanvasCore } from '@/components/canvas/CanvasCore';

function MobileFallback() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-screen p-8 text-center bg-stone-950">
      <Laptop className="w-12 h-12 text-stone-600 mb-4" />
      <h2 className="text-lg font-semibold text-stone-200 mb-2">Mode canvas — desktop requis</h2>
      <p className="text-sm text-stone-400 max-w-xs leading-relaxed mb-6">
        Le canvas spatial IA est optimisé pour les grands écrans. Utilisez le menu principal sur mobile.
      </p>
      <button
        onClick={() => navigate('/workspace')}
        className="px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-sm text-stone-200 hover:bg-stone-700 transition-colors"
      >
        ← Retour au workspace
      </button>
    </div>
  );
}

export function CanvasView() {
  return (
    <>
      {/* Mobile fallback — caché sur md+ */}
      <div className="md:hidden h-screen">
        <MobileFallback />
      </div>

      {/* Canvas desktop */}
      <div className="hidden md:flex flex-col h-screen w-screen bg-stone-950">
        {/* Header minimal canvas */}
        <header className="h-10 flex items-center justify-between px-4 border-b border-stone-800 bg-stone-950 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-stone-500" />
            <span className="text-xs font-semibold text-stone-300 font-mono">Canvas spatial IA</span>
            <span className="text-2xs text-stone-600 hidden sm:inline">— vue agents &amp; entités</span>
          </div>
          <button
            onClick={() => window.history.back()}
            className="text-2xs text-stone-500 hover:text-stone-300 transition-colors font-mono px-2 py-1 rounded border border-stone-800 hover:border-stone-700"
          >
            ← Workspace
          </button>
        </header>

        {/* Canvas principal */}
        <div className="flex-1 min-h-0">
          <CanvasCore />
        </div>
      </div>
    </>
  );
}
