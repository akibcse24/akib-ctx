import type { NodeTypes } from '@xyflow/react';
import { AINoteNode } from '@/components/nodes/AINoteNode';
import { SummaryNode } from '@/components/nodes/SummaryNode';
import { TermQuestionNode } from '@/components/nodes/TermQuestionNode';
import { LectureNotesNode } from '@/components/nodes/LectureNotesNode';
import { PDFNode } from '@/components/nodes/PDFNode';
import { ImageNode } from '@/components/nodes/ImageNode';
import { GroupNode } from '@/components/nodes/GroupNode';
import { FlashcardNode } from '@/components/nodes/FlashcardNode';
import { StickyNoteNode } from '@/components/nodes/StickyNoteNode';
import { ChecklistNode } from '@/components/nodes/ChecklistNode';
import { TextNode } from '@/components/nodes/TextNode';
import { ShapeNode } from '@/components/nodes/ShapeNode';
import { DrawingNode } from '@/components/nodes/DrawingNode';
import { EmbedNode } from '@/components/nodes/EmbedNode';
import { MathNode } from '@/components/nodes/MathNode';
import { VideoNode } from '@/components/nodes/VideoNode';
import { TableNode } from '@/components/nodes/TableNode';
import { CodeSnippetNode } from '@/components/nodes/CodeSnippetNode';
import { KanbanNode } from '@/components/nodes/KanbanNode';
import { BookmarkNode } from '@/components/nodes/BookmarkNode';
import { CalendarNode } from '@/components/nodes/CalendarNode';
import { FileAttachmentNode } from '@/components/nodes/FileAttachmentNode';
import { SpreadsheetNode } from '@/components/nodes/SpreadsheetNode';
import { DatabaseNode } from '@/components/nodes/DatabaseNode';
import { DailyLogNode } from '@/components/nodes/DailyLogNode';
import { V2NoteNode } from '@/components/nodes/V2NoteNode';

export const nodeTypes: NodeTypes = {
  aiNote: AINoteNode,
  summary: SummaryNode,
  termQuestion: TermQuestionNode,
  lectureNotes: LectureNotesNode,
  pdf: PDFNode,
  image: ImageNode,
  group: GroupNode,
  flashcard: FlashcardNode,
  stickyNote: StickyNoteNode,
  checklist: ChecklistNode,
  text: TextNode,
  shape: ShapeNode,
  drawing: DrawingNode,
  embed: EmbedNode,
  math: MathNode,
  video: VideoNode,
  table: TableNode,
  codeSnippet: CodeSnippetNode,
  kanban: KanbanNode,
  bookmark: BookmarkNode,
  calendar: CalendarNode,
  fileAttachment: FileAttachmentNode,
  spreadsheet: SpreadsheetNode,
  databaseNode: DatabaseNode,
  dailyLog: DailyLogNode,
  v2Note: V2NoteNode,
};
