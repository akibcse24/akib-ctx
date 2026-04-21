import { useCallback, useRef, useEffect, useState, useMemo, memo } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  BackgroundVariant,
  SelectionMode,
  ConnectionMode,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  applyNodeChanges,
  type ReactFlowInstance,
} from '@xyflow/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Sparkles, MousePointerClick, Search, Maximize2, Eye } from 'lucide-react';
import { debounce } from '@/lib/utils/debounce';
import { useIsMobile } from '@/hooks/use-mobile';
import { uploadCanvasFile } from '@/lib/r2/storage';
import { toast } from 'sonner';
import { throttle } from '@/lib/utils/throttle';
import { updateCursorPositionInDb } from '@/lib/firebase/canvasData';
import { MagicCursorsLayer } from './MagicCursorsLayer';
import { LinkPeekCard } from './LinkPeekCard';
import { auth } from '@/lib/firebase/client';
import '@xyflow/react/dist/style.css';

import { useCanvasStore, useNodes, useEdges, useWorkspaceId, useCanvasMode, useZenMode } from '@/store/canvasStore';
import { HANDLE_IDS } from '@/lib/constants/canvas';
import { CanvasContextMenu } from './CanvasContextMenu';
import { NodeContextMenu } from './NodeContextMenu';
import { EdgeContextMenu } from './EdgeContextMenu';
import { Breadcrumbs } from './Breadcrumbs';
import { CanvasToolbar } from './CanvasToolbar';
import { NodeExpandModal } from './NodeExpandModal';
import { AddNodeToolbar } from './AddNodeToolbar';
import { PomodoroTimer } from './PomodoroTimer';
import { PinnedNodesPanel } from './PinnedNodesPanel';
import { CanvasStats } from './CanvasStats';
import { SearchPalette } from './SearchPalette';
import { CommandPalette } from './CommandPalette';
import { ThemeEditor } from './ThemeEditor';
import { NodeSelectionToolbar } from './NodeSelectionToolbar';
import { DrawingLayer } from './DrawingLayer';
import { DrawingOverlay } from './DrawingOverlay';
import { SelectionToolbar } from './SelectionToolbar';
import { TutorialSystem } from './TutorialSystem';
import { ActionPalette } from './ActionPalette';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';
import { AlignmentGuidesLayer } from './AlignmentGuidesLayer';
import { HistoryPanel } from './HistoryPanel';
import { WorkspaceTabs } from './WorkspaceTabs';
import { NodeSearchPanel, openSearch } from './NodeSearchPanel';
import { PresentationMode } from './PresentationMode';
import { nodeTypes } from './nodeTypes';
import { edgeTypes } from './edgeTypes';
import { cn } from '@/lib/utils';
import { isHotkeyMatch } from '@/lib/utils/hotkeys';
import { parseContent } from '@/lib/utils/contentParser';
import { useSettingsStore } from '@/store/settingsStore';
import { AISynthesisDialog } from './AISynthesisDialog';
import { NodeErrorBoundary } from './NodeErrorBoundary';
import { PredictiveLinkingLayer } from './PredictiveLinkingLayer';
import { ActionDrawer } from './ActionDrawer';
import React from 'react';

