import { useCanvasStore } from '@/store/canvasStore';
import { FileText, StickyNote, HelpCircle, BookOpen, FileUp, ImagePlus, Square, GraduationCap, MessageSquare, CheckSquare, Type, Diamond, Sigma, Video, Table2, PlusCircle, Blocks } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { NodeType } from '@/types/canvas';
import React, { useState, useEffect, useCallback } from 'react';

const menuItems: { type: NodeType; label: string; icon: React.ElementType; separator?: boolean; category?: string }[] = [
  { type: 'aiNote', label: 'AI Note', icon: FileText, category: 'AI Tools' },
  { type: 'v2Note', label: 'V2 Note ✦', icon: Blocks, category: 'AI Tools' },
  { type: 'flashcard', label: 'Flashcards', icon: GraduationCap, category: 'AI Tools' },
  { type: 'lectureNotes', label: 'Lecture Notes', icon: BookOpen, category: 'Notes' },
  { type: 'summary', label: 'Summary Box', icon: StickyNote, category: 'Notes' },
  { type: 'stickyNote', label: 'Sticky Note', icon: MessageSquare, category: 'Elements' },
  { type: 'checklist', label: 'Checklist', icon: CheckSquare, category: 'Elements' },
  { type: 'text', label: 'Text Block', icon: Type, category: 'Elements' },
  { type: 'termQuestion', label: 'Term Questions', icon: HelpCircle, category: 'Academic' },
  { type: 'math', label: 'Math / LaTeX', icon: Sigma, category: 'Academic' },
  { type: 'pdf', label: 'Upload PDF', icon: FileUp, category: 'Media' },
  { type: 'image', label: 'Upload Image', icon: ImagePlus, category: 'Media' },
  { type: 'video', label: 'Video Embed', icon: Video, category: 'Media' },
  { type: 'group', label: 'Group Layer', icon: Square, category: 'Layout' },
  { type: 'shape', label: 'Basic Shape', icon: Diamond, category: 'Layout' },
  { type: 'table', label: 'Data Table', icon: Table2, category: 'Layout' },
];

const defaultDataForType = (type: NodeType): Record<string, unknown> => {
  switch (type) {
    case 'aiNote': return { title: 'Untitled Note', content: null };
    case 'summary': return { title: 'Summary', bullets: [''], color: 'yellow' };
    case 'termQuestion': return { year: '2024', questions: [''] };
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
    case 'v2Note': return { title: 'V2 Note', content: [], blockVersion: 2 };
  }
};

const defaultSizeForType = (type: NodeType): { width: number; height: number } => {
  switch (type) {
    case 'aiNote': return { width: 380, height: 500 };
    case 'summary': return { width: 280, height: 340 };
    case 'termQuestion': return { width: 300, height: 420 };
    case 'lectureNotes': return { width: 420, height: 600 };
    case 'pdf': return { width: 300, height: 180 };
    case 'image': return { width: 320, height: 280 };
    case 'group': return { width: 700, height: 500 };
    case 'flashcard': return { width: 320, height: 300 };
    case 'stickyNote': return { width: 200, height: 160 };
    case 'checklist': return { width: 280, height: 320 };
    case 'text': return { width: 240, height: 60 };
    case 'shape': return { width: 160, height: 120 };
    case 'drawing': return { width: 400, height: 300 };
    case 'embed': return { width: 420, height: 340 };
    case 'math': return { width: 500, height: 260 };
    case 'video': return { width: 420, height: 320 };
    case 'table': return { width: 400, height: 300 };
    case 'v2Note': return { width: 420, height: 500 };
  }
};

export function CanvasContextMenu() {
  const contextMenu = useCanvasStore((s) => s.contextMenu);
  const setContextMenu = useCanvasStore((s) => s.setContextMenu);
  const addNode = useCanvasStore((s) => s.addNode);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!contextMenu) return;
    const { x, y } = contextMenu;
    const menuWidth = 280;
    const menuHeight = 550;
    const left = x + menuWidth > window.innerWidth ? Math.max(0, x - menuWidth) : x;
    const top = Math.min(y, window.innerHeight - menuHeight);
    setMenuPos({ left: Math.max(0, left), top: Math.max(0, top) });
  }, [contextMenu]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setContextMenu(null);
    }
  }, [setContextMenu]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!contextMenu) return null;

  const handleAdd = (type: NodeType) => {
    const size = defaultSizeForType(type);
    const node = {
      id: crypto.randomUUID(),
      type,
      position: { x: contextMenu.canvasX - size.width / 2, y: contextMenu.canvasY - size.height / 2 },
      data: defaultDataForType(type),
      style: { width: size.width, height: size.height },
    };
    addNode(node);
    setContextMenu(null);
  };

  const closeMenu = () => setContextMenu(null);

  // Group items by category
  const categories = Array.from(new Set(menuItems.map(item => item.category)));

  return (
    <AnimatePresence>
      {contextMenu && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-context-backdrop bg-background/5 backdrop-blur-[1px]"
            onClick={closeMenu}
            onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}
            aria-hidden="true"
          />
          <motion.div
            role="menu"
            aria-label="Quick create node"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute z-context-menu min-w-[260px] max-h-[85vh] overflow-y-auto scrollbar-none rounded-[2rem] glass-morphism-strong p-2 pro-shadow border border-white/5"
            style={{ left: menuPos.left, top: menuPos.top }}
          >
            <div className="px-4 py-3 border-b border-white/5 mb-1.5 flex items-center justify-between bg-white/5 rounded-t-[1.8rem]">
               <p className="text-[10px] font-black text-foreground/40 uppercase tracking-[3px]">Quick Create</p>
               <PlusCircle className="h-3.5 w-3.5 text-primary/60" />
            </div>

            <div className="px-1.5 pb-2 space-y-4" role="group">
              {categories.map((cat) => (
                <div key={cat} className="space-y-1">
                  <p className="px-3 text-[9px] font-black text-primary/60 uppercase tracking-[2px] mb-1.5">{cat}</p>
                  <div className="grid grid-cols-1 gap-0.5">
                    {menuItems.filter(i => i.category === cat).map((item) => (
                      <motion.button
                        key={item.type}
                        role="menuitem"
                        whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.08)" }}
                        whileTap={{ scale: 0.98 }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest text-foreground/80 transition-all hover:text-foreground"
                        onClick={() => handleAdd(item.type)}
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <item.icon className="h-3.5 w-3.5" />
                        </div>
                        {item.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-2 px-3 py-2 bg-white/5 rounded-b-[1.8rem] text-center">
              <p className="text-[8px] font-bold text-foreground/30 uppercase tracking-widest">Right-click nodes for more options</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}