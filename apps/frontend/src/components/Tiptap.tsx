import { Extension, type Content, type JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useState, useRef } from 'react';
import { getDb } from '../db/index.ts';
import { getEntry, upsertEntry } from '../domain/entries.ts';
import type { ISODate } from '../domain/dates.ts';
import type { EntryContent } from '../domain/types.ts';

interface NoWrapValidatorOptions {
  /** CSS selector of the box the text must fit in; defaults to the editor's parent element. */
  container: string | null;
  maxWidth: number;
}

// Rejects edits that would overflow the fixed-size text box on the paper page: too many
// paragraphs for its height, or a line wider than it. Transactions flagged 'init-content' (loading
// a saved entry) are always let through.
const NoWrapValidator = Extension.create<NoWrapValidatorOptions>({
  name: 'noWrapValidator',
  addOptions() {
    return {
      container: null,
      maxWidth: 870,
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('noWrapValidator'),
        filterTransaction: (tr) => {
          if (tr.getMeta('init-content')) return true
          if (!tr.docChanged) return true

          // 1. Find the container element
          const selector = this.options.container
          const el = selector
            ? document.querySelector(selector)
            : this.editor.view.dom.parentElement

          if (!el) {
            return true
          }

          // 2. Measure container height & font size
          const style = window.getComputedStyle(el)
          const lineHeight = parseFloat(style.lineHeight)
          const containerInner = el.clientHeight
          const fontSize = parseFloat(style.fontSize)
          const maxParagraphs = Math.floor(containerInner / lineHeight)
          const preciseWidth = el.getBoundingClientRect().width;

          // 4. Count paragraphs in the new doc
          const newDoc = tr.doc
          let paragraphs = 0
          newDoc.forEach(node => {
            if (node.type.name === 'paragraph') paragraphs++
          })

          if (paragraphs > maxParagraphs) return false

          // 5. (Optional) your existing text‑width check
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) return true
          ctx.font = `${fontSize}px ${style.fontFamily}`
          let allowed = true
          newDoc.forEach(paragraph => {
            const text = paragraph.textContent
            const w = ctx.measureText(text).width
            if (w > preciseWidth) allowed = false
          })

          return allowed
        },
      }),
    ]
  },
})

interface TiptapProps {
  tiptap_id: string | number;
  pageId: string;
  className: string;
  entryDate?: ISODate;
}

