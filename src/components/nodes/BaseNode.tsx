import { Handle, Position, useNodeId, useStore, NodeResizer } from '@xyflow/react';
import { memo, useMemo, useCallback, type ReactNode } from 'react';
import { MoreHorizontal, Lock, ChevronDown, ChevronRight, Expand, Trash2, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useCanvasStore } from '@/store/canvasStore';
import { motion, AnimatePresence } from 'framer-motion';
import { HANDLE_IDS } from '@/lib/constants/canvas';
import { useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { extractNodeContent } from '@/lib/utils/contentExtractor';
import { cn } from '@/lib/utils';

const LOD_THRESHOLD = 0.45;
const ULTIMATE_LOD_THRESHOLD = 0.2;

function formatSafeDate(dateString: string | undefined, fallback: string = 'recently'): string {
  if (!dateString) return fallback;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return fallback;
  return formatDistanceToNow(date, { addSuffix: true });
}

const NODE_COLORS: Record<string, { border: string; bg: string }> = {
  blue:    { border: 'border-l-blue-500',   bg: 'bg-blue-500/5' },
  green:   { border: 'border-l-green-500',  bg: 'bg-green-500/5' },
  red:     { border: 'border-l-red-500',    bg: 'bg-red-500/5' },
  purple:  { border: 'border-l-purple-500', bg: 'bg-purple-500/5' },
  yellow:  { border: 'border-l-yellow-400', bg: 'bg-yellow-400/5' },
};

const TAG_COLORS: Record<string, string> = {
  'Important': 'bg-destructive/80 text-destructive-foreground',
  'Review': 'bg-primary/30 text-primary-foreground',
  'Done': 'bg-accent text-accent-foreground',
  'Todo': 'bg-primary/50 text-primary-foreground',
  'Question': 'bg-secondary text-secondary-foreground',
  'Idea': 'bg-muted text-foreground',
};

// Node type visual accents for better differentiation
const NODE_TYPE_ACCENTS: Record<string, { border: string; indicator: string }> = {
  aiNote: { border: 'border-l-primary', indicator: 'bg-primary' },
  summary: { border: 'border-l-yellow', indicator: 'bg-yellow' },
  termQuestion: { border: 'border-l-orange', indicator: 'bg-orange' },
  lectureNotes: { border: 'border-l-cyan', indicator: 'bg-cyan' },
  stickyNote: { border: 'border-l-yellow', indicator: 'bg-yellow' },
  checklist: { border: 'border-l-green', indicator: 'bg-green' },
  pdf: { border: 'border-l-red', indicator: 'bg-red' },
  image: { border: 'border-l-green', indicator: 'bg-green' },
  flashcard: { border: 'border-l-purple', indicator: 'bg-purple' },
  embed: { border: 'border-l-cyan', indicator: 'bg-cyan' },
  math: { border: 'border-l-purple', indicator: 'bg-purple' },
  video: { border: 'border-l-red', indicator: 'bg-red' },
  table: { border: 'border-l-cyan', indicator: 'bg-cyan' },
  codeSnippet: { border: 'border-l-green', indicator: 'bg-green' },
  text: { border: 'border-l-muted-foreground', indicator: 'bg-muted-foreground' },
  drawing: { border: 'border-l-primary', indicator: 'bg-primary' },
  v2Note: { border: 'border-l-violet-400', indicator: 'bg-violet-400' },
};

function getDueDateColor(dueDate: string): string {
  const now = new Date();
  const due = new Date(dueDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay < today) return 'bg-destructive text-destructive-foreground';
  if (dueDay.getTime() === today.getTime()) return 'bg-primary/60 text-primary-foreground';
  return 'bg-muted text-muted-foreground';
}

interface BaseNodeProps {
  children: ReactNode;
  id?: string;
  title?: string;
  icon?: ReactNode;
  selected?: boolean;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  onTitleChange?: (title: string) => void;
  handles?: boolean;
  headerExtra?: ReactNode;
  onMenuClick?: (e: React.MouseEvent) => void;
  locked?: boolean;
  tags?: string[];
  collapsed?: boolean;
  summary?: string | React.ReactNode;
  onToggleCollapse?: () => void;
  emoji?: string;
  dueDate?: string;
  opacity?: number;
  createdAt?: string;
  footerStats?: string;
  nodeType?: string;
  color?: string;
  progress?: number;
  isSyncing?: boolean;
}

function ToolbarAction({ 
  icon, 
  onClick, 
  tip, 
  className 
}: { 
  icon: React.ReactNode; 
  onClick: (e: React.MouseEvent) => void; 
  tip: string; 
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "rounded-lg p-1.5 text-muted-foreground/60 transition-all hover:bg-white/10 hover:text-foreground active:scale-90",
            className
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent className="premium-tooltip" sideOffset={8}>
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export const BaseNode = memo(({
  children,
  id,
  title,
  icon,
  selected,
  className,
  headerClassName,
  bodyClassName,
  onTitleChange,
  handles = true,
  headerExtra,
  onMenuClick,
  locked,
  tags,
  collapsed,
  onToggleCollapse,
  emoji,
  dueDate,
  opacity = 100,
  createdAt,
  footerStats,
  nodeType,
  color,
  progress,
  summary,
  isSyncing,
}: BaseNodeProps) => {
  const nodeTags = Array.from(new Set(tags || []));
  const reactFlowNodeId = useNodeId();
  const nodeId = id || reactFlowNodeId;

  // Get current node from store to check for persisted style dimensions
  const currentNode = useCanvasStore((s) => {
    const nid = id || reactFlowNodeId;
    if (!nid) return undefined;
    return s.nodes.find(n => n.id === nid);
  });

  // Initialize from style if available (preserves resized dimensions)
  const initialStyle = useMemo(() => {
    if (currentNode?.style?.width && currentNode?.style?.height) {
      return {
        width: currentNode.style.width as number,
        height: currentNode.style.height as number,
      };
    }
    return undefined;
  }, [currentNode?.style?.width, currentNode?.style?.height]);

  // Performance: Only subscribe to edges connected to this specific node
  // Using useStore carefully to avoid global re-renders
  const edgeCount = useStore(useCallback((s) => {
    if (!nodeId) return 0;
    return s.edges.filter(e => e.source === nodeId || e.target === nodeId).length;
  }, [nodeId]));

  const detectedType = useCanvasStore((s) => {
    const nid = id || reactFlowNodeId;
    if (!nid) return undefined;
    const node = s.nodes.find(n => n.id === nid);
    return node?.type;
  });
  const setExpandedNode = useCanvasStore((s) => s.setExpandedNode);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNodeStyle = useCanvasStore((s) => s.updateNodeStyle);
  const canvasMode = useCanvasStore((s) => s.canvasMode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const isFocused = nodeId && focusedNodeId === nodeId;
  const isHighlighted = useCanvasStore((s) => nodeId && s.highlightedNodeIds.includes(nodeId));
  const isDeepWorkActive = useCanvasStore((s) => s.isDeepWorkActive);
  const zoom = useStore(useCallback((s) => s.transform[2], []));
  const isMobile = useIsMobile();
  const saveStatus = useCanvasStore((s) => s.saveStatus);
  const isDirty = useCanvasStore((s) => nodeId && s._dirtyNodeDataIds.has(nodeId));
  const nodeSyncing = saveStatus === 'saving' || isDirty || isSyncing;
  const hasSyncError = saveStatus === 'error';
  
  const handleCopyNodeContent = useCallback(async () => {
    if (!nodeId) return;
    
    try {
      // Get the node from the store
      const { nodes } = useCanvasStore.getState();
      const node = nodes.find(n => n.id === nodeId);
      
      if (!node) {
        toast.error('Node not found');
        return;
      }
      
      const content = extractNodeContent(node);
      
      if (!content) {
        toast.info('No content to copy');
        return;
      }
      
      await navigator.clipboard.writeText(content);
      toast.success('Node content copied to clipboard');
    } catch (error) {
      console.error('Failed to copy node content:', error);
      toast.error('Failed to copy node content');
    }
  }, [nodeId]);

  const isRelevantInDeepWork = useMemo(() => {
    if (!isDeepWorkActive || !focusedNodeId || !nodeId) return true;
    if (nodeId === focusedNodeId) return true;
    // We'll perform a quick store-lookup here to avoid re-rendering entire component on unrelated edge changes
    const edges = useCanvasStore.getState().edges;
    return edges.some(e => 
      (e.source === nodeId && e.target === focusedNodeId) || 
      (e.target === nodeId && e.source === focusedNodeId)
    );
  }, [isDeepWorkActive, focusedNodeId, nodeId]);

  const resolvedType = nodeType || detectedType;
  const accent = resolvedType ? NODE_TYPE_ACCENTS[resolvedType] : undefined;
  const userColor = color && color !== 'default' ? NODE_COLORS[color] : undefined;

const accentDot = accent?.indicator || 'bg-primary';
  const accentBorder = resolvedType ? `border-l-[1px] ${accent?.border || 'border-l-border'}` : '';

  const Wrapper = motion.div;
  const nodeContent = (
    <Wrapper
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: isRelevantInDeepWork ? (opacity ?? 100) / 100 : 0.1, 
        scale: isRelevantInDeepWork ? 1 : 0.98,
        filter: isRelevantInDeepWork ? 'none' : 'grayscale(1) blur(1px)'
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`animate-node-appear group/node flex flex-col h-full bg-card/80 backdrop-blur-sm relative rounded-xl border border-border/30 ${accentBorder} ${
        selected
          ? 'shadow-[var(--premium-shadow-md)] scale-[1.01] z-50 ring-1 ring-primary/20'
          : 'shadow-[var(--premium-shadow-sm)] hover:shadow-[var(--premium-shadow-md)] hover:scale-[1.01]'
      } ${
        isFocused ? 'ring-2 ring-primary/40 shadow-[0_0_20px_hsla(var(--primary),0.2)]' : ''
      } ${
        isHighlighted ? 'ring-2 ring-yellow-400/50 shadow-[0_0_20px_rgba(250,204,21,0.3)] z-[100]' : ''
      } ${userColor ? userColor.bg : ''} ${className || ''}`}
    >
      {/* Subtle accent dot indicator */}
      {resolvedType && (
        <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${accentDot} opacity-40`} />
      )}

      {locked && (
        <div className="absolute top-2 right-6 z-10 rounded bg-destructive/80 p-0.5">
          <Lock className="h-2.5 w-2.5 text-destructive-foreground" />
        </div>
      )}

      {edgeCount > 0 && (
        <div className="absolute -top-2 -left-2 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-primary text-[8px] font-bold text-primary-foreground shadow-sm">
          {edgeCount}
        </div>
      )}

      {/* Subtle accent line for node type */}
      {accent && (
        <div className={cn("absolute top-0 left-0 w-px h-full z-10 opacity-40", accent.indicator)} />
      )}

{locked && (
        <div className="absolute top-2 right-2 z-10 rounded-md bg-destructive/80 p-1">
          <Lock className="h-3 w-3 text-destructive-foreground" />
        </div>
      )}

      {edgeCount > 0 && (
        <div className="absolute -top-1.5 -left-1.5 z-10 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-border bg-primary text-[9px] font-bold text-primary-foreground">
          {edgeCount}
        </div>
      )}

      {!locked && canvasMode === 'edit' && (
        <NodeResizer
          isVisible={selected}
          minWidth={120}
          minHeight={80}
          defaultWidth={initialStyle?.width}
          defaultHeight={initialStyle?.height}
          onResizeEnd={(_event, params) => {
            if (nodeId) {
              const newWidth = Math.round(params.width);
              const newHeight = Math.round(params.height);
              // Only update style (this is what ReactFlow uses for display)
              updateNodeStyle(nodeId, {
                width: newWidth,
                height: newHeight,
              });
            }
          }}
          lineClassName="!border-primary/30"
          handleClassName="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background !rounded-full"
        />
      )}

      {title !== undefined && (
        <div
          className={cn(
            "group/header flex flex-shrink-0 items-center gap-1.5 px-3 py-2",
            locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
            headerClassName
          )}
        >
          {/* Collapse toggle */}
          {onToggleCollapse && (
            <button
              className="flex-shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
              title={collapsed ? "Expand" : "Collapse"}
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", collapsed ? "" : "rotate-90")} />
            </button>
          )}
          
          {/* Subtle accent dot */}
          {accent && !emoji && (
            <div className={cn("flex-shrink-0 w-2 h-2 rounded-full", accent.indicator)} />
          )}
          
          {/* Node Icon/Emoji */}
          {emoji && <span className="text-sm">{emoji}</span>}
          {icon && <span className="text-muted-foreground/70">{icon}</span>}

          {onTitleChange && !locked ? (
            <input
              className="flex-1 min-w-0 bg-transparent text-[13px] font-medium tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 overflow-hidden"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Untitled"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate text-[13px] font-medium tracking-tight text-foreground" title={title}>{title}</span>
          )}

          {/* Sync Status Dot - smallest visible */}
          {id && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center flex-shrink-0">
                  <div 
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      hasSyncError ? "bg-destructive" :
                      nodeSyncing ? "bg-yellow-400 animate-pulse" : 
                      "bg-primary/60"
                    )} 
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-[10px]">
                {hasSyncError ? "Sync error" : nodeSyncing ? "Syncing..." : "Saved"}
              </TooltipContent>
            </Tooltip>
          )}

          {headerExtra}

          {/* Action Buttons - subtle on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover/node:opacity-100 transition-opacity duration-200">
            {id && (
              <ToolbarAction 
                onClick={(e) => { e.stopPropagation(); setExpandedNode(id); }}
                tip="Fullscreen (Space)"
                icon={<Expand className="h-3 w-3" />}
              />
            )}
            {id && (
              <ToolbarAction 
                onClick={(e) => { e.stopPropagation(); handleCopyNodeContent(); }}
                tip="Copy text"
                icon={<Copy className="h-3 w-3" />}
              />
            )}
            {id && canvasMode === 'edit' && !locked && (
              <ToolbarAction 
                onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
                tip="Delete (Del)"
                className="hover:bg-destructive/20 hover:text-destructive"
                icon={<Trash2 className="h-3 w-3" />}
              />
            )}
            <ToolbarAction 
              onClick={(e) => { e.stopPropagation(); onMenuClick?.(e); }}
              tip="Node options"
              icon={<MoreHorizontal className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      )}

      {/* Tags - subtle pills */}
      {nodeTags.length > 0 && !collapsed && (
        <div className="flex flex-wrap gap-1 px-3 py-1 border-b border-border/10">
          {[...new Set(nodeTags)].filter(Boolean).map((tag) => (
            <span
              key={tag}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted/40 text-muted-foreground/80"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

          {/* Collapsed Summary Overlay */}
          {collapsed && summary && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-t border-border/50 bg-accent/5 line-clamp-1">
              {summary}
            </div>
          )}

          {!collapsed && (
            <div 
              className={`flex-1 overflow-visible nodrag nowheel nopan ${bodyClassName || ''}`} 
              onPointerDown={(e) => e.stopPropagation()} 
              onMouseDown={(e) => e.stopPropagation()}
            >
          {zoom < LOD_THRESHOLD ? (
            <div className="flex flex-col items-center justify-center h-full w-full p-4 opacity-40 select-none pointer-events-none gap-2">
              <div className="flex flex-col items-center gap-1">
                {emoji ? (
                  <span className="text-2xl">{emoji}</span>
                ) : (
                  icon && <div className="text-primary scale-125">{icon}</div>
                )}
                {zoom < ULTIMATE_LOD_THRESHOLD ? null : (
                  <span className="text-[10px] font-black uppercase tracking-tighter text-center line-clamp-2 max-w-[120px]">
                    {title || 'Empty'}
                  </span>
                )}
              </div>
              {zoom >= ULTIMATE_LOD_THRESHOLD && progress !== undefined && (
                <div className="w-12 h-1 bg-muted rounded-full overflow-hidden border border-border/10">
                  <div className={`h-full ${accent?.indicator || "bg-primary"}`} style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          ) : (
            children
          )}
        </div>
      )}

      {(footerStats || progress !== undefined) && !collapsed && zoom >= LOD_THRESHOLD && (
        <div className="border-t border-border/10 px-3 py-1.5 text-[11px] text-muted-foreground/60 flex items-center gap-2">
          {progress !== undefined && (
            <div className="h-1 w-full bg-muted/50 rounded-full overflow-hidden flex-1 max-w-[60px]">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className={cn("h-full rounded-full", accent?.indicator || "bg-primary")}
              />
            </div>
          )}
          <span className="truncate">{footerStats}</span>
        </div>
      )}

      {/* Created timestamp - subtle, hide by default */}
      {createdAt && !collapsed && zoom >= LOD_THRESHOLD && (
        <div className="px-3 pb-1.5 text-[9px] text-muted-foreground/40 overflow-hidden whitespace-nowrap">
          {formatSafeDate(createdAt, 'recently')}
        </div>
      )}

      {handles && (
        <>
          {/* Target handles */}
          <Handle type="target" position={Position.Top} id={HANDLE_IDS.TARGET.TOP} className={cn("!rounded-full !bg-primary/70 !border !border-primary/50 transition-opacity", isMobile ? "!w-3 !h-3" : "!w-2 !h-2", selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100")} style={{ left: '50%', transform: 'translateX(-50%)' }} />
          <Handle type="target" position={Position.Bottom} id={HANDLE_IDS.TARGET.BOTTOM} className={cn("!rounded-full !bg-primary/70 !border !border-primary/50 transition-opacity", isMobile ? "!w-3 !h-3" : "!w-2 !h-2", selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100")} style={{ left: '50%', transform: 'translateX(-50%)' }} />
          <Handle type="target" position={Position.Left} id={HANDLE_IDS.TARGET.LEFT} className={cn("!rounded-full !bg-primary/70 !border !border-primary/50 transition-opacity", isMobile ? "!w-3 !h-3" : "!w-2 !h-2", selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100")} style={{ top: '50%', transform: 'translateY(-50%)' }} />
          <Handle type="target" position={Position.Right} id={HANDLE_IDS.TARGET.RIGHT} className={cn("!rounded-full !bg-primary/70 !border !border-primary/50 transition-opacity", isMobile ? "!w-3 !h-3" : "!w-2 !h-2", selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100")} style={{ top: '50%', transform: 'translateY(-50%)' }} />
          {/* Source handles */}
          <Handle type="source" position={Position.Top} id={HANDLE_IDS.SOURCE.TOP} className={cn("!rounded-full !bg-primary/70 !border !border-primary/50 transition-opacity", isMobile ? "!w-3 !h-3" : "!w-2 !h-2", selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100")} style={{ left: '50%', transform: 'translateX(-50%)' }} />
          <Handle type="source" position={Position.Bottom} id={HANDLE_IDS.SOURCE.BOTTOM} className={cn("!rounded-full !bg-primary/70 !border !border-primary/50 transition-opacity", isMobile ? "!w-3 !h-3" : "!w-2 !h-2", selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100")} style={{ left: '50%', transform: 'translateX(-50%)' }} />
          <Handle type="source" position={Position.Left} id={HANDLE_IDS.SOURCE.LEFT} className={cn("!rounded-full !bg-primary/70 !border !border-primary/50 transition-opacity", isMobile ? "!w-3 !h-3" : "!w-2 !h-2", selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100")} style={{ top: '50%', transform: 'translateY(-50%)' }} />
          <Handle type="source" position={Position.Right} id={HANDLE_IDS.SOURCE.RIGHT} className={cn("!rounded-full !bg-primary/70 !border !border-primary/50 transition-opacity", isMobile ? "!w-3 !h-3" : "!w-2 !h-2", selected ? "opacity-100" : "opacity-0 group-hover/node:opacity-100")} style={{ top: '50%', transform: 'translateY(-50%)' }} />
        </>
      )}
    </Wrapper>
  );

  return nodeContent;
});

BaseNode.displayName = 'BaseNode';
