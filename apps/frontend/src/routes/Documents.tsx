/**
 * Page /documents — Upload + liste des documents OCR
 *
 * Session 23 — V1 minimal : upload + liste + champs extraits.
 * Session 24 — bouton "Pré-remplir wizard" pour certificat_salaire + attestation_3a.
 */

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileText,
  Image,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Wand2,
  QrCode,
  Landmark,
  Zap,
  Check,
  Briefcase,
  X,
} from 'lucide-react';
import { lexa, type DocumentMeta } from '@/api/lexa';
import { useActiveCompany } from '@/stores/companiesStore';

const CURRENT_FISCAL_YEAR = new Date().getFullYear();

/** Types de documents qui ont un mapping vers le wizard */
const WIZARD_APPLICABLE_TYPES = new Set(['certificat_salaire', 'attestation_3a']);

const DOC_TYPE_LABELS: Record<string, string> = {
  certificat_salaire: 'Certificat de salaire',
  attestation_3a: 'Attestation 3ème pilier',
  facture: 'Facture',
  releve_bancaire: 'Relevé bancaire',
  autre: 'Autre',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  certificat_salaire: 'text-emerald-400 bg-emerald-400/10',
  attestation_3a: 'text-sky-400 bg-sky-400/10',
  facture: 'text-violet-400 bg-violet-400/10',
  releve_bancaire: 'text-amber-400 bg-amber-400/10',
  autre: 'text-zinc-400 bg-zinc-400/10',
};

/** Filtres source disponibles dans /documents (Phase 3 V1.1) */
type SourceFilter = 'all' | 'manual' | 'swigs-pro' | 'imap' | 'ocr';

const SOURCE_FILTER_LABELS: Record<SourceFilter, string> = {
  all: 'Tous',
  manual: 'Upload manuel',
  'swigs-pro': 'Swigs Pro',
  imap: 'IMAP',
  ocr: 'OCR',
};

/** Badge violet/cyan affiché sur les documents Swigs Pro */
function ProBadge({ doc }: { doc: DocumentMeta }) {
  const [modalOpen, setModalOpen] = useState(false);
  if (doc.source !== 'swigs-pro') return null;

  const proLabel = doc.proInvoiceNumber
    ? `Facture ${doc.proInvoiceNumber}`
    : doc.proExpenseId
      ? `Note de frais ${doc.proExpenseId}`
      : 'Document Pro';

  const eventLabel: Record<string, string> = {
    'invoice.created': 'Facture créée',
    'invoice.sent': 'Facture envoyée',
    'invoice.paid': 'Facture payée',
    'expense.submitted': 'Note de frais soumise',
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
        className="absolute top-3 right-10 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors text-2xs font-medium"
        title="Document issu de Swigs Pro"
      >
        <Briefcase className="w-3 h-3" />
        <span>Pro</span>
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="card p-5 max-w-sm w-full flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-ink">Swigs Pro</span>
              </div>
              <button onClick={() => setModalOpen(false)} className="btn-ghost !p-1.5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2 text-xs text-subtle">
              <p>
                <span className="text-ink font-medium">Cette pièce vient de Swigs Pro</span>
              </p>
              <p>
                <span className="text-muted">Référence : </span>
                <span className="text-ink">{proLabel}</span>
              </p>
              {doc.sourceEvent && (
                <p>
                  <span className="text-muted">Event : </span>
                  <span className="text-ink">{eventLabel[doc.sourceEvent] ?? doc.sourceEvent}</span>
                </p>
              )}
              {doc.linkedStreamId && (
                <p className="text-2xs text-muted font-mono truncate">
                  Stream : {doc.linkedStreamId}
                </p>
              )}
            </div>
            <a
              href={doc.proInvoiceId ? `https://workflow.swigs.online?invoice=${doc.proInvoiceId}` : 'https://workflow.swigs.online'}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost !text-xs flex items-center gap-1.5 justify-center"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Voir dans Swigs Pro</span>
            </a>
          </div>
        </div>
      )}
    </>
  );
}

