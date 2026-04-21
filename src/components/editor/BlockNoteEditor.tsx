import { useCreateBlockNote } from "@blocknote/react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  BasicTextStyleButton,
  BlockTypeSelect,
  ColorStyleButton,
  CreateLinkButton,
  NestBlockButton,
  UnnestBlockButton,
  TextAlignButton,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { MantineProvider } from "@mantine/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@mantine/core/styles.css";
import { useEffect, useRef, useMemo, useCallback, memo } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  createCodeBlockSpec,
  Block,
} from "@blocknote/core";

// Syntax highlighting — do NOT import any highlight.js theme CSS here.
// We ship our own full One Dark Pro palette in the component's <style> tag
// so it stays scoped and doesn't fight global stylesheets.
import { createLowlight, all } from "lowlight";

const lowlight = createLowlight(all);

/**
 * @function highlightCode
 * @description Syntax-highlights code for BlockNote's code block extension.
 * Auto-detects language when none is specified (or 'plaintext') using
 * lowlight's highlightAuto, then falls back to plain text on any error.
 * This gives Notion-style auto-coloring without requiring the user to pick a language.
 * @param {string} code - Source code to highlight
 * @param {string} language - Language identifier; empty/plaintext triggers auto-detect
 * @returns Lowlight HAST root
 * @security No external network calls — fully client-side
 */
const highlightCode = (code: string, language: string) => {
  try {
    const registered = lowlight.listLanguages();
    // Auto-detect when language is unset or explicitly 'plaintext'
    if (!language || language === 'plaintext' || language === 'auto') {
      if (code.trim().length > 0) {
        const result = lowlight.highlightAuto(code, {
          subset: [
            'javascript', 'typescript', 'python', 'html', 'css', 'json',
            'bash', 'sql', 'rust', 'go', 'java', 'cpp', 'csharp', 'php',
            'kotlin', 'swift', 'ruby', 'markdown', 'yaml', 'xml',
          ],
        });
        return result.children;
      }
      return lowlight.highlight('plaintext', code).children;
    }
    const targetLang = registered.includes(language) ? language : 'plaintext';
    return lowlight.highlight(targetLang, code).children;
  } catch {
    // Return a minimal HAST text node array so BlockNote doesn't crash
    return [{ type: 'text' as const, value: code }];
  }
};

const supportedLanguages = {
  plaintext:  { name: 'Plain Text' },
  javascript: { name: 'JavaScript', aliases: ['js', 'jsx'] },
  typescript: { name: 'TypeScript', aliases: ['ts', 'tsx'] },
  python:     { name: 'Python',     aliases: ['py'] },
  html:       { name: 'HTML' },
  css:        { name: 'CSS', aliases: ['scss', 'sass', 'less'] },
  json:       { name: 'JSON' },
  markdown:   { name: 'Markdown', aliases: ['md'] },
  bash:       { name: 'Bash', aliases: ['sh', 'shell', 'zsh'] },
  sql:        { name: 'SQL' },
  cpp:        { name: 'C++', aliases: ['c', 'h'] },
  csharp:     { name: 'C#', aliases: ['cs'] },
  java:       { name: 'Java' },
  go:         { name: 'Go', aliases: ['golang'] },
  rust:       { name: 'Rust', aliases: ['rs'] },
  php:        { name: 'PHP' },
  ruby:       { name: 'Ruby', aliases: ['rb'] },
  kotlin:     { name: 'Kotlin', aliases: ['kt'] },
  swift:      { name: 'Swift' },
  yaml:       { name: 'YAML', aliases: ['yml'] },
  xml:        { name: 'XML' },
  graphql:    { name: 'GraphQL', aliases: ['gql'] },
  dockerfile: { name: 'Dockerfile' },
  nginx:      { name: 'Nginx' },
};

/**
 * Block types that are valid as top-level blocks in BlockNote's default schema.
 * Any block with a type NOT in this set will be converted to a paragraph to
 * prevent BlockNote's schema resolver from receiving `undefined` and crashing
 * with `TypeError: Cannot read properties of undefined (reading 'isInGroup')`.
 */