// One editor slot on a page. The slot is identified by (pageId, tiptap_id); its text is stored as
// the TipTap JSON document under that key, dated with the day it belongs to (entryDate).
const Tiptap = ({ tiptap_id, pageId, className, entryDate }: TiptapProps) => {
  const [initialContent, setInitialContent] = useState<Content>('<p></p>');
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<EntryContent | null>(null);
  const slot = String(tiptap_id);

  useEffect(() => {
    if (!pageId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const entry = await getEntry(db, pageId, slot);
        if (!cancelled && entry) setInitialContent(entry.content as JSONContent);
      } catch (error) {
        console.error('Failed to load planner entry:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, slot]);

  const savePlannerEntry = async (content: EntryContent) => {
    if (!pageId || !entryDate) {
      console.error('Cannot save planner entry: missing pageId or entryDate', { pageId, entryDate, slot });
      return;
    }
    try {
      const db = await getDb();
      await upsertEntry(db, { page_id: pageId, tiptap_id: slot, entry_date: entryDate, content });
    } catch (error) {
      console.error('Failed to save planner entry:', error);
    }
  };

  // Debounced save; a pending save is flushed when the editor unmounts (navigation) so nothing is lost.
  const debouncedSave = (content: EntryContent) => {
    pending.current = content;
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      pending.current = null;
      savePlannerEntry(content);
    }, 2000); // 2s debounce
  };

  useEffect(() => () => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    if (pending.current !== null) {
      const content = pending.current;
      pending.current = null;
      void savePlannerEntry(content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, slot, entryDate]);

  const editor = useEditor({
    editable: true,
    content: initialContent,
    onUpdate: ({ editor }) => {
      debouncedSave(editor.getJSON());
    },
    extensions: [
      StarterKit.configure({ hardBreak: false }),
      Link.configure({
        autolink: true,
        defaultProtocol: 'https',
        shouldAutoLink: (url) =>
          url.startsWith('www.') ||
          url.startsWith('http://') ||
          url.startsWith('https://') ||
          url.endsWith('.com') ||
          url.endsWith('.net') ||
          url.endsWith('.org') ||
          url.endsWith('.io') ||
          url.endsWith('.dev') ||
          url.endsWith('.app') ||
          url.endsWith('.gov') ||
          url.endsWith('.edu') ||
          url.startsWith('slack:') ||
          url.startsWith('git:') ||
          url.startsWith('sms:') ||
          url.startsWith('smsto:') ||
          url.startsWith('mmsto:') ||
          url.startsWith('skype:') ||
          url.startsWith('callto:') ||
          url.startsWith('webcal:') ||
          url.startsWith('tel:') ||
          url.startsWith('mailto:'),
        openOnClick: true,
        protocols: [
          'http', 'https', 'mailto', 'tel', 'slack', 'git', 'fax',
          'modem', 'sms', 'smsto', 'mmsto', 'skype', 'callto', 'webcal'
        ],
      }),
      NoWrapValidator.configure({
        container: `.${className}`,
        maxWidth: 870,
      }),
    ],
  })

  useEffect(() => {
    if (editor && initialContent) {
      // The 'init-content' meta has to sit on the transaction itself for NoWrapValidator to see it;
      // setContent's parse options cannot carry it.
      editor
        .chain()
        .command(({ tr }) => {
          tr.setMeta('init-content', true);
          return true;
        })
        .setContent(initialContent, false, { preserveWhitespace: true })
        .run();
    }
  }, [editor, initialContent]);

  useEffect(() => {
    if (!editor) return;

    const removeInvalidLinks = () => {
      const { state, view } = editor;
      let tr = state.tr;
      state.doc.descendants((node, pos) => {
        node.marks.forEach((mark) => {
          if (mark.type.name === 'link') {
            const text = node.textContent;
            const valid =
              text &&
              (
                text.match(/^(https?:\/\/|www\.)/) ||
                text.match(/\.(com|net|org|io|dev|app|gov|edu)$/i) ||
                text.match(/^(slack:|git:|sms:|smsto:|mmsto:|skype:|callto:|webcal:|tel:|mailto:)/)
              );
            if (!valid) {
              tr = tr.removeMark(pos, pos + node.nodeSize, mark);
            }
          }
        });
      });
      if (tr.docChanged) {
        view.dispatch(tr);
      }
    };

    editor.on('transaction', removeInvalidLinks);

    return () => {
      editor.off('transaction', removeInvalidLinks);
    };
  }, [editor]);

  return (
    <div
      className={className}
    >
      <EditorContent editor={editor} />

      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{
            duration: 100,
            placement: 'top',
            offset: [0, 10],
            appendTo: () => document.body,
          }}
        >
          <div className="bubble-menu">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive('bold') ? 'is-active' : ''}
              style={{ fontWeight: 'bold' }}
            >
              B
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={editor.isActive('italic') ? 'is-active' : ''}
              style={{ fontStyle: 'italic' }}
            >
              I
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={editor.isActive('strike') ? 'is-active' : ''}
              style={{ textDecoration: 'line-through' }}
            >
              S
            </button>
            <button
              onClick={() => editor.chain().focus().toggleLink({ href: '' }).run()}
              className={editor.isActive('link') ? 'is-active' : ''}
            >
              🔗
            </button>
          </div>
        </BubbleMenu>
      )}
    </div>
  );
};

export default Tiptap