/** Badge QR-facture suisse — affiché si extractedFields.qrBill présent (Lane J) */
type QrBillData = {
  amount?: number;
  currency?: string;
  creditor?: { name?: string };
};

function QrBadge({ qrBill }: { qrBill: unknown }) {
  if (!qrBill || typeof qrBill !== 'object') return null;
  const qr = qrBill as QrBillData;
  return (
    <div className="flex items-center gap-2 text-2xs">
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <QrCode className="w-3 h-3" />
        <span className="font-medium">QR-facture</span>
      </span>
      <span className="text-subtle">·</span>
      <span className="text-ink">
        {qr.amount != null
          ? `${qr.amount.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} ${qr.currency ?? 'CHF'}`
          : `Montant libre · ${qr.currency ?? 'CHF'}`}
      </span>
      {qr.creditor?.name && (
        <>
          <span className="text-subtle">·</span>
          <span className="text-subtle truncate max-w-[12rem]">{qr.creditor.name}</span>
        </>
      )}
    </div>
  );
}

function FileIcon({ mimetype }: { mimetype: string }) {
  if (mimetype === 'application/pdf') return <FileText className="w-4 h-4 text-red-400" />;
  return <Image className="w-4 h-4 text-sky-400" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DocumentCardProps = {
  doc: DocumentMeta;
  onApply: (documentId: string, year: number) => void;
  applyPending: boolean;
  applySuccess: boolean;
  onCreateEntry: (documentId: string) => void;
  createEntryPending: boolean;
};

function DocumentCard({ doc, onApply, applyPending, applySuccess, onCreateEntry, createEntryPending }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = DOC_TYPE_LABELS[doc.ocrResult.type] ?? doc.ocrResult.type;
  const typeColor = DOC_TYPE_COLORS[doc.ocrResult.type] ?? DOC_TYPE_COLORS.autre;
  const uploadedAt = new Date(doc.uploadedAt).toLocaleString('fr-CH');
  const binaryUrl = `/api/documents/${doc.documentId}/binary`;

  const fields = doc.ocrResult.extractedFields;
  const fieldEntries = Object.entries(fields);
  const canApply = WIZARD_APPLICABLE_TYPES.has(doc.ocrResult.type);

  return (
    <div className="card p-4 flex flex-col gap-3 relative">
      {/* Badge Swigs Pro (Phase 3 V1.1) */}
      <ProBadge doc={doc} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon mimetype={doc.mimetype} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">{doc.filename}</p>
            <p className="text-2xs text-subtle mt-0.5">
              {formatSize(doc.size)} · {uploadedAt}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${typeColor}`}>
            {typeLabel}
          </span>
          <a
            href={binaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost !p-1.5"
            title="Voir le fichier original"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* OCR info */}
      <div className="flex items-center gap-3 text-2xs text-subtle">
        <span>
          Extraction : <span className="text-ink">{doc.ocrResult.extractionMethod}</span>
        </span>
        <span>·</span>
        <span>
          Confiance :{' '}
          <span className="text-ink">{Math.round(doc.ocrResult.ocrConfidence * 100)}%</span>
        </span>
        <span>·</span>
        <span>
          Durée : <span className="text-ink">{(doc.ocrResult.durationMs / 1000).toFixed(1)}s</span>
        </span>
      </div>

      {/* Badge QR-facture — Lane J 2026-04-16 */}
      <QrBadge qrBill={doc.ocrResult?.extractedFields?.qrBill} />

      {/* Bouton pré-remplir wizard — session 24 */}
      {canApply && (
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <button
            onClick={() => onApply(doc.documentId, CURRENT_FISCAL_YEAR)}
            disabled={applyPending}
            className="btn-primary !text-xs !py-1.5 !px-3 flex items-center gap-1.5"
            title={`Pré-remplir votre déclaration ${CURRENT_FISCAL_YEAR} avec les données de ce document`}
          >
            {applyPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : applySuccess ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            <span>Pré-remplir wizard {CURRENT_FISCAL_YEAR}</span>
          </button>
        </div>
      )}

      {/* Bouton créer écriture comptable — Lane M */}
      {doc.ocrResult?.extractedFields && Object.keys(doc.ocrResult.extractedFields).length > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          {doc.hasLinkedEntry ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Écriture créée
            </span>
          ) : (
            <button
              onClick={() => onCreateEntry(doc.documentId)}
              disabled={createEntryPending}
              className="btn-ghost !text-xs !py-1.5 !px-3 flex items-center gap-1.5"
              title="Créer une écriture comptable depuis ce document OCR"
            >
              {createEntryPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Classification…</>
              ) : (
                <><Zap className="w-3.5 h-3.5 mr-1" />Créer l'écriture</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Champs extraits */}
      {fieldEntries.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-2xs text-accent hover:text-accent/80 transition-colors"
          >
            {expanded ? '▼' : '▶'} {fieldEntries.length} champ{fieldEntries.length > 1 ? 's' : ''}{' '}
            extrait{fieldEntries.length > 1 ? 's' : ''}
          </button>
          {expanded && (
            <div className="mt-2 bg-surface-2 rounded-md p-3 font-mono text-2xs text-ink space-y-1">
              {fieldEntries.map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-muted min-w-0 truncate">{key}</span>
                  <span className="text-subtle">:</span>
                  <span className="text-ink">{String(value ?? '')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Documents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const company = useActiveCompany();

  // Chemin canton-aware vers le wizard PP (même logique que Workspace.tsx)
  const canton = company?.canton ?? 'VS';
  const taxpayerPath =
    canton === 'GE'
      ? `/taxpayer/ge/${CURRENT_FISCAL_YEAR}`
      : canton === 'VD'
        ? `/taxpayer/vd/${CURRENT_FISCAL_YEAR}`
        : canton === 'FR'
          ? `/taxpayer/fr/${CURRENT_FISCAL_YEAR}`
          : `/taxpayer/${CURRENT_FISCAL_YEAR}`;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [creatingEntryDocId, setCreatingEntryDocId] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<{ docId: string; message: string; ok: boolean } | null>(null);
  const [applyingDocId, setApplyingDocId] = useState<string | null>(null);
  const [appliedDocIds, setAppliedDocIds] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  // CAMT.053 state
  const camt053InputRef = useRef<HTMLInputElement>(null);
  const [camt053Result, setCamt053Result] = useState<{
    ingested: number;
    skipped: number;
    failed: number;
    transactionsCount: number;
  } | null>(null);
  const [camt053Error, setCamt053Error] = useState<string | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: lexa.listDocuments,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => lexa.uploadDocument(file),
    onSuccess: (data) => {
      setLastUploaded(data.filename);
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err: Error) => {
      // BUG msg erreur 502 user-friendly
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 502) {
        setUploadError('Le service OCR est temporairement indisponible. Réessayez dans quelques instants.');
      } else {
        const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setUploadError(apiMsg || err.message || 'Erreur lors de l\'upload');
      }
    },
  });

  const applyMutation = useMutation({
    mutationFn: ({ documentId, year }: { documentId: string; year: number }) =>
      lexa.applyDocumentToDraft(documentId, year),
    onSuccess: (data, variables) => {
      setApplyingDocId(null);
      setApplyFeedback({ docId: variables.documentId, message: data.message, ok: data.ok });
      if (data.ok) {
        setAppliedDocIds((prev) => new Set([...prev, variables.documentId]));
        // Invalider le draft pour que le wizard récupère les nouvelles valeurs
        queryClient.invalidateQueries({ queryKey: ['taxpayer-draft'] });
        queryClient.invalidateQueries({ queryKey: ['draft-field-sources'] });
      }
    },
    onError: (err: Error, variables) => {
      setApplyingDocId(null);
      const message = (err as { response?: { data?: { error?: string; hint?: string } } })
        ?.response?.data?.error ?? err.message ?? 'Erreur';
      const hint = (err as { response?: { data?: { hint?: string } } })?.response?.data?.hint;
      setApplyFeedback({
        docId: variables.documentId,
        message: hint ? `${message} — ${hint}` : message,
        ok: false,
      });
    },
  });

  const camt053Mutation = useMutation({
    mutationFn: (file: File) => lexa.uploadCamt053(file),
    onSuccess: (data) => {
      setCamt053Result(data);
      setCamt053Error(null);
      // Invalider le grand livre pour refléter les nouvelles transactions
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
    onError: (err: Error) => {
      const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCamt053Error(apiMsg || err.message || 'Erreur lors de l\'import CAMT.053');
      setCamt053Result(null);
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: (documentId: string) => lexa.createEntryFromDocument(documentId),
    onSuccess: (_data, documentId) => {
      setCreatingEntryDocId(null);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
      // Feedback minimal : on invalide le doc pour que hasLinkedEntry se mette à jour
      console.info(`[Documents] écriture créée pour doc ${documentId}`);
    },
    onError: (err: Error, documentId) => {
      setCreatingEntryDocId(null);
      const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setUploadError(apiMsg || err.message || `Erreur création écriture (doc ${documentId})`);
    },
  });

  const handleCreateEntry = (documentId: string) => {
    setCreatingEntryDocId(documentId);
    setUploadError(null);
    createEntryMutation.mutate(documentId);
  };

  // Drag & drop — route vers uploadDocument (PDF/image) ou uploadCamt053 (XML)
  const routeAndUpload = (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'xml' || file.type === 'application/xml' || file.type === 'text/xml') {
      setCamt053Result(null);
      setCamt053Error(null);
      camt053Mutation.mutate(file);
    } else if (file.type.match(/^(application\/pdf|image\/)/)) {
      setLastUploaded(null);
      setUploadError(null);
      uploadMutation.mutate(file);
    } else {
      setUploadError(`Format "${file.type || ext}" non supporté — PDF, JPEG, PNG ou XML CAMT.053 uniquement`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      routeAndUpload(file);
    }
  };

  const handleCamt053Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCamt053Result(null);
    setCamt053Error(null);
    camt053Mutation.mutate(file);
    e.target.value = '';
  };

  const handleApply = (documentId: string, year: number) => {
    setApplyFeedback(null);
    setApplyingDocId(documentId);
    applyMutation.mutate({ documentId, year });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastUploaded(null);
    setUploadError(null);
    uploadMutation.mutate(file);
    // Reset input pour permettre de re-uploader le même fichier
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top bar */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border bg-surface flex-shrink-0">
        <button onClick={() => navigate('/workspace')} className="btn-ghost !p-1.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border" />
        <FileText className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold">Documents</span>
        <span className="text-2xs text-subtle ml-auto">
          {documents ? `${documents.length} document${documents.length !== 1 ? 's' : ''}` : ''}
        </span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Dropzone drag & drop — Feature 1 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-border/80'}`}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted" />
          <p className="text-sm font-medium text-ink">Glissez-déposez un document ici</p>
          <p className="text-xs text-muted mt-1">PDF, JPEG, PNG ou XML CAMT.053 — ou utilisez les boutons ci-dessous</p>
        </div>

        {/* Upload zone */}
        <section className="card p-6 flex flex-col items-center gap-4">
          <div className="text-center">
            <Upload className="w-8 h-8 text-accent mx-auto mb-2" />
            <h2 className="text-sm font-semibold">Importer un document</h2>
            <p className="text-2xs text-subtle mt-1">
              PDF, JPEG ou PNG — max 10 MB
            </p>
            <p className="text-2xs text-subtle">
              Certificat de salaire, attestation 3a, facture, relevé bancaire
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Traitement OCR en cours...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Choisir un fichier</span>
              </>
            )}
          </button>

          {/* Feedback upload */}
          {uploadError && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
          {lastUploaded && !uploadMutation.isPending && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>"{lastUploaded}" importé avec succès</span>
            </div>
          )}
        </section>

        {/* Import bancaire CAMT.053 */}
        <section className="card p-6 flex flex-col items-center gap-4">
          <div className="text-center">
            <Landmark className="w-8 h-8 text-accent mx-auto mb-2" />
            <h2 className="text-sm font-semibold">Import bancaire CAMT.053</h2>
            <p className="text-2xs text-subtle mt-1">
              Relevé XML ISO 20022 — transactions importées directement dans le grand livre
            </p>
          </div>

          <input
            ref={camt053InputRef}
            type="file"
            accept=".xml"
            onChange={handleCamt053Change}
            className="hidden"
          />

          <button
            onClick={() => camt053InputRef.current?.click()}
            disabled={camt053Mutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {camt053Mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Import en cours...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Importer le relevé</span>
              </>
            )}
          </button>

          {camt053Error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{camt053Error}</span>
            </div>
          )}
          {camt053Result && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>
                  {camt053Result.ingested} transaction{camt053Result.ingested !== 1 ? 's' : ''} importée{camt053Result.ingested !== 1 ? 's' : ''}
                  {camt053Result.skipped > 0 ? ` · ${camt053Result.skipped} ignorée${camt053Result.skipped !== 1 ? 's' : ''}` : ''}
                </span>
              </div>
              {camt053Result.ingested > 0 && (
                <button
                  onClick={() => navigate('/workspace')}
                  className="btn-secondary flex items-center gap-2"
                >
                  <span>Voir dans le grand livre</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </section>

        {/* Liste des documents */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-ink">Documents importés</h2>

            {/* Filtre source (Phase 3 V1.1) */}
            <div className="flex items-center gap-1 flex-wrap">
              {(Object.keys(SOURCE_FILTER_LABELS) as SourceFilter[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSourceFilter(key)}
                  className={`text-2xs px-2.5 py-1 rounded-full border transition-colors ${
                    sourceFilter === key
                      ? 'bg-accent/20 border-accent/40 text-accent'
                      : 'border-border text-subtle hover:border-border/60 hover:text-ink'
                  }`}
                >
                  {SOURCE_FILTER_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12 text-subtle">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Chargement...</span>
            </div>
          )}

          {!isLoading && (!documents || documents.length === 0) && (
            <div className="card p-8 text-center text-subtle">
              <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucun document importé pour ce tenant</p>
              <p className="text-2xs mt-1">
                Importez votre premier document ci-dessus pour démarrer l'OCR
              </p>
            </div>
          )}

          {/* Feedback apply — session 24 */}
          {applyFeedback && (
            <div
              className={`flex items-start gap-2 text-xs rounded-md p-3 mb-2 ${
                applyFeedback.ok
                  ? 'bg-emerald-400/10 text-emerald-400'
                  : 'bg-red-400/10 text-red-400'
              }`}
            >
              {applyFeedback.ok ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span>{applyFeedback.message}</span>
              {applyFeedback.ok && (
                <button
                  onClick={() => navigate(taxpayerPath)}
                  className="ml-auto text-2xs underline hover:no-underline flex-shrink-0"
                >
                  Ouvrir le wizard →
                </button>
              )}
            </div>
          )}

          {!isLoading && documents && documents.length > 0 && (
            <div className="flex flex-col gap-3">
              {documents
                // Tri date desc
                .slice()
                .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                // Filtre source (Phase 3 V1.1)
                .filter((doc) => {
                  if (sourceFilter === 'all') return true;
                  if (sourceFilter === 'swigs-pro') return doc.source === 'swigs-pro';
                  if (sourceFilter === 'imap') return doc.source === 'imap';
                  if (sourceFilter === 'ocr') return doc.source === 'ocr';
                  // "manual" = ni pro, ni imap, ni ocr explicite (uploads classiques)
                  return !doc.source || doc.source === 'ocr';
                })
                .map((doc) => (
                  <DocumentCard
                    key={doc.documentId}
                    doc={doc}
                    onApply={handleApply}
                    applyPending={applyingDocId === doc.documentId}
                    applySuccess={appliedDocIds.has(doc.documentId)}
                    onCreateEntry={handleCreateEntry}
                    createEntryPending={creatingEntryDocId === doc.documentId}
                  />
                ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
