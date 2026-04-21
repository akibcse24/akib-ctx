import { Panel, useReactFlow } from '@xyflow/react';
import { NotebookPen, StickyNote, HelpCircle, BookOpen, FileUp, ImagePlus, Square, Sparkles, Plus, GraduationCap, MessageSquarePlus, ListTodo, Type, Circle, Diamond, Triangle, Pen, Globe, Sigma, Video, Table2, Braces, Cable, Columns3, Bookmark, CalendarDays, Paperclip, Sheet, Clock, LayoutDashboard, Blocks } from 'lucide-react';
import { useCanvasStore } from '@/store/canvasStore';
import { useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { NodeType } from '@/types/canvas';

const categories: { label: string; items: { type: NodeType; label: string; icon: any; color: string }[] }[] = [
  {
    label: 'Knowledge',
    items: [
      { type: 'aiNote', label: 'AI Note', icon: NotebookPen, color: 'text-primary' },
      { type: 'v2Note', label: 'V2 Note', icon: Blocks, color: 'text-violet-400' },
      { type: 'summary', label: 'Summary', icon: StickyNote, color: 'text-yellow' },
      { type: 'lectureNotes', label: 'Lecture', icon: BookOpen, color: 'text-cyan' },
      { type: 'flashcard', label: 'Flashcard', icon: GraduationCap, color: 'text-pink' },
      { type: 'termQuestion', label: 'Q&A', icon: HelpCircle, color: 'text-orange-500' },
      { type: 'dailyLog', label: 'Daily Log', icon: Clock, color: 'text-indigo-400' },
    ]
  },
  {
    label: 'Content',
    items: [
      { type: 'text', label: 'Text', icon: Type, color: 'text-foreground' },
      { type: 'stickyNote', label: 'Sticky', icon: MessageSquarePlus, color: 'text-yellow' },
      { type: 'checklist', label: 'Checklist', icon: ListTodo, color: 'text-green' },
      { type: 'table', label: 'Table', icon: Table2, color: 'text-cyan' },
      { type: 'calendar', label: 'Calendar', icon: CalendarDays, color: 'text-emerald-500' },
    ]
  },
  {
    label: 'Media',
    items: [
      { type: 'image', label: 'Image', icon: ImagePlus, color: 'text-green' },
      { type: 'pdf', label: 'PDF', icon: FileUp, color: 'text-red' },
      { type: 'video', label: 'Video', icon: Video, color: 'text-red' },
      { type: 'bookmark', label: 'Link', icon: Bookmark, color: 'text-blue-500' },
      { type: 'embed', label: 'Embed', icon: Globe, color: 'text-slate-400' },
      { type: 'fileAttachment', label: 'Attach', icon: Paperclip, color: 'text-slate-500' },
    ]
  },
  {
    label: 'Advanced',
    items: [
      { type: 'math', label: 'Math', icon: Sigma, color: 'text-purple' },
      { type: 'codeSnippet', label: 'Code', icon: Braces, color: 'text-green' },
      { type: 'kanban', label: 'Kanban', icon: Columns3, color: 'text-primary' },
      { type: 'spreadsheet', label: 'Sheets', icon: Sheet, color: 'text-green-600' },
      { type: 'databaseNode', label: 'Database', icon: LayoutDashboard, color: 'text-blue-400' },
    ]
  }
];

const shapeItems = [
  { shape: 'rect' as const, label: 'Rectangle', icon: Square },
  { shape: 'circle' as const, label: 'Circle', icon: Circle },
  { shape: 'diamond' as const, label: 'Diamond', icon: Diamond },
  { shape: 'triangle' as const, label: 'Triangle', icon: Triangle },
];

const defaultDataForType = (type: NodeType): Record<string, unknown> => {
  switch (type) {
    case 'aiNote': return { title: 'Untitled Note', content: null };
    case 'summary': return { title: 'Summary', bullets: [''], color: 'yellow' };
    case 'termQuestion': return { year: '', questions: [''] };
    case 'lectureNotes': return { title: 'Lecture Notes', content: null, viewMode: false };
    case 'pdf': return { fileName: '', fileSize: 0 };
    case 'image': return { altText: '' };
    case 'group': return { label: 'Group', color: 'default' };
    case 'flashcard': return { flashcards: [{ question: 'What is...?', answer: 'It is...' }], sourceTitle: '' };
    case 'stickyNote': return { text: '', color: 'yellow' };
    case 'checklist': return { title: 'Checklist', items: [{ id: crypto.randomUUID(), text: '', done: false }] };
    case 'text': return { text: '', fontSize: 16 };
    case 'shape': return { shapeType: 'rect', color: 'default', label: '' };
    case 'drawing': return { paths: [], width: 400, height: 300 };
    case 'embed': return { url: '', title: '' };
    case 'math': return { title: 'Math', latex: '' };
    case 'video': return { url: '', title: '' };
    case 'table': return { title: 'Table', headers: ['Col A', 'Col B', 'Col C'], rows: [[{ value: '' }, { value: '' }, { value: '' }]] };
    case 'codeSnippet': return { title: 'Code Snippet', code: '', language: 'javascript' };
    case 'kanban': return { title: 'Kanban', columns: [
      { id: 'todo', title: 'To Do', color: 'bg-muted text-muted-foreground', cards: [] },
      { id: 'inprogress', title: 'In Progress', color: 'bg-primary/20 text-primary', cards: [] },
      { id: 'done', title: 'Done', color: 'bg-green-500/20 text-green-500', cards: [] }
    ]};
    case 'bookmark': return { url: '', ogTitle: '', ogDescription: '', ogImage: '', favicon: '', hostname: '' };
    case 'calendar': return { title: 'Calendar', events: [] };
    case 'fileAttachment': return { title: 'File Attachment', files: [] };
    case 'spreadsheet': return { title: 'Spreadsheet', grid: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ value: '' }))) };
    case 'databaseNode': return { title: 'Database', columns: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'status', name: 'Status', type: 'text' }], rows: [{ id: '1', name: 'Example Item', status: 'In Progress' }] };
    case 'dailyLog': return { title: 'Daily Log', entries: [] };
    case 'v2Note': return { title: 'V2 Note', content: [], blockVersion: 2 };
  }
};

