import React, { memo, useCallback, useRef, useMemo, useEffect, useState, Suspense, lazy } from 'react';
import { type NodeProps } from '@xyflow/react';
import { NotebookPen, Link2, RefreshCw, Hash } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useCanvasStore } from '@/store/canvasStore';
import { useShallow } from 'zustand/react/shallow';
import { useIsMobile } from '@/hooks/use-mobile';
import type { V2NoteNodeData } from '@/types/canvas';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce delay before persisting BlockNote content changes (ms) */
const CONTENT_DEBOUNCE_MS = 500;
/** Debounce delay for title / short-field updates (ms) */
const QUICK_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Lazy-loaded BlockNote editor (preserves bundle chunk splitting)
// ---------------------------------------------------------------------------
const BlockNoteEditor = lazy(() => import('@/components/editor/BlockNoteEditor'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal shape of an inline BlockNote content item */
type BNInlineItem = Record<string, unknown>;
/** Minimal shape of a BlockNote block */
type BNBlock = {
  content?: BNInlineItem[];
  children?: BNBlock[];
  [key: string]: unknown;
};

/**
 * @function extractTextFromBlocks
 * @description Recursively extracts plain text from a BlockNote document (Block[]).
 * @param {BNBlock[]} blocks - Array of BlockNote blocks
 * @returns {string} Flat plain-text string
 * @performance O(n) where n = total inline content items across all blocks
 */
function extractTextFromBlocks(blocks: BNBlock[]): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((block) => {
      const contentText = Array.isArray(block?.content)
        ? (block.content as BNInlineItem[])
            .filter((c) => c?.type === 'text' && typeof c.text === 'string')
            .map((c) => c.text as string)
            .join('')
        : '';
      const childText = Array.isArray(block?.children)
        ? extractTextFromBlocks(block.children as BNBlock[])
        : '';
      return [contentText, childText].filter(Boolean).join(' ');
    })
    .join(' ');
}

/**
 * @function countWordsFromBlocks
 * @description Derives word + character counts from a BlockNote document.
 * @param {unknown} content - BlockNote blocks array (or null/undefined for empty nodes)
 * @returns {{ words: number; chars: number }}
 */
function countWordsFromBlocks(content: unknown): { words: number; chars: number } {
  if (!content) return { words: 0, chars: 0 };
  try {
    const blocks = Array.isArray(content) ? (content as BNBlock[]) : [];
    const text = extractTextFromBlocks(blocks);
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { words, chars };
  } catch {
    return { words: 0, chars: 0 };
  }
}

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

class EditorErrorCatcher extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function EditorErrorBoundary({ children, nodeId: _nodeId }: { children: React.ReactNode; nodeId: string }) {
  const [hasError, setHasError] = useState(false);
  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <NotebookPen className="h-8 w-8 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-semibold text-foreground/70">Block Editor Error</p>
          <p className="text-[11px] text-muted-foreground mt-1">Content could not be rendered.</p>
        </div>
        <button
          className="mt-1 text-[11px] font-bold text-primary hover:underline"
          onClick={() => setHasError(false)}
        >
          Try again
        </button>
      </div>
    );
  }
  return (
    <EditorErrorCatcher onError={() => setHasError(true)}>
      {children}
    </EditorErrorCatcher>
  );
}

// ---------------------------------------------------------------------------
// V2NoteNode
// ---------------------------------------------------------------------------

/**
 * @component V2NoteNode
 * @description A premium canvas note that renders **exclusively** in BlockNote
 * (block editor) mode. Features:
 *   - Pure BlockNote editing — no Tiptap fallback rendered
 *   - Word / character / read-time statistics in the footer
 *   - Sync status indicator via BaseNode `isSyncing`
 *   - Collapse / expand with height restore
 *   - Backlinks panel linking from other nodes referencing this one
 *   - Full SharedNodeFields: tags, emoji, dueDate, opacity, color, progress, createdAt
 *   - Header refresh button with sync-status toast
 *   - Mount-safe debounced content persistence
 *
 * @param {NodeProps} props - React-Flow node props (id, data, selected)
 */
