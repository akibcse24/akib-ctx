export type NodeType =
  | 'aiNote'
  | 'summary'
  | 'termQuestion'
  | 'lectureNotes'
  | 'pdf'
  | 'image'
  | 'group'
  | 'flashcard'
  | 'stickyNote'
  | 'checklist'
  | 'text'
  | 'shape'
  | 'drawing'
  | 'embed'
  | 'math'
  | 'video'
  | 'table'
  | 'codeSnippet'
  | 'kanban'
  | 'bookmark'
  | 'calendar'
  | 'fileAttachment'
  | 'spreadsheet'
  | 'databaseNode'
  | 'dailyLog'
  | 'v2Note';

/** Shared optional fields available on all node data */
export interface SharedNodeFields {
  locked?: boolean;
  pinned?: boolean;
  tags?: string[];
  collapsed?: boolean;
  emoji?: string;
  dueDate?: string; // ISO date string
  opacity?: number; // 25-100, default 100
  createdAt?: string; // ISO datetime string
  updatedAt?: string; // ISO datetime string - when content was last modified
  lastSyncedAt?: string; // ISO datetime string - last successful sync timestamp
  blockVersion?: 1 | 2;
  color?: string; // Standard color string
  _v1Backup?: any; // Backup of Tiptap content before migration
  previousHeight?: number; // Height to restore after uncollapsing
}

export interface AINoteNodeData extends SharedNodeFields {
  title?: string;
  content?: any;
  pasteContent?: string;
  pasteFormat?: 'markdown' | 'html';
  progress?: number;
}

export interface SummaryNodeData extends SharedNodeFields {
  title: string;
  bullets: string[];
}

export interface TermQuestionNodeData extends SharedNodeFields {
  year: string;
  questions: string[];
}

export interface LectureNotesNodeData extends SharedNodeFields {
  title: string;
  content?: any;
  viewMode?: boolean;
  progress?: number;
}

export interface PDFNodeData extends SharedNodeFields {
  fileName: string;
  fileSize: number;
  storageKey?: string;
  storageUrl?: string;
  uploading?: boolean;
  progress?: number;
  fileType?: 'pdf' | 'doc' | 'docx' | 'ppt' | 'pptx' | 'xls' | 'xlsx' | 'csv' | 'txt';
}

export interface ImageNodeData extends SharedNodeFields {
  storageKey?: string;
  storageUrl?: string;
  altText?: string;
  uploading?: boolean;
  progress?: number;
}

export interface GroupNodeData extends SharedNodeFields {
  label: string;
}

export interface FlashcardNodeData extends SharedNodeFields {
  flashcards: { question: string; answer: string }[];
  sourceTitle?: string;
}

export interface StickyNoteNodeData extends SharedNodeFields {
  text: string;
  fontSize?: 'S' | 'M' | 'L';
  width?: number;
  height?: number;
}

export interface ChecklistNodeData extends SharedNodeFields {
  title: string;
  items: { id: string; text: string; done: boolean }[];
}

export interface TextNodeData extends SharedNodeFields {
  text: string;
  fontSize?: number;
  title?: string;
}

export interface ShapeNodeData extends SharedNodeFields {
  shapeType: 'rect' | 'circle' | 'diamond' | 'triangle';
  label?: string;
}

/** Free-floating drawing overlay (not a node) */
export interface DrawingOverlay {
  id: string;
  paths: { id?: string; d: string; color: string; width: number; opacity?: number }[];
}

export interface DrawingNodeData extends SharedNodeFields {
  paths: { id?: string; d: string; color: string; width: number; opacity?: number }[];
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
}

export interface EmbedNodeData extends SharedNodeFields {
  url?: string;
  title?: string;
}

export interface MathNodeData extends SharedNodeFields {
  title?: string;
  latex?: string;
}

export interface KanbanNodeData extends SharedNodeFields {
  title?: string;
  columns?: { id: string; title: string; color: string; cards: { id: string; text: string }[] }[];
}

export interface CodeSnippetNodeData extends SharedNodeFields {
  title?: string;
  code?: string;
  language?: string;
}

export interface VideoNodeData extends SharedNodeFields {
  url?: string;
  title?: string;
}

export interface TableNodeData extends SharedNodeFields {
  title?: string;
  headers?: string[];
  rows?: { value: string }[][];
}

export interface BookmarkNodeData extends SharedNodeFields {
  url?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  favicon?: string;
  hostname?: string;
}

export interface CalendarNodeData extends SharedNodeFields {
  title?: string;
  events?: { id: string; date: string; label: string; color: string }[];
}

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  path?: string;
  storageType?: 'r2' | 'google_drive';
  driveFileId?: string;
  category?: string;
  tags?: string[];
  lastModified?: string;
  isDirectory?: boolean;
  zipEntryCount?: number;
  zipEntries?: { name: string; size: number; isDirectory: boolean }[];
  thumbnailUrl?: string;
}

export interface FileAttachmentNodeData extends SharedNodeFields {
  title?: string;
  files?: AttachedFile[];
}

export interface SpreadsheetNodeData extends SharedNodeFields {
  title?: string;
  grid?: { value: string }[][];
}

export interface DatabaseNodeData extends SharedNodeFields {
  title?: string;
  columns: { id: string; name: string; type: 'text' | 'number' | 'date' | 'select'; options?: string[] }[];
  rows: Record<string, any>[];
  views?: { id: string; type: 'table' | 'gallery' | 'kanban'; config: any }[];
}

export interface DailyLogNodeData extends SharedNodeFields {
  title?: string;
  entries: { id: string; timestamp: string; text: string; done?: boolean }[];
}

/**
 * V2NoteNodeData — data shape for the V2 Block-Editor-only note node.
 * Content is stored as a BlockNote Block[] (blockVersion: 2).
 */
export interface V2NoteNodeData extends SharedNodeFields {
  title?: string;
  /** BlockNote Block[] document. Always blockVersion: 2. */
  content?: any[];
  progress?: number;
}

export type CanvasNodeData =
  | AINoteNodeData
  | SummaryNodeData
  | TermQuestionNodeData
  | LectureNotesNodeData
  | PDFNodeData
  | ImageNodeData
  | GroupNodeData
  | FlashcardNodeData
  | StickyNoteNodeData
  | ChecklistNodeData
  | TextNodeData
  | ShapeNodeData
  | DrawingNodeData
  | EmbedNodeData
  | MathNodeData
  | KanbanNodeData
  | BookmarkNodeData
  | CodeSnippetNodeData
  | CalendarNodeData
  | FileAttachmentNodeData
  | SpreadsheetNodeData
  | DatabaseNodeData
  | DailyLogNodeData
  | VideoNodeData
  | TableNodeData
  | V2NoteNodeData;

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  is_public?: boolean;
  parent_workspace_id?: string | null;
  tags?: string[];
  folder?: string | null;
  // Password protection (optional, backward compatible)
  password_hash?: string | null;
  is_password_protected?: boolean;
  // Locked folder visibility (optional)
  is_in_vault?: boolean;
  shared_with?: string[];
  // Canvas virtualization setting (workspace-specific)
  disableVirtualization?: boolean;
}
