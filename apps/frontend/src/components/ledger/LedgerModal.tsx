import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LedgerPanel } from './LedgerPanel';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal full-screen qui abrite le mode expert "Grand livre".
 * Toggle depuis Workspace via icône calc ou raccourci cmd+shift+L.
 */
export function LedgerModal({ open, onClose }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 bg-bg/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-4 md:inset-8 lg:inset-12 card-elevated overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-2xs uppercase tracking-wider text-muted">
                  Mode expert
                </span>
              </div>
              <div className="flex items-center gap-3 text-2xs text-muted">
                <kbd className="kbd">Esc</kbd>
                <button
                  onClick={onClose}
                  className="p-1 hover:text-ink transition-colors"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <LedgerPanel />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
