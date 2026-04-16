import { useCallback, useEffect, useState } from 'react';
import type { Node } from '@xyflow/react';

const STORAGE_KEY_PREFIX = 'lexa-canvas-layout-';

interface SavedPositions {
  [nodeId: string]: { x: number; y: number };
}

export function useCanvasLayout(tenantId: string | null) {
  const key = `${STORAGE_KEY_PREFIX}${tenantId ?? 'default'}`;

  const loadPositions = useCallback((): SavedPositions => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as SavedPositions) : {};
    } catch {
      return {};
    }
  }, [key]);

  const [savedPositions, setSavedPositions] = useState<SavedPositions>(loadPositions);

  useEffect(() => {
    setSavedPositions(loadPositions());
  }, [loadPositions]);

  const savePositions = useCallback(
    (nodes: Node[]) => {
      const positions: SavedPositions = {};
      for (const n of nodes) {
        positions[n.id] = { x: n.position.x, y: n.position.y };
      }
      localStorage.setItem(key, JSON.stringify(positions));
      setSavedPositions(positions);
    },
    [key],
  );

  const resetLayout = useCallback(() => {
    localStorage.removeItem(key);
    setSavedPositions({});
    // Reload page pour recalculer les positions par défaut
    window.location.reload();
  }, [key]);

  const applyPositions = useCallback(
    <T extends { id: string; position: { x: number; y: number } }>(nodes: T[]): T[] => {
      return nodes.map((n) => {
        const saved = savedPositions[n.id];
        if (saved) {
          return { ...n, position: saved };
        }
        return n;
      });
    },
    [savedPositions],
  );

  return { savedPositions, savePositions, resetLayout, applyPositions };
}