export const V2NoteNode = memo(({ id, data, selected }: NodeProps) => {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const setNodeContextMenu = useCanvasStore((s) => s.setNodeContextMenu);
  const nodeData = data as unknown as V2NoteNodeData;

  // ── refs ─────────────────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);
  const previousHeightRef = useRef<number | undefined>(undefined);

  const isMobile = useIsMobile();
  const isNodeDirty = useCanvasStore((s) => s._dirtyNodeDataIds.has(id));
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  // ── backlinks (shallow selector to avoid over-rendering) ──────────────────
  const backlinkTitles = useCanvasStore(
    useShallow((s) => {
      if (!s.backlinks[id] || s.backlinks[id].length === 0) return [];
      const nodeMap = new Map(s.nodes.map((n) => [n.id, n]));
      return s.backlinks[id].map((sourceId) => {
        const sourceNode = nodeMap.get(sourceId);
        const nodeDataRecord = sourceNode?.data as Record<string, unknown> | undefined;
        const title =
          (nodeDataRecord?.title as string | undefined) ||
          (nodeDataRecord?.label as string | undefined) ||
          'Untitled Node';
        const collapsed = !!(nodeDataRecord?.collapsed);
        return { id: sourceId, title, collapsed };
      });
    })
  );

  // ── lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    };
  }, []);

  // ── handlers ──────────────────────────────────────────────────────────────

  /**
   * @function handleContentChange
   * @description Debounced handler for BlockNote content changes.
   * Persists content to the canvas store and scans for wiki-style [[links]].
   * @param {any} blocks - Updated BlockNote Block[] from the editor onChange
   */
  const handleContentChange = useCallback(
    (blocks: unknown) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        updateNodeData(id, {
          content: blocks as BNBlock[],
          blockVersion: 2,
          updatedAt: new Date().toISOString(),
        });
        // Scan for [[WikiLinks]] so backlinks resolve
        useCanvasStore.getState().scanContentForLinks(id, blocks);
      }, CONTENT_DEBOUNCE_MS);
    },
    [id, updateNodeData]
  );

  /**
   * @function handleTitleChange
   * @description Debounced handler for title input edits.
   * @param {string} title - New title from BaseNode header input
   */
  const handleTitleChange = useCallback(
    (title: string) => {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
      titleDebounceRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        updateNodeData(id, { title });
      }, QUICK_DEBOUNCE_MS);
    },
    [id, updateNodeData]
  );

  /**
   * @function handleToggleCollapse
   * @description Collapses the node to header-only height and restores on expand.
   * Reads live state from the store to avoid stale-closure bugs.
   * @performance O(n) node lookup — called only on user click
   */
  const handleToggleCollapse = useCallback(() => {
    // Read collapsed state fresh from store — avoids stale nodeData closure
    const storeNode = useCanvasStore.getState().nodes.find((n) => n.id === id);
    const isCurrentlyCollapsed = !!(storeNode?.data as Record<string, unknown> | undefined)?.collapsed;
    const willCollapse = !isCurrentlyCollapsed;

    if (willCollapse) {
      // Save current pixel height before collapsing
      const currentHeight = storeNode?.style?.height;
      previousHeightRef.current =
        typeof currentHeight === 'number' && currentHeight > 60
          ? currentHeight
          : 420; // sensible fallback
      // Persist collapsed in data AND shrink node height to header-only
      updateNodeData(id, { collapsed: true });
      useCanvasStore.getState().updateNodeStyle(id, { height: 48 });
    } else {
      // Restore previously captured height
      const restoreHeight = previousHeightRef.current ?? 420;
      updateNodeData(id, { collapsed: false });
      useCanvasStore.getState().updateNodeStyle(id, { height: restoreHeight });
    }
  }, [id, updateNodeData]);

  /**
   * @function handleBacklinkClick
   * @description Focuses the backlink source node, expanding it if currently collapsed.
   * @param {string} sourceId - Canvas node id of the linking node
   * @param {boolean} isCollapsed - Whether the source node is currently collapsed
   * @param {React.MouseEvent} e - Click event (stopped from propagating)
   */
  const handleBacklinkClick = useCallback(
    (sourceId: string, isCollapsed: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      if (isCollapsed) {
        useCanvasStore.getState().updateNodeData(sourceId, { collapsed: false });
      }
      setFocusedNodeId(sourceId);
    },
    [setFocusedNodeId]
  );

  // ── derived stats ─────────────────────────────────────────────────────────

  // Short content fingerprint to stabilise the countWords memo
  const contentKey = useMemo(
    () => (nodeData.content ? JSON.stringify(nodeData.content).slice(0, 128) : ''),
    [nodeData.content]
  );

  const stats = useMemo(
    () => countWordsFromBlocks(nodeData.content),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentKey]
  );

  const footerStats = useMemo(() => {
    const readTime = Math.max(1, Math.ceil(stats.words / 200));
    return stats.words > 0
      ? `${stats.words}w · ${stats.chars}c · ${readTime}m read`
      : `${stats.chars}c`;
  }, [stats]);

  // ── blocks ────────────────────────────────────────────────────────────────
  // V2Note stores content directly as BlockNote Block[] (blockVersion: 2)
  const blocks = useMemo(() => {
    if (!nodeData.content) return [];
    return Array.isArray(nodeData.content) ? nodeData.content : [];
  }, [nodeData.content]);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <BaseNode
      id={id}
      title={nodeData.title || 'V2 Note'}
      icon={<NotebookPen className="h-4 w-4" />}
      selected={selected}
      onTitleChange={handleTitleChange}
      bodyClassName="flex-1 overflow-y-auto min-h-[180px] h-full"
      onMenuClick={(e) => setNodeContextMenu({ x: e.clientX, y: e.clientY, nodeId: id })}
      tags={nodeData.tags}
      collapsed={nodeData.collapsed}
      onToggleCollapse={handleToggleCollapse}
      emoji={nodeData.emoji}
      dueDate={nodeData.dueDate}
      opacity={nodeData.opacity}
      createdAt={nodeData.createdAt}
      footerStats={footerStats}
      color={nodeData.color}
      progress={nodeData.progress}
      isSyncing={isNodeDirty}
      nodeType="v2Note"
      headerExtra={
        <button
          id={`v2note-sync-${id}`}
          className={`rounded p-0.5 text-muted-foreground transition-all duration-300 hover:bg-accent hover:text-foreground ${
            isMobile
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-90 group-hover/node:opacity-100 group-hover/node:scale-100'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            const dirty = useCanvasStore.getState()._dirtyNodeDataIds.has(id);
            if (dirty) {
              toast.info('Syncing changes… please wait a moment');
            } else {
              toast.success('All changes saved ✓');
            }
          }}
          title="Check sync status"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      }
    >
      {/* ── Block editor (BlockNote-only, no Tiptap fallback) ── */}
      <EditorErrorBoundary nodeId={id}>
        <Suspense
          fallback={
            <div className="animate-pulse flex flex-col gap-3 p-6 h-full">
              <div className="h-4 bg-muted/30 rounded-full w-3/4" />
              <div className="h-4 bg-muted/20 rounded-full w-full" />
              <div className="h-4 bg-muted/20 rounded-full w-5/6" />
              <div className="h-4 bg-muted/20 rounded-full w-2/3" />
            </div>
          }
        >
          <BlockNoteEditor
            nodeId={id}
            initialContent={blocks}
            editable={true}
            placeholder="Start writing with blocks — use / for commands…"
            onChange={handleContentChange}
            onLoadError={() => {
              toast.error('Block editor failed to load. Content is preserved.');
              console.error(`[V2NoteNode] BlockNote load error — node ${id}`);
            }}
          />
        </Suspense>
      </EditorErrorBoundary>

      {/* ── Backlinks panel ── */}
      {backlinkTitles.length > 0 && (
        <div className="mt-auto px-4 py-3 border-t border-white/5 bg-gradient-to-b from-transparent to-white/[0.02]">
          <div className="flex items-center gap-2 mb-2 opacity-40 group-hover:opacity-100 transition-opacity">
            <Link2 className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">
              Backlinks
            </span>
            <span className="ml-auto text-[9px] font-bold text-muted-foreground/60">
              {backlinkTitles.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {backlinkTitles.map(({ id: sourceId, title, collapsed: isCollapsed }) => (
              <button
                key={sourceId}
                id={`v2note-backlink-${sourceId}`}
                onClick={(e) => handleBacklinkClick(sourceId, isCollapsed, e)}
                className="group/link flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 hover:bg-primary/10 transition-all border border-transparent hover:border-primary/20"
              >
                <Hash className="h-2.5 w-2.5 text-primary/40 group-hover/link:text-primary transition-colors flex-shrink-0" />
                <span
                  className="text-[10px] font-semibold text-muted-foreground group-hover/link:text-foreground transition-colors truncate max-w-[150px]"
                  title={title}
                >
                  {title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </BaseNode>
  );
});

V2NoteNode.displayName = 'V2NoteNode';
