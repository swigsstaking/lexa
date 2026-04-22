/**
 * DocumentsPp — page dédiée à l'import de documents fiscaux pour un contribuable
 * Personne Physique (PP).
 *
 * Basée sur le modal `PpImportModal` (workspace), mais en page plein-écran pour
 * y accéder directement depuis le menu Documents sur profile PP.
 *
 * PM (Sàrl/SA) utilise l'ancienne page Documents.tsx orientée factures fournisseurs
 * + CAMT.053 + écritures grand livre.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { useUploadPpImport } from '@/api/ppImport';
import { PpImportPanel } from '@/components/workspace/v2/PpImportPanel';
import { PpCryptoWalletForm } from '@/components/workspace/v2/PpCryptoWalletForm';

type ImportCategory = 'auto' | 'salary' | 'wealth' | 'investment' | 'expense' | 'insurance' | 'crypto';

interface CategoryCard {
  id: ImportCategory;
  shortcut: string;
  icon: string;
  label: string;
  sub: string;
}

const CATEGORIES: CategoryCard[] = [
  { id: 'salary',     shortcut: 'W', icon: 'W', label: 'Salaire',    sub: 'Swissdec' },
  { id: 'wealth',     shortcut: 'B', icon: 'B', label: 'Fortune',    sub: 'Banques' },
  { id: 'investment', shortcut: 'P', icon: 'P', label: 'Placements', sub: 'Titres, fonds' },
  { id: 'expense',    shortcut: 'F', icon: 'F', label: 'Frais',      sub: 'Déductibles' },
  { id: 'insurance',  shortcut: 'A', icon: 'A', label: 'Assurances', sub: '3a / maladie' },
  { id: 'crypto',     shortcut: 'C', icon: 'C', label: 'Crypto',     sub: 'Wallet' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const HEIC_EXT_RE = /\.(heic|heif)$/i;

export function DocumentsPp() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ImportCategory>('auto');
  const [toast, setToast] = useState<string | null>(null);
  const [cryptoFormOpen, setCryptoFormOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadPpImport();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const isHeicFile = !ACCEPTED_TYPES.includes(file.type) && HEIC_EXT_RE.test(file.name);
      if (!ACCEPTED_TYPES.includes(file.type) && !isHeicFile) {
        showToast('Format non supporté. Utilisez PDF, JPG, PNG ou HEIC.');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast('Fichier trop lourd (max 10 MB).');
        return;
      }
      let toUpload = file;
      if (file.type.startsWith('image/heic') || file.type.startsWith('image/heif') || HEIC_EXT_RE.test(file.name)) {
        showToast('Conversion HEIC → JPEG…');
        try {
          const { ensureJpeg } = await import('@/utils/convertHeic');
          const res = await ensureJpeg(file);
          toUpload = res.file;
        } catch (err) {
          showToast(`Conversion HEIC échouée : ${(err as Error).message}`);
          return;
        }
      }
      try {
        await uploadMutation.mutateAsync({ file: toUpload, category: selectedCategory });
        showToast('Document envoyé — traitement en cours…');
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404 || status === 503) {
          showToast('Backend pas encore prêt — réessayez dans quelques minutes.');
        } else {
          showToast("Erreur lors de l'envoi. Veuillez réessayer.");
        }
      }
    },
    [selectedCategory, uploadMutation, showToast],
  );

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const handleCategoryClick = useCallback((cat: ImportCategory) => {
    if (cat === 'crypto') { setCryptoFormOpen(true); return; }
    setSelectedCategory(cat);
    fileInputRef.current?.click();
  }, []);

  // Raccourcis clavier : W/B/P/F/A/C sélectionne la catégorie
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const cat = CATEGORIES.find((c) => c.shortcut === e.key.toUpperCase());
      if (cat) { e.preventDefault(); handleCategoryClick(cat.id); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCategoryClick]);

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top bar */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border bg-surface flex-shrink-0">
        <button onClick={() => navigate('/workspace')} className="btn-ghost !p-1.5" title="Retour">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border" />
        <FileText className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold">Documents · Personne Physique</span>
        <span className="text-2xs text-subtle ml-auto">PDF, JPG, PNG, HEIC — max 10 MB</span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-ink mb-1">Importer / Saisir vos données fiscales</h1>
          <p className="text-sm text-muted">Déposez vos certificats de salaire, attestations 3a, relevés de fortune ou factures — Lexa pré-remplit votre déclaration.</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-border-strong'}`}
        >
          <div className="text-3xl mb-2">↓</div>
          <p className="text-sm font-medium text-ink">Glissez-déposez un document ici</p>
          <p className="text-xs text-muted mt-1">ou cliquez pour sélectionner · PDF, JPG, PNG, HEIC, max 10 MB</p>
          {uploadMutation.isPending && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Envoi en cours…</span>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,image/heic,image/heif"
          onChange={onFileInput}
          className="hidden"
        />

        {/* Separator */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-subtle uppercase tracking-wider">ou choisissez une catégorie</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Category cards — grille 3 cols responsive */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id && cat.id !== 'crypto';
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-colors ${isSelected ? 'border-accent bg-accent/5' : 'border-border bg-elevated hover:border-border-strong'}`}
              >
                <span
                  className={`w-9 h-9 rounded-lg bg-surface border border-border grid place-items-center font-mono font-semibold text-sm ${isSelected ? 'text-accent' : 'text-muted'}`}
                >
                  {cat.icon}
                </span>
                <span className="text-sm font-semibold">{cat.label}</span>
                <span className="text-2xs text-subtle">{cat.sub}</span>
                <span className="text-2xs text-subtle font-mono mt-0.5 opacity-60">{cat.shortcut}</span>
              </button>
            );
          })}
        </div>

        {/* Panel des imports existants */}
        <section className="card p-4">
          <h2 className="text-sm font-semibold mb-3">Vos imports</h2>
          <PpImportPanel />
        </section>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg px-4 py-2 shadow-lg text-sm text-ink z-50">
            {toast}
          </div>
        )}
      </main>

      {cryptoFormOpen && (
        <PpCryptoWalletForm onClose={() => setCryptoFormOpen(false)} onAdded={() => setCryptoFormOpen(false)} />
      )}
    </div>
  );
}