const VALID_BN_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'codeBlock',
  'image',
  'video',
  'audio',
  'file',
  'table',
  // NOTE: tableRow / tableHead / tableCell are internal ProseMirror nodes.
  // They are NOT valid as top-level BlockNote blocks and will crash the editor
  // if passed to replaceBlocks directly. Leave them out so they get remapped
  // to paragraph by the sanitizer.
  'quote',
  'toggleListItem',
]);

/**
 * Block types that must NOT have a non-empty `children` array in BN's schema.
 * These are leaf or inline-only blocks that cannot contain child blocks.
 * NOTE: 'table' is intentionally excluded — tables need children (rows).
 * tableHead/tableCell/tableRow ARE included: cells hold inline content, not child blocks.
 */
const LEAF_BN_BLOCK_TYPES = new Set([
  'image',
  'video',
  'audio',
  'file',
  'codeBlock',
]);

/**
 * Block types that must NOT have a `content` array in BN's schema
 * (their content is derived from children or props).
 * NOTE: 'table' is intentionally NOT here — the table block uses children,
 * and deleting content from it triggers 'Invalid content for node table: <>'.
 */
const NO_CONTENT_BN_BLOCK_TYPES = new Set([
  'image',
  'video',
  'audio',
  'file',
]);

interface BlockNoteEditorProps {
  initialContent?: Block[];
  onChange?: (blocks: Block[]) => void;
  onLoadError?: () => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  pasteContent?: string;
  pasteFormat?: 'markdown' | 'html';
  nodeId?: string;
}

