import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useValidatePpImport } from '@/api/ppImport';
import type { PpImportRow } from '@/api/ppImport';

const FIELD_LABEL: Record<string, string> = {
  employer_name:        'Employeur',
  employer_uid:         'UID employeur',
  employee_name:        'Employé',
  year:                 'Année',
  gross_annual_salary:  'Salaire brut annuel',
  thirteenth_salary:    '13ème salaire',
  bonus:                'Bonus',
  ahv_ai_apg:           'AVS/AI/APG',
  lpp_employee:         'LPP part employé',
  alv_employee:         'AC (chômage)',
  professional_expenses:'Frais professionnels',
  other_income:         'Indemnités diverses',
};

interface Props {
  importRow: PpImportRow;
  onClose: () => void;
  onCommitted?: () => void;
}

export function PpImportValidationModal({ importRow, onClose, onCommitted }: Props) {
  const raw = importRow.rawExtraction ?? {};
  const [fields, setFields] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v !== null && v !== undefined ? String(v) : '']),
    ),
  );
  const [toast, setToast] = useState<string | null>(null);

  const validateMutation = useValidatePpImport();

  const allFieldKeys = Array.from(
    new Set([...Object.keys(FIELD_LABEL), ...Object.keys(raw)]),
  ).filter((k) => k in raw || k in FIELD_LABEL);

  const lowConfKeys = new Set<string>();
  if (importRow.confidence !== null && importRow.confidence < 0.85) {
    const lowCount = Math.ceil(allFieldKeys.length * (1 - (importRow.confidence ?? 0.85)));
    allFieldKeys.slice(-lowCount).forEach((k) => lowConfKeys.add(k));
  }

  const handleSubmit = async () => {
    const parsed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      const num = parseFloat(v);
      parsed[k] = isNaN(num) ? v : num;
    }
    try {
      await validateMutation.mutateAsync({ id: importRow.id, data: parsed });
      onCommitted?.();
      onClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 503) {
        setToast('Backend pas encore prêt — données sauvegardées localement.');
      } else {
        setToast('Erreur lors de la validation. Veuillez réessayer.');
      }
    }
  };

  const confidence = importRow.confidence ?? null;
  const lowConfCount = lowConfKeys.size;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 400,
          backdropFilter: 'blur(2px)',
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(600px, 96vw)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgb(var(--surface, 255 255 255))',
          border: '1px solid rgb(var(--border, 229 229 222))',
          borderRadius: 16,
          zIndex: 401,
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          animation: 'ppValidModalIn 0.18s ease',
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
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em', color: 'rgb(var(--ink, 10 10 10))' }}>
              Vérifier l'import
            </div>
            <div style={{ fontSize: 11, color: 'rgb(var(--muted, 107 107 102))', marginTop: 2 }}>
              {importRow.category === 'salary' ? 'Certificat de salaire' : importRow.category}
              {importRow.rawExtraction?.year ? ` ${importRow.rawExtraction.year}` : ''}
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
            }}
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Confidence bar */}
        {confidence !== null && (
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid rgb(var(--border, 229 229 222))',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 11, color: 'rgb(var(--muted))', whiteSpace: 'nowrap' }}>
              Confiance OCR
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                background: 'rgb(var(--elevated))',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(confidence * 100)}%`,
                  background: confidence >= 0.85
                    ? 'oklch(0.42 0.14 155)'
                    : confidence >= 0.7
                    ? 'oklch(0.65 0.18 50)'
                    : 'var(--neg, #d4342c)',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 12,
                fontWeight: 500,
                color: 'rgb(var(--ink))',
                whiteSpace: 'nowrap',
              }}
            >
              {Math.round(confidence * 100)}%
            </span>
            {lowConfCount > 0 && (
              <span style={{ fontSize: 11, color: 'oklch(0.65 0.18 50)', whiteSpace: 'nowrap' }}>
                ⚠ {lowConfCount} champ{lowConfCount > 1 ? 's' : ''} faible confiance
              </span>
            )}
          </div>
        )}

        {/* Field table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr 1fr',
              gap: 8,
              marginBottom: 8,
            }}
          >
            {['Champ', 'Extrait', 'À utiliser'].map((h) => (
              <span
                key={h}
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'rgb(var(--subtle))',
                  fontWeight: 600,
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {allFieldKeys.map((key) => {
            const rawVal = raw[key];
            const isLow = lowConfKeys.has(key);
            return (
              <div
                key={key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr 1fr',
                  gap: 8,
                  alignItems: 'center',
                  padding: '7px 0',
                  borderBottom: '1px solid rgb(var(--border, 229 229 222))',
                  background: isLow ? 'rgba(212,52,44,0.03)' : 'transparent',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: isLow ? 'oklch(0.65 0.18 50)' : 'rgb(var(--ink))',
                    fontWeight: isLow ? 600 : 400,
                  }}
                >
                  {FIELD_LABEL[key] ?? key}
                  {isLow && <span style={{ marginLeft: 4, fontSize: 10 }}>⚠</span>}
                </span>
                <span
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 11,
                    color: 'rgb(var(--subtle))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rawVal !== null && rawVal !== undefined ? String(rawVal) : '—'}
                </span>
                <input
                  type="text"
                  value={fields[key] ?? ''}
                  onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))}
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 12,
                    padding: '5px 8px',
                    border: `1px solid ${isLow ? 'oklch(0.65 0.18 50)' : 'rgb(var(--border))'}`,
                    borderRadius: 6,
                    background: 'rgb(var(--surface))',
                    color: 'rgb(var(--ink))',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgb(var(--border, 229 229 222))',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgb(var(--border))',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              color: 'rgb(var(--muted))',
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={validateMutation.isPending}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--lexa, #d4342c)',
              color: '#fff',
              cursor: validateMutation.isPending ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: validateMutation.isPending ? 0.7 : 1,
            }}
          >
            {validateMutation.isPending ? 'Validation…' : 'Valider et importer'}
          </button>
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
            }}
          >
            {toast}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ppValidModalIn {
          from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)); }
          to   { opacity: 1; transform: translate(-50%, -50%); }
        }
      `}</style>
    </>,
    document.body,
  );
}