const withErrorBoundary = (Component: React.ComponentType<Record<string, unknown>>) => {
  const Wrapped = (props: Record<string, unknown>) => (
    <NodeErrorBoundary nodeId={props.id as string}>
      <Component {...props} />
    </NodeErrorBoundary>
  );
  Wrapped.displayName = `WithErrorBoundary(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
};

// Memoize node components to prevent re-renders when other canvas state changes (Feature 3 logic integrated here for convenience)
const memoizeNode = (Component: React.ComponentType<Record<string, unknown>>) => {
  return memo(Component, (prev, next) => {
    return prev.data === next.data && 
           prev.selected === next.selected && 
           prev.dragging === next.dragging;
  });
};

const safeNodeTypes = Object.fromEntries(
  Object.entries(nodeTypes).map(([key, Component]) => [key, memoizeNode(withErrorBoundary(Component as React.ComponentType<Record<string, unknown>>))])
);

const TYPE_LABELS: Record<string, string> = {
  video: '🎥 Video', embed: '🔗 Embed', image: '🖼️ Image', pdf: '📄 PDF',
  codeSnippet: '💻 Code', math: '🧮 Math', table: '📊 Table',
  checklist: '✅ Checklist', summary: '📋 Summary', flashcard: '🃏 Flashcard',
  termQuestion: '📖 Term', aiNote: '📝 Note',
};

/** Compute absolute position of a node, accounting for parent nesting */
function getAbsolutePosition(node: Node, allNodes: Node[]): { x: number; y: number } {
  if (!node.parentId) return node.position;
  const parent = allNodes.find(n => n.id === node.parentId);
  if (!parent) return node.position;
  const parentPos = getAbsolutePosition(parent, allNodes);
  return { x: parentPos.x + node.position.x, y: parentPos.y + node.position.y };
}

/** Compute the best source/target handle IDs based on relative node positions */
function computeBestHandles(sourceNode: Node | undefined, targetNode: Node | undefined, allNodes: Node[]): { sourceHandle: string; targetHandle: string } {
  if (!sourceNode || !targetNode) return { sourceHandle: HANDLE_IDS.SOURCE.RIGHT, targetHandle: HANDLE_IDS.TARGET.LEFT };

  const sw = (sourceNode.style?.width as number) || sourceNode.measured?.width || 300;
  const sh = (sourceNode.style?.height as number) || sourceNode.measured?.height || 200;
  const tw = (targetNode.style?.width as number) || targetNode.measured?.width || 300;
  const th = (targetNode.style?.height as number) || targetNode.measured?.height || 200;

  const sPos = getAbsolutePosition(sourceNode, allNodes);
  const tPos = getAbsolutePosition(targetNode, allNodes);

  const sCx = sPos.x + sw / 2;
  const sCy = sPos.y + sh / 2;
  const tCx = tPos.x + tw / 2;
  const tCy = tPos.y + th / 2;

  const dx = tCx - sCx;
  const dy = tCy - sCy;

  let sourceHandle: string;
  let targetHandle: string;

  // Use a ratio threshold to prevent flickering when nodes are close on one axis
  const ratio = Math.abs(dx) / (Math.abs(dy) || 1);
  const horizontalDominant = ratio > 1.2;
  const verticalDominant = ratio < 0.8;

  if (horizontalDominant) {
    sourceHandle = dx > 0 ? HANDLE_IDS.SOURCE.RIGHT : HANDLE_IDS.SOURCE.LEFT;
    targetHandle = dx > 0 ? HANDLE_IDS.TARGET.LEFT : HANDLE_IDS.TARGET.RIGHT;
  } else if (verticalDominant) {
    sourceHandle = dy > 0 ? HANDLE_IDS.SOURCE.BOTTOM : HANDLE_IDS.SOURCE.TOP;
    targetHandle = dy > 0 ? HANDLE_IDS.TARGET.TOP : HANDLE_IDS.TARGET.BOTTOM;
  } else {
    // Diagonally positioned, check which side is closer to the edge
    if (Math.abs(dx) > Math.abs(dy)) {
      sourceHandle = dx > 0 ? HANDLE_IDS.SOURCE.RIGHT : HANDLE_IDS.SOURCE.LEFT;
      targetHandle = dx > 0 ? HANDLE_IDS.TARGET.LEFT : HANDLE_IDS.TARGET.RIGHT;
    } else {
      sourceHandle = dy > 0 ? HANDLE_IDS.SOURCE.BOTTOM : HANDLE_IDS.SOURCE.TOP;
      targetHandle = dy > 0 ? HANDLE_IDS.TARGET.TOP : HANDLE_IDS.TARGET.BOTTOM;
    }
  }

  return { sourceHandle, targetHandle };
}


export function CanvasWrapper() {
  const nodes = useNodes();
  const edges = useEdges();
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const setContextMenu = useCanvasStore((s) => s.setContextMenu);
  const setNodeContextMenu = useCanvasStore((s) => s.setNodeContextMenu);
  const setEdgeContextMenu = useCanvasStore((s) => s.setEdgeContextMenu);
  const contextMenu = useCanvasStore((s) => s.contextMenu);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const showMinimap = useCanvasStore((s) => s.showMinimap);
  const toggleMinimap = useCanvasStore((s) => s.toggleMinimap);
  const copySelectedNodes = useCanvasStore((s) => s.copySelectedNodes);
  const pasteNodes = useCanvasStore((s) => s.pasteNodes);
  const selectAllNodes = useCanvasStore((s) => s.selectAllNodes);
  const deleteSelected = useCanvasStore((s) => s.deleteSelected);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const workspaceId = useWorkspaceId();
  const canvasMode = useCanvasMode();
  const focusMode = useCanvasStore((s) => s.focusMode);
  const toggleFocusMode = useCanvasStore((s) => s.toggleFocusMode);
  const zenMode = useZenMode();
  const toggleZenMode = useCanvasStore((s) => s.toggleZenMode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const snapEnabled = useCanvasStore((s) => s.snapEnabled);
  const gridStyle = useCanvasStore((s) => s.gridStyle);
  const connectMode = useCanvasStore((s) => s.connectMode);
  const setConnectMode = useCanvasStore((s) => s.setConnectMode);
  const connectSourceId = useCanvasStore((s) => s.connectSourceId);
  const setConnectSourceId = useCanvasStore((s) => s.setConnectSourceId);
  const pushSnapshot = useCanvasStore((s) => s.pushSnapshot);
  const setLastCursorFlowPosition = useCanvasStore((s) => s.setLastCursorFlowPosition);
  const setStoreNodes = useCanvasStore((s) => s.setNodes);
  const isAISynthesisOpen = useCanvasStore((s) => s.isAISynthesisOpen);
  const setAISynthesisOpen = useCanvasStore((s) => s.setAISynthesisOpen);
  const zoomOnScroll = useCanvasStore((s) => s.zoomOnScroll);
  const exportProgress = useCanvasStore((s) => s.exportProgress);
  const disableVirtualization = useCanvasStore((s) => s.disableVirtualization);

  const hotkeys = useSettingsStore((s) => s.hotkeys);

  const [localNodes, setLocalNodes] = useState<Node[]>(nodes);
  const [isZoomedOut, setIsZoomedOut] = useState(false);
  const isDraggingRef = useRef(false);
  const prevNodes = useRef<Node[]>(nodes);

  type Guide = { type: 'v' | 'h'; pos: number; start: number; end: number; snapOffset?: number };
  const [guides, setGuides] = useState<Guide[]>([]);
  const [isShaking, setIsShaking] = useState(false);

  const triggerShake = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 400);
  }, []);

  useEffect(() => {
    const handleActionShake = () => triggerShake();
    window.addEventListener('canvas-action-shake', handleActionShake);
    return () => window.removeEventListener('canvas-action-shake', handleActionShake);
  }, [triggerShake]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      // More efficient check to avoid triggering updates if the store didn't actually change content
      const storeNodes = useCanvasStore.getState().nodes;
      if (storeNodes.length !== prevNodes.current.length) {
        setLocalNodes(storeNodes);
        prevNodes.current = storeNodes;
        return;
      }

      const hasChanged = storeNodes.some((node, i) => {
        const prev = prevNodes.current[i];
        if (!prev) return true;
        // Basic shallow comparison for common properties that would indicate a change
        return node.id !== prev.id || 
               node.position.x !== prev.position.x || 
               node.position.y !== prev.position.y ||
               node.data !== prev.data || 
               node.type !== prev.type ||
               node.selected !== prev.selected;
      });

      if (hasChanged) {
        setLocalNodes(storeNodes);
        prevNodes.current = storeNodes;
      }
    }
  }, [nodes]); 


  const debouncedSyncToStore = useMemo(
    () => debounce((n: Node[]) => setStoreNodes(n), 150),
    [setStoreNodes]
  );

  // Cleanup debounce on unmount to prevent leaks
  useEffect(() => {
    return () => {
      debouncedSyncToStore.cancel();
    };
  }, [debouncedSyncToStore]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setLocalNodes((prev) => {
        const nextNodes = applyNodeChanges(changes, prev);
        const isDrag = changes.some((c) => c.type === 'position' && (c as any).dragging);

        if (isDrag) {
          isDraggingRef.current = true;
          debouncedSyncToStore(nextNodes);
        } else {
          isDraggingRef.current = false;
          debouncedSyncToStore.cancel();
          // Defer store update to next tick to avoid React render phase warning
          setTimeout(() => onNodesChange(changes), 0);
        }
        return nextNodes;
      });
    },
    [onNodesChange, debouncedSyncToStore] // Removed guides dependency to break the loop
  );

  const reactFlowInstance = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const routerNavigate = useNavigate();
  const routerLocation = useLocation();

  const isMobile = useIsMobile();
  const [mobileBannerDismissed, setMobileBannerDismissed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const drawingMode = useCanvasStore((s) => s.drawingMode);
  const setDrawingMode = useCanvasStore((s) => s.setDrawingMode);
  const setViewport = useCanvasStore((s) => s.setViewport);

  const SNAP_THRESHOLD = 8;
  const isViewMode = canvasMode === 'view';

  // Compute alignment guides and handle snapping while dragging
  const handleNodeDrag = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (isViewMode) return;
    const instance = reactFlowInstance.current;
    if (!instance) return;

    const zoom = Math.max(instance.getZoom() || 1, 0.05);
    const dynamicThreshold = 15 / zoom;

    const { nodes } = useCanvasStore.getState();
    const newGuides: Guide[] = [];

    const dw = (typeof draggedNode.style?.width === 'number' ? draggedNode.style.width : draggedNode.measured?.width) || 300;
    const dh = (typeof draggedNode.style?.height === 'number' ? draggedNode.style.height : draggedNode.measured?.height) || 200;
    const dl = draggedNode.position.x;
    const dr = dl + dw;
    const dt = draggedNode.position.y;
    const db = dt + dh;
    const dcx = dl + dw / 2;
    const dcy = dt + dh / 2;

    for (const other of nodes) {
      if (other.id === draggedNode.id || other.parentId === draggedNode.id) continue;
      const ow = (typeof other.style?.width === 'number' ? other.style.width : other.measured?.width) || 300;
      const oh = (typeof other.style?.height === 'number' ? other.style.height : other.measured?.height) || 200;
      const ol = other.position.x;
      const or2 = ol + ow;
      const ot = other.position.y;
      const ob = ot + oh;
      const ocx = ol + ow / 2;
      const ocy = ot + oh / 2;

      // Vertical guides & Snapping (Left, Right, Center)
      for (const [dv, ov, isCenter] of [[dl, ol, false], [dl, or2, false], [dr, ol, false], [dr, or2, false], [dcx, ocx, true]]) {
        const distance = Math.abs((dv as number) - (ov as number));
        if (distance < dynamicThreshold) {
          newGuides.push({ 
            type: 'v', 
            pos: ov as number, 
            start: Math.min(dt, ot) - 50, 
            end: Math.max(db, ob) + 50,
            snapOffset: (ov as number) - (dv as number)
          });
        }
      }
      // Horizontal guides & Snapping (Top, Bottom, Center)
      for (const [dv, ov, isCenter] of [[dt, ot, false], [dt, ob, false], [db, ot, false], [db, ob, false], [dcy, ocy, true]]) {
        const distance = Math.abs((dv as number) - (ov as number));
        if (distance < dynamicThreshold) {
          newGuides.push({ 
            type: 'h', 
            pos: ov as number, 
            start: Math.min(dl, ol) - 50, 
            end: Math.max(dr, or2) + 50,
            snapOffset: (ov as number) - (dv as number)
          });
        }
      }
    }

    // Apply Snapping: Find the strongest snap for each axis
    const verticalSnaps = newGuides.filter(g => g.type === 'v').sort((a, b) => Math.abs(a.snapOffset!) - Math.abs(b.snapOffset!));
    const horizontalSnaps = newGuides.filter(g => g.type === 'h').sort((a, b) => Math.abs(a.snapOffset!) - Math.abs(b.snapOffset!));

    const verticalSnap = verticalSnaps[0];
    const horizontalSnap = horizontalSnaps[0];

    if (verticalSnap || horizontalSnap) {
      setLocalNodes(prev => prev.map(n => {
        if (n.id !== draggedNode.id) return n;
        return {
          ...n,
          position: {
            x: verticalSnap ? n.position.x + verticalSnap.snapOffset! : n.position.x,
            y: horizontalSnap ? n.position.y + horizontalSnap.snapOffset! : n.position.y,
          }
        };
      }));
    }

    // Round 5: Active Collision Repulsion
    // When dragging, nearby nodes gently push away to avoid overlap
    const REPULSION_RADIUS = 200;
    const REPULSION_STRENGTH = 1.2;

    const nearbyNodes = nodes.filter(n => {
      if (n.id === draggedNode.id || n.parentId === draggedNode.id) return false;
      const nx = n.position.x;
      const ny = n.position.y;
      const dist = Math.sqrt(Math.pow(dcx - nx, 2) + Math.pow(dcy - ny, 2));
      return dist < REPULSION_RADIUS;
    });

    if (nearbyNodes.length > 0) {
      setLocalNodes(prev => prev.map(n => {
        const isNearby = nearbyNodes.some(nn => nn.id === n.id);
        if (!isNearby) return n;

        const ncx = n.position.x + (n.measured?.width || 200) / 2;
        const ncy = n.position.y + (n.measured?.height || 100) / 2;
        
        const dx = ncx - dcx;
        const dy = ncy - dcy;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        
        if (distance < REPULSION_RADIUS) {
          const force = (REPULSION_RADIUS - distance) / REPULSION_RADIUS * REPULSION_STRENGTH;
          return {
            ...n,
            position: {
              x: n.position.x + (dx / distance) * force * 15,
              y: n.position.y + (dy / distance) * force * 15,
            }
          };
        }
        return n;
      }));
    }

    setGuides(newGuides);
  }, [isViewMode, setLocalNodes]);

  const handleNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    setGuides([]);
    isDraggingRef.current = false;
    debouncedSyncToStore.cancel();
    
    // We don't need a manual setStoreNodes here because onNodesChange 
    // will be called with the final position change (dragging: false)
    // which triggers the store update automatically.
  }, [debouncedSyncToStore]);

  // Sync repulsed nodes to store during drag
  const handleNodeDragSync = useCallback(() => {
    if (isDraggingRef.current) {
      // Keep local state in sync with dragging positions
    }
  }, []);

  // Apply locked state, view mode, focus mode
  const processedNodes = useMemo(() => {
    return localNodes
      .map((n) => {
        // When virtualization is disabled, ALL nodes are always rendered (shouldRender: true)
        // When enabled, heavy media nodes skip virtualization via shouldRender in data
        const forceRender = disableVirtualization;

        return {
          ...n,
          // Force render at node level for React Flow virtualization
          shouldRender: forceRender,
          data: { ...n.data, shouldRender: forceRender },
          draggable: !n.data?.locked,
          selectable: !n.data?.locked,
          connectable: !n.data?.locked,
          style: {
            ...n.style,
            opacity: focusMode && focusedNodeId && focusedNodeId !== n.id ? 0.15 : 1,
            transition: 'opacity 0.3s ease',
          },
        };
      }) as Node[];
  }, [localNodes, focusMode, focusedNodeId, disableVirtualization]);

  const throttledUpdateCursor = useMemo(() => 
    throttle((x: number, y: number) => {
      if (!workspaceId) return;
      const user = auth.currentUser;
      const userId = user?.uid || 'local';
      const name = user?.displayName || 'Guest';
      const color = '#6366f1'; // Default theme color
      updateCursorPositionInDb(workspaceId, userId, x, y, name, color);
    }, 80),
    [workspaceId]
  );

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (canvasMode !== 'edit' || !reactFlowInstance.current) return;
    const pos = reactFlowInstance.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    if (isNaN(pos.x) || isNaN(pos.y)) return;

    // Update local state for predictive features
    const prev = useCanvasStore.getState().lastCursorFlowPosition;
    if (!prev || Math.abs(prev.x - pos.x) > 5 || Math.abs(prev.y - pos.y) > 5) {
      useCanvasStore.setState({ lastCursorFlowPosition: pos }, false);
    }

    // Update global presence
    throttledUpdateCursor(pos.x, pos.y);
  }, [canvasMode, throttledUpdateCursor]);

  // Pro-level paste type detection with smart title extraction
  const detectPasteType = useCallback((text: string, html?: string) => {
    return parseContent(text, html);
  }, []);

  // Helper to get the best position for a new node (cursor or center)
  const getBestPastePosition = useCallback(() => {
    const { lastCursorFlowPosition } = useCanvasStore.getState();
    if (lastCursorFlowPosition) return { ...lastCursorFlowPosition };
    
    // Fallback to viewport center
    const rf = reactFlowInstance.current;
    if (rf) {
      const { x, y, zoom } = rf.getViewport();
      // Center of screen mapped to flow coordinates
      return rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
    return { x: 0, y: 0 };
  }, []);

  // Handle clipboard paste (images + text + nodes)
  const handleClipboardPaste = useCallback(async () => {
    try {
      // Try high-fidelity read first (supports images)
      const items = await navigator.clipboard.read().catch(() => null);
      
      if (items && items.length > 0) {
        for (const item of items) {
          // 1. Image binary data
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType && workspaceId) {
            const blob = await item.getType(imageType);
            const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: imageType });
            const nodeId = crypto.randomUUID();
            const pos = getBestPastePosition();
            addNode({
              id: nodeId,
              type: 'image',
              position: pos,
              data: { altText: 'Pasted image', uploading: true, progress: 0 },
              style: { width: 320, height: 280 },
            });

            const { uploadCanvasFile: upload } = await import('@/lib/r2/storage');
            upload(workspaceId, file).then(({ url, path }) => {
              useCanvasStore.getState().updateNodeData(nodeId, { storageKey: path, storageUrl: url, uploading: false, progress: 100 });
              toast.success('🖼️ Image pasted & uploaded');
            }).catch(() => {
              useCanvasStore.getState().updateNodeData(nodeId, { uploading: false });
              toast.error('Failed to upload pasted image');
            });
            return;
          }

          // 2. Text data from rich item
          let plainText = '';
          let htmlContent = '';
          if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            plainText = (await blob.text()).trim();
          }
          if (item.types.includes('text/html')) {
            const blob = await item.getType('text/html');
            htmlContent = (await blob.text()).trim();
          }

          if (plainText || htmlContent) {
            const detected = detectPasteType(plainText, htmlContent);
            const pos = getBestPastePosition();
            const firstLine = plainText.split('\n')[0].slice(0, 40).trim();

            addNode({
              id: crypto.randomUUID(),
              type: detected.type,
              position: pos,
              data: { 
                ...detected.data, 
                title: detected.data.title || (detected.type === 'aiNote' ? (firstLine || '📝 Note') : undefined)
              },
              style: detected.style || (detected.type === 'aiNote' ? { width: 420, height: 500 } : undefined),
            });
            window.dispatchEvent(new CustomEvent('canvas-action-shake'));
            toast.success(`${TYPE_LABELS[detected.type] || '📝 Note'} created from paste`);
            return;
          }
        }
      }

      // 3. Fallback for systems where read() fails but readText() works
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        const detected = detectPasteType(text.trim());
        const pos = getBestPastePosition();
        const firstLine = text.trim().split('\n')[0].slice(0, 40).trim();
        addNode({
          id: crypto.randomUUID(),
          type: detected.type,
          position: pos,
          data: { 
            ...detected.data, 
            title: detected.data.title || (detected.type === 'aiNote' ? (firstLine || '📝 Note') : undefined)
          },
          style: detected.style || (detected.type === 'aiNote' ? { width: 420, height: 500 } : undefined),
        });
        window.dispatchEvent(new CustomEvent('canvas-action-shake'));
        toast.success(`${TYPE_LABELS[detected.type] || '📝 Note'} created from paste`);
        return;
      }

      // 4. Final fallback: Internal node paste
      pasteNodes();
    } catch (err) {
      console.error('Paste failed:', err);
      pasteNodes();
    }
  }, [workspaceId, addNode, getBestPastePosition, detectPasteType, pasteNodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.tiptap-wrapper') || target.closest('.blocknote-wrapper') || target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const mod = e.metaKey || e.ctrlKey;

      if (isHotkeyMatch(e, hotkeys.undo)) { e.preventDefault(); undo(); }
      if (isHotkeyMatch(e, hotkeys.redo)) { e.preventDefault(); redo(); }
      if (isHotkeyMatch(e, hotkeys.copy)) { e.preventDefault(); copySelectedNodes(); }
      if (isHotkeyMatch(e, hotkeys.paste)) {
        e.preventDefault();
        const { clipboard } = useCanvasStore.getState();
        if (clipboard.length > 0) { pasteNodes(); } else { handleClipboardPaste(); }
      }
      if (isHotkeyMatch(e, hotkeys.selectAll)) { e.preventDefault(); selectAllNodes(); }
      if (isHotkeyMatch(e, hotkeys.fitView)) {
        e.preventDefault();
        reactFlowInstance.current?.fitView({ duration: 800 });
      }
      if (isHotkeyMatch(e, hotkeys.resetZoom)) {
        e.preventDefault();
        reactFlowInstance.current?.zoomTo(1, { duration: 800 });
      }
      if (isHotkeyMatch(e, hotkeys.toggleMinimap)) { e.preventDefault(); toggleMinimap(); }
      if (isHotkeyMatch(e, hotkeys.search)) { e.preventDefault(); openSearch(); }
      if (isHotkeyMatch(e, hotkeys.newNote)) {
        e.preventDefault();
        const pos = useCanvasStore.getState().lastCursorFlowPosition || { x: 0, y: 0 };
        addNode({
          id: crypto.randomUUID(),
          type: 'aiNote',
          position: pos,
          data: { title: 'New Note', content: null },
          style: { width: 380, height: 500 },
        });
      }
      if (isHotkeyMatch(e, hotkeys.newV2Note || 'mod+n')) {
        e.preventDefault();
        const pos = useCanvasStore.getState().lastCursorFlowPosition || { x: 0, y: 0 };
        addNode({
          id: crypto.randomUUID(),
          type: 'v2Note',
          position: pos,
          data: { title: 'New V2 Note', content: [], blockVersion: 2 },
          style: { width: 380, height: 500 },
        });
      }
      if (isHotkeyMatch(e, hotkeys.toggleZenMode)) { e.preventDefault(); toggleZenMode(); }
      if (isHotkeyMatch(e, hotkeys.toggleFocusMode)) { e.preventDefault(); toggleFocusMode(); }
      if (isHotkeyMatch(e, hotkeys.toggleDrawingMode)) { e.preventDefault(); setDrawingMode(!drawingMode); }

      // Delete selected nodes/edges
      if (e.key === 'Delete' || (e.key === 'Backspace' && !mod)) {
        const { nodes: currentNodes } = useCanvasStore.getState();
        const selectedNodes = currentNodes.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          e.preventDefault();
          deleteSelected();
          window.dispatchEvent(new CustomEvent('canvas-action-shake'));
          toast.success(`Deleted ${selectedNodes.length} node(s)`);
        }
      }

      // Arrow keys to pan the canvas
      const PAN_STEP = 80;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const rf = reactFlowInstance.current;
        if (!rf) return;
        // Don't pan if nodes are selected (let React Flow handle node movement)
        const selectedNodes = rf.getNodes().filter((n: Node) => n.selected);
        if (selectedNodes.length > 0) return;
        e.preventDefault();
        const { x, y, zoom } = rf.getViewport();
        const dx = e.key === 'ArrowLeft' ? PAN_STEP : e.key === 'ArrowRight' ? -PAN_STEP : 0;
        const dy = e.key === 'ArrowUp' ? PAN_STEP : e.key === 'ArrowDown' ? -PAN_STEP : 0;
        rf.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 300 }); // Smoother
      }

      // Tab to cycle nodes spatially
      if (e.key === 'Tab') {
        e.preventDefault();
        const nodes = useCanvasStore.getState().nodes;
        if (nodes.length === 0) return;

        // Sort nodes spatially: top-down, then left-to-right with some vertical tolerance
        const sortedNodes = [...nodes].sort((a, b) => {
          const dy = a.position.y - b.position.y;
          if (Math.abs(dy) < 100) { // Same horizontal belt
            return a.position.x - b.position.x;
          }
          return dy;
        });

        const selectedIndex = sortedNodes.findIndex(n => n.selected);
        let nextIndex = 0;
        
        if (e.shiftKey) {
          nextIndex = selectedIndex <= 0 ? sortedNodes.length - 1 : selectedIndex - 1;
        } else {
          nextIndex = selectedIndex === -1 || selectedIndex === sortedNodes.length - 1 ? 0 : selectedIndex + 1;
        }

        const nextNode = sortedNodes[nextIndex];
        if (nextNode) {
          // Update selection
          setLocalNodes(prev => prev.map(n => ({ ...n, selected: n.id === nextNode.id })));
          
          // Smoother camera jump
          const rf = reactFlowInstance.current;
          if (rf) {
            const zoom = Math.max(rf.getZoom() || 0.8, 0.1);
            rf.setCenter(
              nextNode.position.x + (nextNode.measured?.width || 300) / 2,
              nextNode.position.y + (nextNode.measured?.height || 200) / 2,
              { duration: 800, zoom }
            );
          }
        }
      }

      if (e.key === 'Escape') {
        setContextMenu(null);
        setNodeContextMenu(null);
        if (drawingMode) setDrawingMode(false);
        if (useCanvasStore.getState().connectMode) {
          useCanvasStore.getState().setConnectMode(false);
          toast.info('Connector mode cancelled');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copySelectedNodes, pasteNodes, selectAllNodes, toggleMinimap, setContextMenu, setNodeContextMenu, drawingMode, setDrawingMode, handleClipboardPaste, hotkeys, addNode, deleteSelected, toggleZenMode, toggleFocusMode]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!reactFlowInstance.current) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setContextMenu({
        x: Math.min(event.clientX, window.innerWidth - 220),
        y: Math.min(event.clientY, window.innerHeight - 300),
        canvasX: position.x,
        canvasY: position.y,
      });
    },
    [setContextMenu]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setNodeContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    [setNodeContextMenu]
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: any) => {
      event.preventDefault();
      setEdgeContextMenu({
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
      });
    },
    [setEdgeContextMenu]
  );

  // Auto bring-to-front all selected nodes after box select
  // Also auto-pan to show selected nodes (bypasses virtualization issues with far-away nodes)
  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    if (selectedNodes.length > 1) {
      const ids = selectedNodes.map((n) => n.id);
      useCanvasStore.getState().bringNodesToFront(ids);
    }
    
    // Auto-pan to show selected node(s) - ensures selected nodes are always visible
    if (selectedNodes.length === 1 && reactFlowInstance.current) {
      const node = selectedNodes[0];
      const instance = reactFlowInstance.current;
      const viewport = instance.getViewport();
      const nodeWidth = (node.style?.width as number) || node.measured?.width || 300;
      const nodeHeight = (node.style?.height as number) || node.measured?.height || 200;
      const x = node.position.x;
      const y = node.position.y;
      
      // Calculate viewport bounds
      const viewWidth = window.innerWidth / viewport.zoom;
      const viewHeight = window.innerHeight / viewport.zoom;
      const viewX = -viewport.x / viewport.zoom;
      const viewY = -viewport.y / viewport.zoom;
      
      // Check if node is outside viewport
      const isOutsideX = x < viewX || x + nodeWidth > viewX + viewWidth;
      const isOutsideY = y < viewY || y + nodeHeight > viewY + viewHeight;
      
      // Pan to show node if outside viewport
      if (isOutsideX || isOutsideY) {
        const padding = 100;
        const centerX = x + nodeWidth / 2 - viewWidth / 2;
        const centerY = y + nodeHeight / 2 - viewHeight / 2;
        instance.setViewport({
          x: -centerX * viewport.zoom + padding,
          y: -centerY * viewport.zoom + padding,
          zoom: viewport.zoom,
        }, { duration: 300 });
      }
    }
  }, []);

  const handlePaneClick = useCallback(() => {
    if (contextMenu) setContextMenu(null);
    setNodeContextMenu(null);
    if (focusMode) setFocusedNodeId(null);
  }, [contextMenu, setContextMenu, setNodeContextMenu, focusMode, setFocusedNodeId]);

  // Double-click on empty canvas disabled - was creating unwanted AINote nodes
  const handlePaneDoubleClick = useCallback(() => {}, []);

  // In focus mode, clicking a node focuses it
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    // Always bring clicked node to front
    useCanvasStore.getState().bringToFront(node.id);

    if (connectMode) {
      if (!connectSourceId) {
        setConnectSourceId(node.id);
        toast.info('Now click the target node');
      } else if (node.id !== connectSourceId) {
        pushSnapshot();
        const { edges: currentEdges, nodes: allNodes } = useCanvasStore.getState();

        // Compute best handles based on relative node positions
        const sourceNode = allNodes.find(n => n.id === connectSourceId);
        const targetNode = node;
        const { sourceHandle, targetHandle } = computeBestHandles(sourceNode, targetNode, allNodes);

        useCanvasStore.setState({
          edges: [...currentEdges, {
            id: crypto.randomUUID(),
            source: connectSourceId,
            target: node.id,
            sourceHandle,
            targetHandle,
            type: 'custom',
            animated: false,
            data: { color: 'hsl(0, 0%, 40%)', thickness: 2, lineStyle: 'solid', pathType: 'bezier', markerEndStyle: 'arrow', markerStartStyle: 'none', opacity: 100 },
          }],
        });
        setConnectMode(false);
        toast.success('Connection created');
      }
      return;
    }
    if (focusMode) {
      setFocusedNodeId(node.id);
    }
  }, [connectMode, connectSourceId, focusMode, setFocusedNodeId, setConnectSourceId, setConnectMode, pushSnapshot]);

  // Drag and drop file handling
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);


  const handleNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
    if (isViewMode) return;
    
    // Alt+Drag Duplication: if alt is pressed, clone the node at its current position
    // The "original" node continues moving, the clone stays behind.
    if (event.altKey) {
      const { nodes: currentNodes } = useCanvasStore.getState();
      const nodeToClone = currentNodes.find(n => n.id === node.id);
      if (nodeToClone) {
        // Create duplicate with new ID but same position and data
        const cloneId = crypto.randomUUID();
        const clone = {
          ...nodeToClone,
          id: cloneId,
          selected: false,
          dragging: false,
          // Deep clone data to avoid reference sharing
          data: JSON.parse(JSON.stringify(nodeToClone.data)),
        };
        
        setLocalNodes(prev => [...prev, clone]);
        toast.info('Node duplicated via Alt-Drag', { icon: '✨', duration: 1500 });
      }
    }
  }, [isViewMode]);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);

    if (!reactFlowInstance.current || !workspaceId) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    const position = reactFlowInstance.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const officeMimes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      const isPDF = file.type === 'application/pdf' || ext === 'pdf';
      const isOfficeDoc = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext) || officeMimes.includes(file.type);
      const isTextFile = ['csv', 'txt'].includes(ext);
      const isImage = file.type.startsWith('image/');

      if (!isPDF && !isOfficeDoc && !isTextFile && !isImage) {
        toast.error(`Unsupported file: ${file.name}`);
        continue;
      }

      const nodeId = crypto.randomUUID();
      const isDocNode = isPDF || isOfficeDoc || isTextFile;
      const nodeType = isDocNode ? 'pdf' : 'image';

      const fileType = isDocNode ? ext : undefined;

      const placeholderData = isDocNode
        ? { fileName: file.name, fileSize: file.size, fileType, uploading: true, progress: 0 }
        : { altText: file.name, uploading: true, progress: 0 };

      const size = isDocNode ? { width: 220, height: 80 } : { width: 320, height: 280 };

      addNode({
        id: nodeId,
        type: nodeType,
        position: { x: position.x + i * 40, y: position.y + i * 40 },
        data: placeholderData,
        style: { width: size.width, height: size.height },
      });

      try {
        const { url, path } = await uploadCanvasFile(workspaceId, file);
        const { updateNodeData } = useCanvasStore.getState();
        updateNodeData(nodeId, {
          storageKey: path,
          storageUrl: url,
          uploading: false,
          progress: 100,
        });
        toast.success(`${file.name} uploaded`);
      } catch (err) {
        console.error(err);
        toast.error(`Failed to upload ${file.name}`);
        const { updateNodeData } = useCanvasStore.getState();
        updateNodeData(nodeId, { uploading: false });
      }
    }
  }, [workspaceId, addNode]);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (!reactFlowInstance.current) return;
    const { x, y } = node.position;
    const w = node.measured?.width || 300;
    const h = node.measured?.height || 200;
    reactFlowInstance.current.setCenter(x + w / 2, y + h / 2, { duration: 800, zoom: 1 });
  }, []);

  return (
    <div
      className={cn(
        "h-screen w-screen transition-colors relative",
        connectMode ? 'cursor-crosshair' : '',
        isShaking && "shake-canvas"
      )}
      style={{ background: 'var(--canvas-bg-gradient)' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="application"
      aria-label="CtxNote infinite canvas"
      aria-roledescription="knowledge graph canvas"
    >
      {/* Subtle gradient overlay for depth */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/20" />
      { /* Drag overlay */ }
      {/* Drag overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/5 backdrop-blur-[8px]"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-3xl border-2 border-dashed border-primary/50 glass-morphism-strong px-12 py-10 text-center pro-shadow"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                <Upload className="h-8 w-8 animate-bounce" />
              </div>
              <p className="text-xl font-black uppercase tracking-[4px] text-primary">
                Drop to Import
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                PDF, IMAGES, OR OFFICE DOCUMENTS
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isAISynthesisOpen && (
        <AISynthesisDialog 
          selectedNodes={nodes.filter(n => n.selected)}
          onClose={() => setAISynthesisOpen(false)}
        />
      )}
      
      {isMobile && !mobileBannerDismissed && (
        <div className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-between border-b-2 border-primary bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground">
          <span>Desktop recommended for best experience</span>
          <button onClick={() => setMobileBannerDismissed(true)} className="ml-2 font-bold">✕</button>
        </div>
      )}
      <ReactFlow
        key={`rf-${disableVirtualization}`}
        onlyRenderVisibleElements={!disableVirtualization}
        className={cn(isZoomedOut && 'zoom-out')}
        nodes={processedNodes}
        edges={edges.map(e => ({ ...e, zIndex: 0 }))}
        onNodesChange={isViewMode ? undefined : handleNodesChange}
        onEdgesChange={isViewMode ? undefined : onEdgesChange}
        onConnect={isViewMode ? undefined : onConnect}
        onInit={(instance) => { 
          reactFlowInstance.current = instance as ReactFlowInstance<Node, Edge>; 
          // Sync initial viewport to store for DrawingOverlay
          const vp = instance.getViewport();
          if (!isNaN(vp.x) && !isNaN(vp.y) && !isNaN(vp.zoom)) {
            setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom });
          }
          // Restore viewport from URL hash on load
          if (routerLocation.hash.startsWith('#viewport=')) {
            const [x, y, z] = routerLocation.hash.replace('#viewport=', '').split(',');
            if (x && y && z) {
              const vx = parseFloat(x);
              const vy = parseFloat(y);
              const vz = parseFloat(z);
              
              if (!isNaN(vx) && !isNaN(vy) && !isNaN(vz) && vz >= 0.1 && vz <= 2 && isFinite(vx) && isFinite(vy)) {
                // use timeout to ensure nodes have rendered bounds
                setTimeout(() => {
                  instance.setViewport({ x: vx, y: vy, zoom: vz });
                  setViewport({ x: vx, y: vy, zoom: vz });
                }, 150);
                return; // Prioritize hash over auto-fit
              }
            }
          }

          // Mobile Responsive Zoom: If no hash and on mobile, fit view with more padding
          if (isMobile && nodes.length > 0) {
            setTimeout(() => {
              instance.fitView({ padding: 0.5, duration: 400 });
            }, 300);
          }
        }}
        onNodeDoubleClick={(_e, node) => {
          if (reactFlowInstance.current) {
            reactFlowInstance.current.setCenter(
              node.position.x + (node.measured?.width || 0) / 2,
              node.position.y + (node.measured?.height || 0) / 2,
              { duration: 800, zoom: 1.2 }
            );
          }
        }}
        onPaneClick={handlePaneClick}
        onDoubleClick={handlePaneDoubleClick}
        onNodeClick={handleNodeClick}
        onMouseMove={handleMouseMove}
        onMove={useCallback((_, viewport) => {
          if (viewport.zoom < 0.5 !== isZoomedOut) {
            setIsZoomedOut(viewport.zoom < 0.5);
          }
          // Sync viewport for DrawingOverlay
          setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
        }, [isZoomedOut, setViewport])}
        onMoveEnd={useCallback((_, viewport) => {
          // Update zoom-out state one last time to be sure
          setIsZoomedOut(viewport.zoom < 0.5);
          
          // Guard against NaN in viewport before syncing to URL
          if (isNaN(viewport.x) || isNaN(viewport.y) || isNaN(viewport.zoom)) return;

          // Sync viewport state to URL immediately
          const hash = `#viewport=${Math.round(viewport.x)},${Math.round(viewport.y)},${viewport.zoom.toFixed(2)}`;
          if (routerLocation.hash !== hash) {
            routerNavigate({ hash }, { replace: true });
          }
        }, [routerLocation, routerNavigate])}
        onPaneContextMenu={isViewMode ? undefined : handleContextMenu}
        onNodeContextMenu={isViewMode ? undefined : handleNodeContextMenu}
        onEdgeContextMenu={isViewMode ? undefined : onEdgeContextMenu}
        onNodeDragStart={isViewMode ? undefined : handleNodeDragStart}
        onNodeDrag={isViewMode ? undefined : handleNodeDrag}
        onNodeDragStop={isViewMode ? undefined : handleNodeDragStop}
        nodeTypes={safeNodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid={snapEnabled}
        snapGrid={[12, 12]}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={['Delete', 'Backspace']}
        onSelectionChange={handleSelectionChange}
        selectionOnDrag={!isViewMode && !connectMode}
        selectionMode={SelectionMode.Partial}
        // Pan: view mode = any button, connect mode = middle only, edit mode = left+middle
        panOnDrag={isViewMode ? true : connectMode ? [2] : [1, 2]}
        zoomOnScroll={zoomOnScroll}
        panOnScroll={!zoomOnScroll}
        nodesDraggable={!isViewMode}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={50}
        nodesConnectable={!isViewMode}
        elementsSelectable={!isViewMode}
        proOptions={{ hideAttribution: true }}
        autoPanOnNodeDrag={true}
        autoPanOnConnect={true}
        connectionLineStyle={{
          stroke: 'hsl(var(--primary))',
          strokeWidth: 2,
          strokeDasharray: '5,5',
        }}
        defaultEdgeOptions={{
          type: 'custom',
          animated: false,
        }}
      >
        {gridStyle !== 'blank' && (
          <Background
            variant={
              gridStyle === 'dots' ? BackgroundVariant.Dots :
              gridStyle === 'lines' || gridStyle === 'graph' ? BackgroundVariant.Lines :
              BackgroundVariant.Cross
            }
            color={gridStyle === 'graph' ? "hsl(var(--primary)/0.05)" : "hsl(var(--canvas-dot))"}
            gap={gridStyle === 'graph' ? 20 : 24}
            size={gridStyle === 'dots' ? 1.5 : 1}
          />
        )}
        {gridStyle === 'graph' && (
          <Background
            variant={BackgroundVariant.Lines}
            color="hsl(var(--primary)/0.1)"
            gap={100}
            size={1.5}
          />
        )}
        <AlignmentGuidesLayer guides={guides} />
        
        {/* Breadcrumbs HUD */}
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 z-[10] flex flex-col items-center gap-2 pointer-events-none">
          <div className="pointer-events-auto">
          <Breadcrumbs 
            nodes={nodes}
            edges={edges}
            selectedNodeId={nodes.find(n => n.selected)?.id}
            onNavigate={(id) => {
              if (!id) {
                reactFlowInstance.current?.fitView({ duration: 800 });
              } else {
                const node = nodes.find(n => n.id === id);
                if (node && reactFlowInstance.current) {
                  const nx = isNaN(node.position.x) ? 0 : node.position.x;
                  const ny = isNaN(node.position.y) ? 0 : node.position.y;
                  const nw = isNaN(node.measured?.width ?? NaN) ? 300 : (node.measured?.width || 300);
                  const nh = isNaN(node.measured?.height ?? NaN) ? 200 : (node.measured?.height || 200);

                  reactFlowInstance.current.setCenter(
                    nx + nw / 2,
                    ny + nh / 2,
                    { duration: 800, zoom: 1.2 }
                  );
                  // Also select the node
                  setLocalNodes(prev => prev.map(n => ({ ...n, selected: n.id === id })));
                }
              }
            }}
          />
          </div>
        </div>

        <MagicCursorsLayer />
        <LinkPeekCard />

        {showMinimap && !zenMode && (
          <div 
            onClick={(e) => {
              if (!reactFlowInstance.current) return;
              const target = e.currentTarget as HTMLElement;
              const rect = target.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              const y = (e.clientY - rect.top) / rect.height;
              
              // Estimate the bounds of the "actual" content in the minimap
              // This is a simplified teleport to the center of the workspace based on click
              // React Flow's MiniMap handles this better if we use standard props, but let's add a custom feel
              const rf = reactFlowInstance.current;
              const nodes = rf.getNodes();
              if (nodes.length === 0) return;
              
              const bounds = rf.getNodes().reduce((acc, n) => ({
                minX: Math.min(acc.minX, n.position.x),
                maxX: Math.max(acc.maxX, n.position.x + (n.measured?.width || 0)),
                minY: Math.min(acc.minY, n.position.y),
                maxY: Math.max(acc.maxY, n.position.y + (n.measured?.height || 0)),
              }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
              
              const targetX = bounds.minX + (bounds.maxX - bounds.minX) * x;
              const targetY = bounds.minY + (bounds.maxY - bounds.minY) * y;
              
              if (isNaN(targetX) || isNaN(targetY) || !isFinite(targetX) || !isFinite(targetY)) return;

              const currentZoom = Math.max(rf.getZoom() || 1, 0.1);
              rf.setCenter(targetX, targetY, { duration: 800, zoom: isNaN(currentZoom) ? 1 : currentZoom });
              toast.info('Teleporting viewport…', { icon: '🚀', duration: 1500 });
            }}
          >
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground)/0.2)')}
              maskColor="hsl(var(--background)/0.5)"
            />
          </div>
        )}
        
        {!zenMode && (
          <>
            <HistoryPanel />
            <WorkspaceTabs />
            <NodeSearchPanel />
            <CanvasToolbar />
            <AddNodeToolbar />
          </>
        )}

        {zenMode && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleZenMode}
            className="fixed bottom-[180px] right-6 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary shadow-xl backdrop-blur-md border border-primary/20 hover:bg-primary/20 transition-all duration-300 group"
          >
            <Eye className="h-6 w-6 group-hover:scale-110 transition-transform" />
            <div className="absolute right-14 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Exit Zen Mode
            </div>
          </motion.button>
        )}

        <EdgeContextMenu />
        <svg style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth={6}
              markerHeight={6}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="hsl(0, 0%, 40%)" />
            </marker>
            <marker
              id="arrow-selected"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth={6}
              markerHeight={6}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="hsl(52, 100%, 50%)" />
            </marker>
          </defs>
        </svg>
        <PredictiveLinkingLayer />
      </ReactFlow>
      <CanvasContextMenu />
      <NodeContextMenu />
      <NodeExpandModal />
      <SearchPalette />
      <CommandPalette />
      <ThemeEditor />
      <NodeSelectionToolbar />
      <SelectionToolbar />
      <ActionPalette />
      <TutorialSystem />
      <ActionDrawer />
      <PomodoroTimer />
      <PinnedNodesPanel />
      <CanvasStats />
      <KeyboardShortcutsPanel />
      <PresentationMode />
      <DrawingLayer
        active={drawingMode}
        onFinish={() => setDrawingMode(false)}
      />
      <DrawingOverlay />

      <AnimatePresence>
        {nodes.length === 0 && !dragOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-empty-workspace"
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-[2.5rem] glass-morphism-strong px-12 py-10 text-center pro-shadow max-w-lg border border-white/5"
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary/10 text-primary shadow-2xl shadow-primary/20 animate-pulse">
                <Sparkles className="h-10 w-10 fill-primary/20" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-[6px] text-foreground mb-4">Start Creating</h3>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 leading-relaxed mb-8 max-w-[280px] mx-auto">
                Your canvas is a blank slate. Bring your ideas to life with nodes, connections, and AI.
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-4 border border-white/5 shadow-inner">
                  <MousePointerClick className="h-5 w-5 text-primary/60" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-foreground/40">Double Click</span>
                  <span className="text-[10px] font-bold text-foreground/60">Creative Note</span>
                </div>
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-4 border border-white/5 shadow-inner">
                  <Search className="h-5 w-5 text-primary/60" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-foreground/40">Command + K</span>
                  <span className="text-[10px] font-bold text-foreground/60">Quick Search</span>
                </div>
              </div>
              
              <div className="mt-8 flex justify-center gap-2 items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                <Upload className="h-3 w-3" />
                <span>Or Drop Files Anywhere</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {exportProgress !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-md"
          >
            <div className="w-full max-w-md rounded-3xl glass-morphism-strong p-8 pro-shadow border border-white/10 text-center">
              <Sparkles className="mx-auto mb-4 h-12 w-12 text-primary animate-pulse" />
              <h3 className="text-xl font-black uppercase tracking-[4px] text-foreground mb-2">Exporting Magic</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-8">Preparing your creative assets...</p>
              
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${exportProgress}%` }}
                  className="absolute h-full bg-primary shadow-[0_0_20px_hsla(var(--primary),0.5)] transition-all duration-300"
                />
                <div className="progress-shimmer absolute inset-0 opacity-40" />
              </div>
              
              <div className="mt-4 flex justify-between text-[10px] font-black uppercase tracking-widest text-primary/60">
                <span>{Math.round(exportProgress)}%</span>
                <span>Complete</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