const defaultSizeForType = (type: NodeType): { width: number; height?: number | 'auto' } => {
  switch (type) {
    case 'aiNote': return { width: 380, height: 'auto' };
    case 'summary': return { width: 280, height: 'auto' };
    case 'termQuestion': return { width: 300, height: 'auto' };
    case 'lectureNotes': return { width: 420, height: 'auto' };
    case 'pdf': return { width: 300, height: 180 };
    case 'image': return { width: 320, height: 'auto' };
    case 'group': return { width: 700, height: 500 };
    case 'flashcard': return { width: 320, height: 'auto' };
    case 'stickyNote': return { width: 200, height: 'auto' };
    case 'checklist': return { width: 280, height: 'auto' };
    case 'text': return { width: 240, height: 'auto' };
    case 'shape': return { width: 160, height: 120 };
    case 'drawing': return { width: 400, height: 300 };
    case 'embed': return { width: 420, height: 340 };
    case 'math': return { width: 500, height: 'auto' };
    case 'video': return { width: 420, height: 320 };
    case 'table': return { width: 600, height: 'auto' };
    case 'codeSnippet': return { width: 420, height: 'auto' };
    case 'kanban': return { width: 500, height: 'auto' };
    case 'bookmark': return { width: 300, height: 'auto' };
    case 'calendar': return { width: 300, height: 'auto' };
    case 'fileAttachment': return { width: 280, height: 'auto' };
    case 'spreadsheet': return { width: 400, height: 'auto' };
    case 'databaseNode': return { width: 600, height: 'auto' };
    case 'dailyLog': return { width: 300, height: 'auto' };
    case 'v2Note': return { width: 420, height: 'auto' };
  }
};

