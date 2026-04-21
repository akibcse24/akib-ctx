import { Node, mergeAttributes } from '@tiptap/react';

/**
 * Caption — small italic centered paragraph
 */
export const CaptionExtension = Node.create({
  name: 'caption',
  group: 'block',
  content: 'inline*',

  parseHTML() {
    return [{ tag: 'p.editor-caption' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, { class: 'editor-caption' }), 0];
  },

  addCommands() {
    return {
      insertCaption:
        () =>
        ({ commands }: any) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'text', text: 'Caption text…' }],
          }),
    } as any;
  },
});

/**
 * Progress Bar — visual percentage bar
 */
export const ProgressExtension = Node.create({
  name: 'progressBar',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      value: { default: 50 },
    };
  },

  parseHTML() {
    return [{
      tag: 'div.editor-progress',
      getAttrs: (el: HTMLElement) => ({
        value: parseInt(el.getAttribute('data-value') || '50', 10),
      }),
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const val = HTMLAttributes.value || 50;
    return [
      'div',
      mergeAttributes({ class: 'editor-progress', 'data-value': val }),
      ['div', { class: 'editor-progress-bar', style: `width: ${val}%` }],
      ['span', { class: 'editor-progress-label' }, `${val}%`],
    ];
  },

  addCommands() {
    return {
      insertProgress:
        (attrs: { value: number }) =>
        ({ commands }: any) =>
          commands.insertContent({
            type: this.name,
            attrs: { value: attrs.value },
          }),
    } as any;
  },
});

/**
 * Badge — inline styled chip
 */
export const BadgeExtension = Node.create({
  name: 'badge',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      label: { default: 'Badge' },
    };
  },

  parseHTML() {
    return [{
      tag: 'span.editor-badge',
      getAttrs: (el: HTMLElement) => ({
        label: el.textContent || 'Badge',
      }),
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'editor-badge' }), HTMLAttributes.label || 'Badge'];
  },

  addCommands() {
    return {
      insertBadge:
        (attrs: { label: string }) =>
        ({ commands }: any) =>
          commands.insertContent({
            type: this.name,
            attrs: { label: attrs.label },
          }),
    } as any;
  },
});

/**
 * Bookmark — link card block
 */
export const BookmarkExtension = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      url: { default: '' },
      title: { default: '' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div.editor-bookmark',
      getAttrs: (el: HTMLElement) => {
        const a = el.querySelector('a');
        return {
          url: a?.getAttribute('href') || '',
          title: a?.querySelector('strong')?.textContent || a?.getAttribute('href') || '',
        };
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const { url, title } = HTMLAttributes;
    return [
      'div',
      { class: 'editor-bookmark' },
      [
        'a',
        { href: url, target: '_blank', rel: 'noopener noreferrer' },
        ['strong', {}, title || url],
        ['br'],
        ['small', {}, url],
      ],
    ];
  },

  addCommands() {
    return {
      insertBookmark:
        (attrs: { url: string; title: string }) =>
        ({ commands }: any) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    } as any;
  },
});

/**
 * Audio Embed — audio player block
 */
export const AudioBlockExtension = Node.create({
  name: 'audioBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div.audio-embed',
      getAttrs: (el: HTMLElement) => ({
        src: el.querySelector('audio')?.getAttribute('src') || '',
      }),
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const { src } = HTMLAttributes;
    const filename = src.split('/').pop() || 'Audio';
    return [
      'div',
      { class: 'audio-embed' },
      ['audio', { controls: 'true', src }],
      ['p', { class: 'audio-caption' }, filename],
    ];
  },

  addCommands() {
    return {
      insertAudioBlock:
        (attrs: { src: string }) =>
        ({ commands }: any) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    } as any;
  },
});

/**
 * Video Embed — video/iframe player block
 */
export const VideoBlockExtension = Node.create({
  name: 'videoBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
      isEmbed: { default: false },
    };
  },

  parseHTML() {
    return [{
      tag: 'div.video-embed',
      getAttrs: (el: HTMLElement) => {
        const iframe = el.querySelector('iframe');
        const video = el.querySelector('video');
        return {
          src: iframe?.getAttribute('src') || video?.getAttribute('src') || '',
          isEmbed: !!iframe,
        };
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, isEmbed } = HTMLAttributes;
    if (isEmbed) {
      return [
        'div',
        { class: 'video-embed' },
        ['iframe', { src, frameborder: '0', allowfullscreen: 'true' }],
      ];
    }
    return [
      'div',
      { class: 'video-embed' },
      ['video', { controls: 'true', src }],
    ];
  },

  addCommands() {
    return {
      insertVideoBlock:
        (attrs: { src: string; isEmbed: boolean }) =>
        ({ commands }: any) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    } as any;
  },
});

/**
 * Footnote Reference — inline superscript marker
 */
export const FootnoteRefExtension = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      noteId: { default: '' },
      label: { default: '*' },
    };
  },

  parseHTML() {
    return [{
      tag: 'sup.footnote-ref',
      getAttrs: (el: HTMLElement) => ({
        noteId: el.getAttribute('data-footnote-id') || '',
        label: el.textContent || '*',
      }),
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes({ class: 'footnote-ref', 'data-footnote-id': HTMLAttributes.noteId || '1' }),
      `[${HTMLAttributes.label || HTMLAttributes.noteId || '1'}]`,
    ];
  },
});

/**
 * Footnote Item — block-level footnote text
 */
export const FootnoteItemExtension = Node.create({
  name: 'footnoteItem',
  group: 'block',
  content: 'inline*',

  addAttributes() {
    return {
      noteId: { default: '' },
      label: { default: '*' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div.footnote-item',
      getAttrs: (el: HTMLElement) => ({
        noteId: el.getAttribute('data-footnote-id') || '',
      }),
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({
        class: 'footnote-item',
        'data-footnote-id': HTMLAttributes.noteId,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertFootnote:
        (attrs: { text: string }) =>
        ({ commands, editor }: any) => {
          const id = String(Date.now());
          commands.insertContent({
            type: 'footnoteRef',
            attrs: { noteId: id, label: '*' },
          });
          return commands.insertContentAt(editor.state.doc.content.size - 1, {
            type: 'footnoteItem',
            attrs: { noteId: id, label: '*' },
            content: [{ type: 'text', text: `[*] ${attrs.text}` }],
          });
        },
    } as any;
  },
});
