import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUploadPpImport } from '@/api/ppImport';
import { PpImportPanel } from './PpImportPanel';

type ImportCategory = 'auto' | 'salary' | 'wealth' | 'investment' | 'expense' | 'insurance' | 'crypto';

interface CategoryCard {
  id: ImportCategory;
  shortcut: string; // touche clavier — focus la card
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

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

interface Props {
  onClose: () => void;
  onOpenCryptoForm?: () => void;
}

export function PpImportModal({ onClose, onOpenCryptoForm }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ImportCategory>('auto');
  const [toast, setToast] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const uploadMutation = useUploadPpImport();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        showToast('Format non supporté. Utilisez PDF, JPG ou PNG.');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast('Fichier trop lourd (max 10 MB).');
        return;
      }
      try {
        await uploadMutation.mutateAsync({ file, category: selectedCategory });
        showToast('Document envoyé — traitement en cours...');
        setPanelOpen(true);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404 || status === 503) {
          showToast('Backend pas encore prêt — réessayez dans quelques minutes.');
        } else {
          showToast('Erreur lors de l\'envoi. Veuillez réessayer.');
        }
      }
    },
    [selectedCategory, uploadMutation, showToast],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  const handleCategoryClick = useCallback(
    (cat: ImportCategory) => {
      if (cat === 'crypto') {
        onOpenCryptoForm?.();
        return;
      }
      setSelectedCategory(cat);
      fileInputRef.current?.click();
    },
    [onOpenCryptoForm],
  );

  // Raccourcis clavier : ESC ferme, W/B/P/F/A/C sélectionne la catégorie correspondante
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore si user tape dans un input/textarea (ne pas intercepter)
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Modificateurs (Cmd/Ctrl/Alt) → ne pas intercepter les raccourcis natifs
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toUpperCase();
      const cat = CATEGORIES.find((c) => c.shortcut === key);
      if (cat) {
        e.preventDefault();
        handleCategoryClick(cat.id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, handleCategoryClick]);

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 300,
          backdropFilter: 'blur(2px)',
        }}
      />
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pp-import-title"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(560px, 96vw)',
          background: 'rgb(var(--surface, 255 255 255))',
          border: '1px solid rgb(var(--border, 229 229 222))',
          borderRadius: 16,
          zIndex: 301,
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          animation: 'ppModalIn 0.18s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid rgb(var(--border, 229 229 222))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div id="pp-import-title" style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em', color: 'rgb(var(--ink, 10 10 10))' }}>
              Importer / Saisir vos données fiscales
            </div>
            <div style={{ fontSize: 11, color: 'rgb(var(--muted, 107 107 102))', marginTop: 2 }}>
              PDF, JPG, PNG — max 10 MB
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid rgb(var(--border, 229 229 222))',
              background: 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              color: 'rgb(var(--muted, 107 107 102))',
              flexShrink: 0,
            }}
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {/* Drop zone */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? 'var(--lexa, #d4342c)' : 'rgb(var(--border, 229 229 222))'}`,
              borderRadius: 12,
              padding: '28px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              background: isDragging ? 'rgba(var(--accent-rgb, 212 52 44), 0.04)' : 'rgb(var(--elevated, 243 243 238))',
              userSelect: 'none',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>↓</div>
            <div style={{ fontWeight: 500, fontSize: 14, color: 'rgb(var(--ink, 10 10 10))' }}>
              Glissez-déposez un document ici
            </div>
            <div style={{ fontSize: 12, color: 'rgb(var(--muted, 107 107 102))', marginTop: 4 }}>
              ou cliquez pour sélectionner · PDF, JPG, PNG, max 10 MB
            </div>
            {uploadMutation.isPending && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgb(var(--muted, 107 107 102))' }}>
                Envoi en cours…
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={onFileInput}
            style={{ display: 'none' }}
          />

          {/* Separator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '16px 0',
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'rgb(var(--border, 229 229 222))' }} />
            <span style={{ fontSize: 11, color: 'rgb(var(--subtle, 154 154 147))', whiteSpace: 'nowrap' }}>
              ou choisissez une catégorie
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgb(var(--border, 229 229 222))' }} />
          </div>

          {/* Category cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id && cat.id !== 'crypto';
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '12px 8px',
                    borderRadius: 10,
                    border: `1px solid ${isSelected ? 'var(--lexa, #d4342c)' : 'rgb(var(--border, 229 229 222))'}`,
                    background: isSelected ? 'rgba(212,52,44,0.06)' : 'rgb(var(--elevated, 243 243 238))',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                    color: 'rgb(var(--ink, 10 10 10))',
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'rgb(var(--surface, 255 255 255))',
                      border: '1px solid rgb(var(--border, 229 229 222))',
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSelected ? 'var(--lexa, #d4342c)' : 'rgb(var(--muted, 107 107 102))',
                    }}
                  >
                    {cat.icon}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{cat.label}</span>
                  <span style={{ fontSize: 10, color: 'rgb(var(--subtle, 154 154 147))' }}>{cat.sub}</span>
                </button>
              );
            })}
          </div>

          {/* Imports panel */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setPanelOpen((p) => !p)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 0',
                fontSize: 12,
                fontWeight: 600,
                color: 'rgb(var(--muted, 107 107 102))',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              <span>Mes imports en cours</span>
              <span style={{ fontSize: 10 }}>{panelOpen ? '▲' : '▼'}</span>
            </button>
            {panelOpen && <PpImportPanel />}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              right: 16,
              background: 'rgb(var(--ink, 10 10 10))',
              color: '#fff',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
              zIndex: 10,
              animation: 'ppToastIn 0.2s ease',
            }}
          >
            {toast}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ppModalIn {
          from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)); }
          to   { opacity: 1; transform: translate(-50%, -50%); }
        }
        @keyframes ppToastIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </>,
    document.body,
  );
}
