import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { type Node } from '@xyflow/react';
import { cn } from '@/lib/utils';
import katex from 'katex';
import {
  KanbanView,
  CalendarView,
  SpreadsheetView,
  DatabaseView,
  DailyLogView,
  ShapeView,
  GroupView,
  BookmarkView,
  FileAttachmentView,
} from './view-renderers';

/* ─── Read-only inline renderers for expandable types (NO TipTap) ─── */

interface CheckItem { id: string; text: string; done: boolean; }

function ReadOnlyChecklist({ items }: { items: CheckItem[] }) {
  const doneCount = items.filter(i => i.done).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }} />
        </div>
        {doneCount}/{items.length}
      </div>
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3">
          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${item.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
            {item.done && <span className="text-xs font-bold">✓</span>}
          </div>
          <span className={`text-sm ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function ReadOnlySummary({ bullets }: { bullets: string[] }) {
  return (
    <ul className="space-y-3">
      {bullets.filter(b => b.trim()).map((b, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <span className="text-sm text-foreground leading-relaxed">{b}</span>
        </li>
      ))}
    </ul>
  );
}

function ReadOnlyCode({ code }: { code: string }) {
  return (
    <pre className="w-full min-h-[200px] bg-muted rounded-xl p-4 font-mono text-sm text-foreground overflow-auto whitespace-pre-wrap">
      {code}
    </pre>
  );
}

function ReadOnlyMath({ latex }: { latex: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !latex.trim()) return;
    try { katex.render(latex, ref.current, { displayMode: true, throwOnError: false }); }
    catch { if (ref.current) ref.current.innerHTML = '<span class="text-destructive">Invalid LaTeX</span>'; }
  }, [latex]);
  return (
    <div className="flex flex-col gap-4">
      <div ref={ref} className="flex items-center justify-center text-foreground min-h-[120px] py-4" style={{ fontSize: '1.4rem' }} />
      <pre className="bg-muted rounded-xl p-3 font-mono text-xs text-muted-foreground overflow-auto">{latex}</pre>
    </div>
  );
}

function ReadOnlyTermQuestion({ year, questions }: { year: string; questions: string[] }) {
  return (
    <div>
      {year && <h3 className="text-2xl font-bold text-foreground mb-4">{year}</h3>}
      <ol className="space-y-3">
        {questions.filter(q => q.trim()).map((q, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 text-sm font-mono text-muted-foreground font-bold">{i + 1}.</span>
            <span className="text-sm text-foreground leading-relaxed">{q}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReadOnlyText({ text }: { text: string }) {
  return (
    <div className="text-base text-foreground leading-relaxed whitespace-pre-wrap">
      {text || <span className="text-muted-foreground italic">Empty note</span>}
    </div>
  );
}

function ReadOnlyRichText({ content }: { content: any }) {
  if (!content) return <p className="text-muted-foreground italic">Empty note</p>;
  const text = extractTextFromContent(content);
  return (
    <div className="text-base text-foreground leading-relaxed whitespace-pre-wrap">
      {text || <span className="text-muted-italic">Empty note</span>}
    </div>
  );
}

function extractTextFromContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (content.text) return content.text;
  if (content.content) {
    if (Array.isArray(content.content)) return content.content.map(extractTextFromContent).join('\n');
    return extractTextFromContent(content.content);
  }
  if (Array.isArray(content)) return content.map(extractTextFromContent).join('\n');
  return '';
}

function ReadOnlyFlashcard({ flashcards }: { flashcards: { question: string; answer: string }[] }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = flashcards[idx];
  if (!card) return <p className="text-muted-foreground text-center">No flashcards</p>;
  return (
    <div className="flex flex-col items-center gap-6">
      <button onClick={() => setFlipped(!flipped)} className="w-full max-w-lg">
        <div className={`min-h-[200px] rounded-xl border-2 border-dashed p-8 text-center transition-all ${flipped ? 'border-primary/40 bg-primary/5' : 'border-border bg-accent/30'}`}>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{flipped ? 'Answer' : 'Question'}</p>
          <p className="text-lg font-semibold text-foreground">{flipped ? card.answer : card.question}</p>
        </div>
      </button>
      <div className="flex items-center gap-4">
        <button onClick={() => { setFlipped(false); setIdx(Math.max(0, idx - 1)); }} disabled={idx === 0} className="rounded-lg px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-accent disabled:opacity-20 active:scale-95">← Prev</button>
        <span className="text-sm font-bold text-muted-foreground">{idx + 1}/{flashcards.length}</span>
        <button onClick={() => { setFlipped(false); setIdx(Math.min(flashcards.length - 1, idx + 1)); }} disabled={idx === flashcards.length - 1} className="rounded-lg px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-accent disabled:opacity-20 active:scale-95">Next →</button>
      </div>
    </div>
  );
}

function ReadOnlyTable({ headers, rows }: { headers: string[]; rows: { value: string }[][] }) {
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>{headers.map((h, ci) => (
            <th key={ci} className="border border-border bg-muted px-3 py-2 text-left font-bold uppercase tracking-wider text-muted-foreground text-xs">{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-accent/30">
              {row.map((cell, ci) => (
                <td key={ci} className="border border-border px-3 py-2 text-foreground">{cell.value || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadOnlyImage({ url, title }: { url: string; title?: string }) {
  return (
    <div className="flex items-center justify-center">
      {url ? <img src={url} alt={title || 'Image'} className="max-w-full max-h-[70vh] object-contain rounded-xl" /> : <span className="text-muted-foreground">No image</span>}
    </div>
  );
}

function ReadOnlyEmbed({ url, title }: { url: string; title?: string }) {
  return url ? (
    <iframe src={url} title={title || 'Embed'} className="w-full h-[60vh] border-0 rounded-xl" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
  ) : <span className="text-muted-foreground">No URL set</span>;
}

function ReadOnlyDrawing({ paths, width, height }: { paths: Array<{ d: string; color: string; width: number }>; width?: number; height?: number }) {
  return (
    <div className="flex items-center justify-center overflow-auto">
      <svg width={Math.min(width || 800, 600)} height={Math.min(height || 600, 400)} className="rounded-xl bg-muted">
        {(paths || []).map((p, i) => (
          <path key={i} d={p.d} stroke={p.color} strokeWidth={p.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
    </div>
  );
}

function ReadOnlyVideo({ url, title }: { url: string; title?: string }) {
  const ytMatch = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  const vimeoMatch = (url || '').match(/vimeo\.com\/(\d+)/);
  const embedUrl = ytMatch
    ? `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`
    : vimeoMatch
      ? `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`
      : null;
  return embedUrl ? (
    <iframe src={embedUrl} title={title || 'Video'} className="w-full aspect-video rounded-xl border-0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
  ) : <span className="text-muted-foreground">No video URL set</span>;
}

function ReadOnlyPDF({ storageUrl, fileType, fileName }: { storageUrl?: string; fileType?: string; fileName?: string }) {
  if (!storageUrl) return <span className="text-muted-foreground">No document uploaded</span>;
  const isOffice = fileType === 'doc' || fileType === 'docx' || fileType === 'ppt' || fileType === 'pptx';
  const src = isOffice
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(storageUrl)}`
    : storageUrl;
  return <iframe src={src} title={fileName || 'Document'} className="w-full h-[60vh] border-0 rounded-xl" allowFullScreen />;
}

/* ─── Type classification ─── */

const EXPANDABLE_TYPES = ['aiNote', 'lectureNotes', 'checklist', 'summary', 'codeSnippet', 'math', 'termQuestion', 'stickyNote', 'flashcard', 'table', 'image', 'embed', 'drawing', 'video', 'text', 'pdf', 'v2Note'];

/* ─── Content renderer ─── */

function NodeContent({ node }: { node: Node }) {
  const data = node.data as any;
  const type = node.type || 'aiNote';

  switch (type) {
    case 'aiNote':
    case 'lectureNotes':
    case 'v2Note':
      return <ReadOnlyRichText content={data.content} />;
    case 'checklist':
      return <ReadOnlyChecklist items={data.items || []} />;
    case 'summary':
      return <ReadOnlySummary bullets={data.bullets || []} />;
    case 'codeSnippet':
      return <ReadOnlyCode code={data.code || ''} />;
    case 'math':
      return <ReadOnlyMath latex={data.latex || ''} />;
    case 'termQuestion':
      return <ReadOnlyTermQuestion year={data.year || ''} questions={data.questions || []} />;
    case 'stickyNote':
    case 'text':
      return <ReadOnlyText text={data.text || ''} />;
    case 'flashcard':
      return <ReadOnlyFlashcard flashcards={data.flashcards || []} />;
    case 'table':
      return <ReadOnlyTable headers={data.headers || []} rows={data.rows || []} />;
    case 'image':
      return <ReadOnlyImage url={data.storageUrl || data.url} title={data.title} />;
    case 'embed':
      return <ReadOnlyEmbed url={data.url} title={data.title} />;
    case 'drawing':
      return <ReadOnlyDrawing paths={data.paths || []} width={data.width} height={data.height} />;
    case 'video':
      return <ReadOnlyVideo url={data.url || ''} title={data.title} />;
    case 'pdf':
      return <ReadOnlyPDF storageUrl={data.storageUrl} fileType={data.fileType} fileName={data.fileName} />;
    case 'kanban':
      return <KanbanView data={data} />;
    case 'calendar':
      return <CalendarView data={data} />;
    case 'spreadsheet':
      return <SpreadsheetView data={data} />;
    case 'databaseNode':
      return <DatabaseView data={data} />;
    case 'dailyLog':
      return <DailyLogView data={data} />;
    case 'shape':
      return <ShapeView data={data} />;
    case 'group':
      return <GroupView data={data} />;
    case 'bookmark':
      return <BookmarkView data={data} />;
    case 'fileAttachment':
      return <FileAttachmentView data={data} />;
    default:
      return <p className="text-muted-foreground text-center py-8">This node type doesn't have a view renderer yet.</p>;
  }
}

/* ─── Node type icon map ─── */

const TYPE_LABELS: Record<string, string> = {
  aiNote: 'Note',
  lectureNotes: 'Lecture',
  v2Note: 'V2 Note',
  checklist: 'Checklist',
  summary: 'Summary',
  codeSnippet: 'Code',
  math: 'Math',
  termQuestion: 'Questions',
  stickyNote: 'Sticky Note',
  flashcard: 'Flashcards',
  table: 'Table',
  image: 'Image',
  embed: 'Embed',
  drawing: 'Drawing',
  video: 'Video',
  text: 'Text',
  pdf: 'Document',
  kanban: 'Kanban',
  calendar: 'Calendar',
  spreadsheet: 'Spreadsheet',
  databaseNode: 'Database',
  dailyLog: 'Daily Log',
  shape: 'Shape',
  group: 'Group',
  bookmark: 'Bookmark',
  fileAttachment: 'Files',
};

/* ═══════════════════════════════════════════════════════
   Main MobileViewMode Component
   ═══════════════════════════════════════════════════════ */

interface MobileViewModeProps {
  nodes: Node[];
  onClose: () => void;
  initialNodeId?: string | null;
}

export function MobileViewMode({ nodes, onClose, initialNodeId }: MobileViewModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showHeader, setShowHeader] = useState(true);
  const [showJumpList, setShowJumpList] = useState(false);
  const headerTimer = useRef<NodeJS.Timeout | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStart = useRef({ x: 0, y: 0, time: 0 });

  // Sort nodes by position (top-to-bottom, left-to-right)
  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      if (Math.abs(a.position.y - b.position.y) > 20) {
        return a.position.y - b.position.y;
      }
      return a.position.x - b.position.x;
    });
  }, [nodes]);

  // Set initial index based on initialNodeId
  useEffect(() => {
    if (initialNodeId) {
      const idx = sortedNodes.findIndex(n => n.id === initialNodeId);
      if (idx >= 0) setCurrentIndex(idx);
    }
  }, [initialNodeId, sortedNodes]);

  // Auto-hide header after 3s
  const resetHeaderTimer = useCallback(() => {
    setShowHeader(true);
    if (headerTimer.current) clearTimeout(headerTimer.current);
    headerTimer.current = setTimeout(() => setShowHeader(false), 3000);
  }, []);

  useEffect(() => {
    resetHeaderTimer();
    return () => { if (headerTimer.current) clearTimeout(headerTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentNode = sortedNodes[currentIndex];
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < sortedNodes.length - 1;

  const goPrev = useCallback(() => {
    if (canPrev) {
      setCurrentIndex(i => i - 1);
      resetHeaderTimer();
    }
  }, [canPrev, resetHeaderTimer]);

  const goNext = useCallback(() => {
    if (canNext) {
      setCurrentIndex(i => i + 1);
      resetHeaderTimer();
    }
  }, [canNext, resetHeaderTimer]);

  // Custom touch handler for better gesture discrimination
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    setIsSwiping(false);
    setSwipeOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;

    // Determine if this is a horizontal swipe (only after sufficient movement)
    if (!isSwiping && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        // Horizontal swipe — take over
        setIsSwiping(true);
      } else {
        // Vertical scroll — let it pass through
        return;
      }
    }

    if (isSwiping) {
      e.preventDefault();
      // Apply resistance at boundaries
      let offset = dx;
      if ((!canPrev && dx > 0) || (!canNext && dx < 0)) {
        offset = dx * 0.2; // rubber-band resistance
      }
      setSwipeOffset(offset);
    }
  }, [isSwiping, canPrev, canNext]);

  const handleTouchEnd = useCallback(() => {
    if (isSwiping) {
      const elapsed = Math.max(Date.now() - touchStart.current.time, 1);
      const rawVelocity = Math.abs(swipeOffset) / elapsed * 1000;
      const velocity = Math.min(rawVelocity, 5000); // Cap velocity to prevent instability
      const threshold = velocity > 300 ? 30 : 60;

      if (swipeOffset < -threshold && canNext) {
        goNext();
      } else if (swipeOffset > threshold && canPrev) {
        goPrev();
      }
    }
    setIsSwiping(false);
    setSwipeOffset(0);
  }, [isSwiping, swipeOffset, canNext, canPrev, goNext, goPrev]);

  // Keyboard nav (for connected keyboards on tablets)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goPrev, goNext, onClose]);

  if (!currentNode) {
    return (
      <div className="fixed inset-0 z-[200] bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No nodes to display</p>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-accent">
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  const title = (currentNode.data as any).title || (currentNode.data as any).year || (currentNode.data as any).label || 'Untitled';
  const nodeType = currentNode.type || 'aiNote';
  const typeLabel = TYPE_LABELS[nodeType] || nodeType;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col" onClick={resetHeaderTimer}>
      {/* Header */}
      <AnimatePresence>
        {showHeader && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 bg-background/95 backdrop-blur-md border-b border-border/50 safe-area-top"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-accent active:scale-95 transition-all" aria-label="Close view mode">
                  <X className="h-5 w-5" />
                </button>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-sm font-bold truncate">{title}</h2>
                  <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">{typeLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowJumpList(!showJumpList)}
                  className="p-2 rounded-full hover:bg-accent active:scale-95 transition-all"
                  aria-label="Jump to node"
                >
                  <List className="h-4 w-4" />
                </button>
                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest tabular-nums">
                  {currentIndex + 1}/{sortedNodes.length}
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-0.5 bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${((currentIndex + 1) / sortedNodes.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jump list overlay */}
      <AnimatePresence>
        {showJumpList && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-[100px] left-0 right-0 z-10 bg-background/95 backdrop-blur-md border-b border-border max-h-[50vh] overflow-y-auto"
          >
            <div className="p-2 space-y-0.5">
              {sortedNodes.map((node, idx) => {
                const nd = node.data as any;
                const nTitle = nd.title || nd.year || nd.label || nd.text || 'Untitled';
                const nType = TYPE_LABELS[node.type || ''] || node.type || 'Node';
                return (
                  <button
                    key={node.id}
                    onClick={() => { setCurrentIndex(idx); setShowJumpList(false); resetHeaderTimer(); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                      idx === currentIndex ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"
                    )}
                  >
                    <span className="text-[10px] font-black text-muted-foreground tabular-nums w-6 text-right">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{nTitle}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{nType}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Swipeable content */}
      <div
        className="flex-1 min-h-0 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
          key={currentIndex}
        >
          <div className="h-full overflow-y-auto overscroll-y-contain px-5 py-6 pb-28 scrollbar-hide" onClick={resetHeaderTimer}>
            <div className="max-w-lg mx-auto">
              <NodeContent node={currentNode} />
            </div>
          </div>
        </div>

        {/* Edge indicators */}
        {canPrev && (
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background/50 to-transparent pointer-events-none z-[1]" />
        )}
        {canNext && (
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background/50 to-transparent pointer-events-none z-[1]" />
        )}
      </div>

      {/* Bottom nav bar */}
      <AnimatePresence>
        {showHeader && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 bg-background/95 backdrop-blur-md border-t border-border/50 safe-area-bottom"
          >
            <div className="flex items-center justify-between px-6 py-3">
              <button
                onClick={goPrev}
                disabled={!canPrev}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-bold disabled:opacity-20 active:scale-95 transition-all"
                aria-label="Previous node"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <div className="flex items-center gap-1.5">
                {sortedNodes.slice(Math.max(0, currentIndex - 2), currentIndex + 3).map((node, i) => {
                  const realIdx = Math.max(0, currentIndex - 2) + i;
                  return (
                    <button
                      key={node.id}
                      onClick={() => { setCurrentIndex(realIdx); resetHeaderTimer(); }}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        realIdx === currentIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
                      )}
                      aria-label={`Go to node ${realIdx + 1}`}
                    />
                  );
                })}
              </div>
              <button
                onClick={goNext}
                disabled={!canNext}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-bold text-primary disabled:opacity-20 active:scale-95 transition-all"
                aria-label="Next node"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