export const BlockNoteEditor = memo(({
  placeholder,
  className,
  pasteContent,
  pasteFormat,
  nodeId,
  initialContent,
  onChange,
  onLoadError,
  editable = true,
}: BlockNoteEditorProps) => {
  const isInitialMount = useRef(true);
  const syncLock = useRef(false);
  const lastEmittedContent = useRef<string>("");
  const initialContentApplied = useRef(false);
  const pasteAppliedRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  // Follow actual system/user theme — resolvedTheme gives the computed value
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  // BlockNote expects 'light' or 'dark'
  const blockNoteTheme = isDark ? 'dark' : 'light';
  // CSS values for code block that change with theme
  const codeBlockBg   = isDark ? '#0d1117' : '#f6f8fa';
  const codeBlockBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
  const codeBlockText  = isDark ? '#cdd9e5' : '#24292e';

  // Trace: customBlockSpecs — O(1) memoized, only rebuilt if deps change
  // Fix: Provide minimal highlighter that implements the required interface
  const customBlockSpecs = useMemo(() => {
    const createLowlightHighlighter = () =>
      Promise.resolve({
        codeToHast: highlightCode,
        getLoadedLanguages: () => lowlight.listLanguages(),
        getLoadedThemes: () => [],
        loadTheme: () => Promise.resolve(),
      });

    return {
      ...defaultBlockSpecs,
      codeBlock: createCodeBlockSpec({
        supportedLanguages,
        createHighlighter: createLowlightHighlighter,
      }),
    };
  }, []);

  const schema = useMemo(() => BlockNoteSchema.create({
    blockSpecs: customBlockSpecs,
  }), [customBlockSpecs]);

  // Configure the editor — initial content is handled in useEffect for stability
  const editor = useCreateBlockNote({
    schema,
    initialContent: undefined,
  });

  // ─── Block Sanitizer ────────────────────────────────────────────────────────
  /**
   * Recursively sanitizes BlockNote blocks before passing them to replaceBlocks.
   *
   * This prevents the `TypeError: Cannot read properties of undefined (reading 'isInGroup')`
   * crash which occurs when BN's ProseMirror schema resolver receives an unknown
   * block type and returns `undefined` instead of a schema group descriptor.
   *
   * Sanitization rules (applied recursively):
   *   1. Reject null/undefined/non-object blocks
   *   2. Reject blocks without a `type` string
   *   3. Ensure each block has a unique `id`
   *   4. Remap unknown block types to 'paragraph' to keep content visible
   *   5. Strip `content` from block types that don't accept inline content
   *   6. Strip `children` from leaf block types that can't have child blocks
   *   7. Normalize `content` null/undefined → [] for content-bearing blocks
   *   8. Filter out null/undefined items inside content and children arrays
   *   9. Parse JSON-stringified arrays in `props` (legacy Firestore serialization)
   */
  const sanitizeBlocks = useCallback((blocks: any[]): any[] => {
    if (!Array.isArray(blocks)) return [];

    return blocks
      .filter((b: any) => b != null && typeof b === 'object' && typeof b.type === 'string')
      .map((b: any) => {
        const sanitized: any = { ...b };

        // Step 1 — Ensure unique ID
        if (!sanitized.id || typeof sanitized.id !== 'string') {
          sanitized.id = crypto.randomUUID();
        }

        // Step 2 — Remap unknown types to paragraph (prevents isInGroup crash)
        if (!VALID_BN_BLOCK_TYPES.has(sanitized.type)) {
          // Try to preserve any text content
          const textContent = extractTextFromUnknownBlock(b);
          sanitized.type = 'paragraph';
          sanitized.props = {
            textColor: 'default',
            backgroundColor: 'default',
            textAlignment: 'left',
          };
          sanitized.content = textContent
            ? [{ type: 'text', text: textContent, styles: {} }]
            : [];
          sanitized.children = [];
          return sanitized;
        }

        // Step 3 — Sanitize props (expand JSON-stringified arrays)
        if (sanitized.props && typeof sanitized.props === 'object') {
          const props = { ...sanitized.props };
          for (const key of Object.keys(props)) {
            if (typeof props[key] === 'string') {
              try {
                const parsed = JSON.parse(props[key]);
                if (Array.isArray(parsed)) props[key] = parsed;
              } catch { /* keep original string value */ }
            }
          }
          sanitized.props = props;
        }

        // Step 4 — Handle content
        if (NO_CONTENT_BN_BLOCK_TYPES.has(sanitized.type)) {
          // These block types must not have an inline content array
          delete sanitized.content;
        } else {
          // Parse JSON-stringified content (legacy Firestore)
          let contentArr = sanitized.content;
          if (typeof contentArr === 'string') {
            try {
              const parsed = JSON.parse(contentArr);
              contentArr = Array.isArray(parsed) ? parsed : [];
            } catch { contentArr = []; }
          }
          sanitized.content = Array.isArray(contentArr)
            ? contentArr.filter((c: any) => c != null && typeof c === 'object')
            : [];
        }

        // Step 5 — Handle children
        if (LEAF_BN_BLOCK_TYPES.has(sanitized.type)) {
          // Leaf blocks must not have children
          sanitized.children = [];
        } else if (sanitized.type === 'table') {
          // Table children must be tableRow blocks. Any other child type is invalid
          // and will cause 'Invalid content for node table: <>' in ProseMirror.
          // Clear all children — if the table has no valid rows, step 6 converts it
          // to a paragraph.
          sanitized.children = [];
        } else {
          let childrenArr = sanitized.children;
          if (typeof childrenArr === 'string') {
            try {
              const parsed = JSON.parse(childrenArr);
              childrenArr = Array.isArray(parsed) ? parsed : [];
            } catch { childrenArr = []; }
          }
          sanitized.children = Array.isArray(childrenArr)
            ? sanitizeBlocks(childrenArr)
            : [];
        }

        // Step 6 — Validate table blocks have at least one row
        if (sanitized.type === 'table' && (!sanitized.children || sanitized.children.length === 0)) {
          sanitized.type = 'paragraph';
          sanitized.props = {
            textColor: 'default',
            backgroundColor: 'default',
            textAlignment: 'left',
          };
          sanitized.content = [];
        }

        return sanitized;
      });
  }, []);

  // Handle image paste from clipboard
  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!editor || !editable) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = (event) => {
          const src = event.target?.result as string;
          if (src) {
            const imageBlock: any = {
              type: 'image',
              props: {
                url: src,
                caption: '',
                name: file.name || 'pasted-image',
                showPreview: true,
                previewWidth: 512
              }
            };

            try {
              const lastBlock = editor.document[editor.document.length - 1];
              if (lastBlock) {
                editor.insertBlocks([imageBlock], lastBlock, "after");
              } else {
                editor.insertBlocks([imageBlock], editor.document[0], "before");
              }
              lastEmittedContent.current = JSON.stringify(editor.document);
              onChange?.(editor.document);
            } catch (err) {
              console.error('[BlockNote] Image paste failed:', err);
            }
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }, [editor, editable, onChange]);

  // Attach paste handler
  useEffect(() => {
    if (!editor || !wrapperRef.current) return;

    const wrapper = wrapperRef.current;
    wrapper.addEventListener('paste', handlePaste as any);

    return () => {
      wrapper.removeEventListener('paste', handlePaste as any);
    };
  }, [editor, handlePaste]);

  /**
   * Apply initial content once when editor is ready.
   *
   * Fix for `isInGroup` crash (PRIMARY):
   * ProseMirror needs one full event loop turn after `useCreateBlockNote` to
   * commit its initial empty-document transaction to the view. Calling
   * `replaceBlocks` synchronously in the same render violates this and causes
   * the schema group resolver to receive `undefined`.
   *
   * We use `requestAnimationFrame` to defer the call to after the browser has
   * painted the initial empty editor, at which point all internal ProseMirror
   * state is fully committed and safe to mutate.
   */
  useEffect(() => {
    if (!editor || initialContentApplied.current) return;

    const hasValidContent = Array.isArray(initialContent) && initialContent.length > 0;
    if (!hasValidContent) {
      initialContentApplied.current = true;
      return;
    }

    let cancelled = false;

    const applyContent = () => {
      if (cancelled) return;

      const safeContent = sanitizeBlocks(initialContent as any[]);
      if (safeContent.length === 0) {
        initialContentApplied.current = true;
        return;
      }

      // Phase 1: Optimistic batch — fast path for well-formed content
      try {
        syncLock.current = true;
        editor.replaceBlocks(editor.document, safeContent);
        if (!cancelled) {
          initialContentApplied.current = true;
          lastEmittedContent.current = JSON.stringify(editor.document);
        }
        syncLock.current = false;
        return;
      } catch (batchError) {
        syncLock.current = false;
        console.warn(
          '[BlockNote] Batch replaceBlocks failed, switching to resilient one-by-one mode:',
          (batchError as Error)?.message ?? batchError
        );
      }

      // Phase 2: Resilient one-by-one insertion — isolates bad blocks instead of
      // falling back to Tiptap entirely. Skips any block that throws.
      if (cancelled) return;

      let inserted = 0;
      syncLock.current = true;
      try {
        for (let i = 0; i < safeContent.length; i++) {
          if (cancelled) break;
          try {
            const block = safeContent[i];
            if (i === 0) {
              editor.replaceBlocks(editor.document, [block]);
            } else {
              const lastDoc = editor.document;
              const anchor = lastDoc[lastDoc.length - 1];
              if (anchor) editor.insertBlocks([block], anchor, 'after');
            }
            inserted++;
          } catch (blockError) {
            console.warn(
              `[BlockNote] Skipping block ${i} (type="${safeContent[i]?.type}") — schema error:`,
              (blockError as Error)?.message ?? blockError
            );
          }
        }
      } finally {
        syncLock.current = false;
      }

      if (!cancelled) {
        if (inserted === 0 && safeContent.length > 0) {
          // Every single block failed — nothing we can do, signal fallback
          console.error('[BlockNote] All blocks failed to insert — falling back to Tiptap');
          onLoadErrorRef.current?.();
        } else {
          initialContentApplied.current = true;
          lastEmittedContent.current = JSON.stringify(editor.document);
        }
      }
    };

    // Defer by one animation frame to let ProseMirror commit its initial transaction
    const rafHandle = requestAnimationFrame(applyContent);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
    };
  }, [editor, initialContent, sanitizeBlocks]);



  // Handle paste content separately - only once per unique paste/node session
  useEffect(() => {
    if (!editor || !pasteContent) {
      // Clear the ref if pasteContent is removed from the store, allowing re-paste later if needed
      pasteAppliedRef.current = null;
      return;
    }
    
    // Safety: don't apply same content twice to the same node
    const compositeKey = `${nodeId || 'unknown'}:${pasteContent}`;
    if (pasteAppliedRef.current === compositeKey) return;
    pasteAppliedRef.current = compositeKey;

    const handlePasteContent = async () => {
      try {
        let blocks: Block[] = [];
        if (pasteFormat === 'markdown') {
          blocks = await editor.tryParseMarkdownToBlocks(pasteContent);
        } else if (pasteFormat === 'html') {
          blocks = await editor.tryParseHTMLToBlocks(pasteContent);
        }

        if (blocks.length > 0) {
          syncLock.current = true;
          try {
            const lastBlock = editor.document[editor.document.length - 1];
            if (lastBlock) {
              editor.insertBlocks(blocks, lastBlock, "after");
            } else {
              editor.replaceBlocks(editor.document, blocks);
            }
            lastEmittedContent.current = JSON.stringify(editor.document);
          } finally {
            syncLock.current = false;
          }
          // Trigger a change to ensure the parent clears the paste fields
          onChange?.(editor.document);
        }
      } catch (error) {
        console.error('[BlockNote] Paste failed:', error);
      }
    };

    handlePasteContent();
  }, [editor, pasteContent, pasteFormat, nodeId, onChange]);

  // Handle content changes
  useEffect(() => {
    if (!editor || !onChange) return;

    const cleanup = editor.onChange(() => {
      if (syncLock.current) return;
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }

      const currentJson = JSON.stringify(editor.document);
      if (currentJson === lastEmittedContent.current) return;
      lastEmittedContent.current = currentJson;

      onChange(editor.document);
    });

    return cleanup;
  }, [editor, onChange]);

  return (
    <MantineProvider>
      <div ref={wrapperRef} className={cn("blocknote-wrapper h-full", className)}>
        <BlockNoteView
          editor={editor}
          editable={editable}
          className="min-h-full"
          theme={blockNoteTheme}
          formattingToolbar={false}
        >
          {/* Custom Formatting Toolbar with full color picker — Notion-style */}
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                <BlockTypeSelect key="blockTypeSelect" />

                {/* Text styles */}
                <BasicTextStyleButton basicTextStyle="bold"      key="bold" />
                <BasicTextStyleButton basicTextStyle="italic"    key="italic" />
                <BasicTextStyleButton basicTextStyle="underline" key="underline" />
                <BasicTextStyleButton basicTextStyle="strike"    key="strike" />
                <BasicTextStyleButton basicTextStyle="code"      key="inlineCode" />

                {/* Text alignment */}
                <TextAlignButton textAlignment="left"   key="alignLeft" />
                <TextAlignButton textAlignment="center" key="alignCenter" />
                <TextAlignButton textAlignment="right"  key="alignRight" />

                {/* Color & Highlight picker — the Notion-style color menu */}
                <ColorStyleButton key="colorStyleButton" />

                {/* Nesting */}
                <NestBlockButton   key="nestBlock" />
                <UnnestBlockButton key="unnestBlock" />

                {/* Link */}
                <CreateLinkButton key="createLink" />
              </FormattingToolbar>
            )}
          />
        </BlockNoteView>
        <style>{`
          /* ── Base layout ──────────────────────────────────────────────── */
          /* Force all Mantine/BlockNote containers to be transparent so the
             editor inherits the node card background (system theme-aware).  */
          .blocknote-wrapper,
          .blocknote-wrapper > *,
          .blocknote-wrapper .mantine-Paper-root,
          .blocknote-wrapper .bn-container,
          .blocknote-wrapper [class^="mantine-"] {
            background: transparent !important;
            background-color: transparent !important;
          }
          .blocknote-wrapper .bn-container {
            padding: 0 !important;
          }
          .blocknote-wrapper .bn-editor {
            padding-inline: 40px !important;
            padding-block: 20px !important;
            font-size: 15px !important;
            line-height: 1.7;
            font-family: inherit !important;
            color: hsl(var(--foreground)) !important;
          }
          .bn-root {
            --bn-colors-editor-background: transparent;
            --bn-colors-editor-text: hsl(var(--foreground));
            --bn-colors-cursor: hsl(var(--primary));
            --bn-border-radius: 12px;
          }

          /* ── Formatting Toolbar — glassmorphism ───────────────────────── */
          .bn-toolbar {
            background: hsl(var(--card) / 0.92) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
            border: 1px solid hsl(var(--border) / 0.35) !important;
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important;
            padding: 4px 6px !important;
          }
          .bn-toolbar button { border-radius: 6px !important; }
          .bn-toolbar button:hover { background: hsl(var(--accent)) !important; }
          .bn-toolbar button[data-active] {
            background: hsl(var(--primary) / 0.15) !important;
            color: hsl(var(--primary)) !important;
          }

          /* ── Code Block container (theme-aware) ───────────────────────── */
          .blocknote-wrapper .bn-block-content[data-content-type="codeBlock"] {
            margin: 1.5rem 0 !important;
          }
          .blocknote-wrapper .bn-code-block {
            background: ${codeBlockBg} !important;
            color: ${codeBlockText} !important;
            border: 1px solid ${codeBlockBorder} !important;
            border-radius: 12px !important;
            padding: 1.25rem 1.5rem !important;
            box-shadow: 0 4px 24px rgba(0,0,0,0.25) !important;
            font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace !important;
            font-size: 13.5px !important;
            font-variant-ligatures: contextual !important;
            line-height: 1.7 !important;
            position: relative;
            overflow: auto;
          }
          /* Language badge */
          .blocknote-wrapper .bn-code-block::before {
            content: attr(data-language);
            position: absolute;
            top: 0; right: 1.25rem;
            padding: 1px 10px 3px;
            background: rgba(139,92,246,0.10);
            color: #a78bfa;
            font-size: 9px; font-weight: 800;
            letter-spacing: 0.15em; text-transform: uppercase;
            border-radius: 0 0 8px 8px;
            border: 1px solid rgba(139,92,246,0.2); border-top: none;
          }

          /* ── Theme-Aware Syntax Palette ───────────────────────────── */
          .blocknote-wrapper .hljs-keyword,
          .blocknote-wrapper .hljs-built_in,
          .blocknote-wrapper .hljs-selector-tag {
            color: ${isDark ? '#c792ea' : '#d73a49'} !important;
            font-weight: 600 !important;
          }

          /* Strings */
          .blocknote-wrapper .hljs-string,
          .blocknote-wrapper .hljs-template-variable,
          .blocknote-wrapper .hljs-template-tag {
            color: ${isDark ? '#c3e88d' : '#032f62'} !important;
          }

          /* Numbers & booleans */
          .blocknote-wrapper .hljs-number { color: ${isDark ? '#f78c6c' : '#005cc5'} !important; }
          .blocknote-wrapper .hljs-literal { color: ${isDark ? '#ff5874' : '#005cc5'} !important; font-style: italic !important; }

          /* Comments */
          .blocknote-wrapper .hljs-comment,
          .blocknote-wrapper .hljs-quote {
            color: ${isDark ? '#697098' : '#6a737d'} !important;
            font-style: italic !important;
          }

          /* Function / method names */
          .blocknote-wrapper .hljs-title,
          .blocknote-wrapper .hljs-title\\.function,
          .blocknote-wrapper .hljs-function > .hljs-title {
            color: ${isDark ? '#82aaff' : '#6f42c1'} !important;
            font-weight: 600 !important;
          }

          /* Type names, class names */
          .blocknote-wrapper .hljs-type,
          .blocknote-wrapper .hljs-class,
          .blocknote-wrapper .hljs-title\\.class {
            color: ${isDark ? '#ffcb6b' : '#22863a'} !important;
            font-weight: 600 !important;
          }

          /* Variables, parameters */
          .blocknote-wrapper .hljs-variable,
          .blocknote-wrapper .hljs-params { color: ${isDark ? '#89ddff' : '#24292e'} !important; }

          /* Properties / object keys */
          .blocknote-wrapper .hljs-property { color: ${isDark ? '#80cbc4' : '#005cc5'} !important; }

          /* Attributes (HTML, JSX) */
          .blocknote-wrapper .hljs-attr,
          .blocknote-wrapper .hljs-attribute { color: ${isDark ? '#ffcb6b' : '#005cc5'} !important; }

          /* HTML / JSX tag names */
          .blocknote-wrapper .hljs-name,
          .blocknote-wrapper .hljs-tag { color: ${isDark ? '#f07178' : '#22863a'} !important; }

          /* Operators and punctuation */
          .blocknote-wrapper .hljs-operator  { color: ${isDark ? '#89ddff' : '#d73a49'} !important; opacity:0.85; }
          .blocknote-wrapper .hljs-punctuation { color: ${isDark ? '#89ddff' : '#24292e'} !important; opacity:0.7; }

          /* CSS selectors */
          .blocknote-wrapper .hljs-selector-id    { color: ${isDark ? '#82aaff' : '#6f42c1'} !important; }
          .blocknote-wrapper .hljs-selector-class  { color: ${isDark ? '#ffcb6b' : '#005cc5'} !important; }
          .blocknote-wrapper .hljs-selector-attr   { color: ${isDark ? '#c3e88d' : '#22863a'} !important; }
          .blocknote-wrapper .hljs-selector-pseudo { color: ${isDark ? '#89ddff' : '#6f42c1'} !important; }

          /* Regex */
          .blocknote-wrapper .hljs-regexp        { color: #f07178 !important; }

          /* Decorators / meta / annotation */
          .blocknote-wrapper .hljs-meta          { color: #b2b2ff !important; }
          .blocknote-wrapper .hljs-meta .hljs-string { color: #c3e88d !important; }

          /* Section headings (Markdown h1/h2, etc.) */
          .blocknote-wrapper .hljs-section       { color: #82aaff !important; font-weight: 700 !important; }
          .blocknote-wrapper .hljs-bullet        { color: #c792ea !important; }
          .blocknote-wrapper .hljs-emphasis      { color: #f07178 !important; font-style: italic !important; }
          .blocknote-wrapper .hljs-strong        { color: #f07178 !important; font-weight: 700 !important; }
          .blocknote-wrapper .hljs-link          { color: #82aaff !important; text-decoration: underline !important; }
          .blocknote-wrapper .hljs-code          { color: #c3e88d !important; }

          /* Diff additions / deletions */
          .blocknote-wrapper .hljs-addition {
            color: #c3e88d !important;
            background: rgba(195,232,141,0.10) !important;
          }
          .blocknote-wrapper .hljs-deletion {
            color: #f07178 !important;
            background: rgba(240,113,120,0.12) !important;
          }

          /* JSON keys go purple */
          .blocknote-wrapper .hljs-attr { color: #c792ea !important; }

          /* ── Inline code pill — Notion-style ──────────────────────────── */
          .blocknote-wrapper .bn-inline-content code,
          .blocknote-wrapper code:not([class*="hljs"]) {
            background: rgba(139,92,246,0.12) !important;
            color: #c792ea !important;
            border: 1px solid rgba(139,92,246,0.20) !important;
            border-radius: 5px !important;
            padding: 1px 6px !important;
            font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
            font-size: 0.875em !important;
          }

          /* ── BlockNote named text colors ──────────────────────────────── */
          [data-text-color="red"]    { color: #ff5874 !important; }
          [data-text-color="orange"] { color: #f78c6c !important; }
          [data-text-color="yellow"] { color: #f9c859 !important; }
          [data-text-color="green"]  { color: #c3e88d !important; }
          [data-text-color="blue"]   { color: #82aaff !important; }
          [data-text-color="purple"] { color: #c792ea !important; }
          [data-text-color="pink"]   { color: #f07178 !important; }
          [data-text-color="gray"]   { color: #697098 !important; }
          [data-text-color="brown"]  { color: #c4a882 !important; }

          /* ── BlockNote highlight background colors ─────────────────────── */
          [data-background-color="red"]    { background: rgba(255,88,116,0.18) !important; border-radius:3px; padding:0 2px; }
          [data-background-color="orange"] { background: rgba(247,140,108,0.18) !important; border-radius:3px; padding:0 2px; }
          [data-background-color="yellow"] { background: rgba(249,200,89,0.20) !important;  border-radius:3px; padding:0 2px; }
          [data-background-color="green"]  { background: rgba(195,232,141,0.16) !important; border-radius:3px; padding:0 2px; }
          [data-background-color="blue"]   { background: rgba(130,170,255,0.15) !important; border-radius:3px; padding:0 2px; }
          [data-background-color="purple"] { background: rgba(199,146,234,0.15) !important; border-radius:3px; padding:0 2px; }
          [data-background-color="pink"]   { background: rgba(240,113,120,0.15) !important; border-radius:3px; padding:0 2px; }
          [data-background-color="gray"]   { background: rgba(105,112,152,0.15) !important; border-radius:3px; padding:0 2px; }
          [data-background-color="brown"]  { background: rgba(196,168,130,0.15) !important; border-radius:3px; padding:0 2px; }

          /* ── Misc polish ──────────────────────────────────────────────── */
          .bn-editor ::selection { background: hsl(var(--primary) / 0.25) !important; }
          .bn-editor .ProseMirror-focused { caret-color: hsl(var(--primary)); }
          .bn-suggestion-menu {
            border-radius: 12px !important;
            background: hsl(var(--card)) !important;
            border: 1px solid hsl(var(--border) / 0.15) !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.45) !important;
          }
          .bn-suggestion-menu-item:hover,
          .bn-suggestion-menu-item[data-selected="true"] {
            background: hsl(var(--accent)) !important;
            border-radius: 8px !important;
          }
        `}</style>
      </div>
    </MantineProvider>
  );
});


/**
 * @function extractTextFromUnknownBlock
 * @description Best-effort text extraction from any block type not in the
 * valid set, so we don't silently discard user content.
 * @param {any} block - Any block-like object
 * @returns {string} Extracted text or empty string
 */
function extractTextFromUnknownBlock(block: any): string {
  if (!block) return '';

  // Try content array first
  if (Array.isArray(block.content)) {
    const text = block.content
      .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
      .map((c: any) => c.text)
      .join('');
    if (text) return text;
  }

  // Try children
  if (Array.isArray(block.children)) {
    return block.children.map(extractTextFromUnknownBlock).filter(Boolean).join(' ');
  }

  // Try props.text or props.content
  if (block.props) {
    if (typeof block.props.text === 'string') return block.props.text;
    if (typeof block.props.content === 'string') return block.props.content;
    if (typeof block.props.caption === 'string') return block.props.caption;
    if (typeof block.props.url === 'string') return `[File: ${block.props.name || block.props.url}]`;
  }

  return '';
}

BlockNoteEditor.displayName = 'BlockNoteEditor';
export default BlockNoteEditor;