export function AddNodeToolbar() {
  const addNode = useCanvasStore((s) => s.addNode);
  const connectMode = useCanvasStore((s) => s.connectMode);
  const setConnectMode = useCanvasStore((s) => s.setConnectMode);
  const [expanded, setExpanded] = useState(false);
  const [showShapes, setShowShapes] = useState(false);

  const handleConnectorClick = () => {
    const newMode = !connectMode;
    setConnectMode(newMode);
    setExpanded(false);
    if (newMode) {
      toast.info('Connector mode: click the source node');
    }
  };

  const { screenToFlowPosition } = useReactFlow();

  const handleAdd = (type: NodeType, extraData?: Record<string, unknown>) => {
    const size = defaultSizeForType(type);
    
    // Calculate center of screen
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const position = screenToFlowPosition({ x: centerX, y: centerY });
    
    // Offset by half size to truly center (if possible)
    const centerXOffset = size.width / 2;
    const centerYOffset = typeof size.height === 'number' ? size.height / 2 : 100;

    const node = {
      id: crypto.randomUUID(),
      type,
      position: { 
        x: position.x - centerXOffset, 
        y: position.y - centerYOffset 
      },
      data: { ...defaultDataForType(type), ...extraData, createdAt: new Date().toISOString() },
      style: { width: size.width, height: size.height },
    };
    addNode(node);
  };

  return (
    <Panel position="top-right" className="mr-6 mt-6">
      <div className="flex flex-col items-end gap-3">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 z-50",
            expanded 
              ? "bg-primary text-primary-foreground shadow-[var(--premium-shadow-md),0_0_30px_hsla(var(--primary),0.4)]" 
              : "toolbar-glass text-foreground hover:shadow-[var(--premium-shadow-md)]"
          )}
          title="Add content"
        >
          <motion.div
            animate={{ rotate: expanded ? 45 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Plus className="h-6 w-6" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {expanded && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -20, x: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -20, x: 20 }}
                className="flex flex-col gap-6 rounded-2xl glass-morphism-strong p-6 shadow-[var(--premium-shadow-lg)] origin-top-right min-w-[360px]"
              >
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                {categories.map((cat) => (
                  <div key={cat.label} className="space-y-3">
                    <div className="px-1 text-[9px] font-black uppercase tracking-[0.2em] text-primary/40">
                      {cat.label}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {cat.items.map((item) => (
                        <button
                          key={item.type}
                          onClick={() => { handleAdd(item.type); setExpanded(false); }}
                          className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-all hover:bg-white/5 active:scale-95"
                        >
                          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 group-hover:bg-primary/20 transition-colors", item.color)}>
                            <item.icon className="h-4 w-4" />
                          </div>
                          <span className="text-[11px] font-bold tracking-tight text-muted-foreground group-hover:text-foreground">
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-white/5 pt-5">
                <div className="px-1 text-[9px] font-black uppercase tracking-[0.2em] text-primary/40">
                  Quick Actions
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowShapes(!showShapes)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/5 py-3 text-[11px] font-black uppercase tracking-widest transition-all hover:bg-white/5",
                      showShapes ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground"
                    )}
                  >
                    <Diamond className="h-4 w-4" />
                    Shapes
                  </button>
                  <button
                    onClick={handleConnectorClick}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/5 py-3 text-[11px] font-black uppercase tracking-widest transition-all hover:bg-white/5",
                      connectMode ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground"
                    )}
                  >
                    <Cable className="h-4 w-4" />
                    Connect
                  </button>
                </div>
                
                <AnimatePresence>
                  {showShapes && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-4 gap-2 overflow-hidden"
                    >
                      {shapeItems.map((s) => (
                        <button
                          key={s.shape}
                          onClick={() => { handleAdd('shape', { shapeType: s.shape }); setExpanded(false); }}
                          className="flex flex-col items-center gap-2 rounded-xl border border-white/5 py-3 transition-all hover:bg-white/5 hover:border-primary/20 hover:text-primary group"
                          title={s.label}
                        >
                          <s.icon className="h-4 w-4 transition-transform group-hover:scale-110" />
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
