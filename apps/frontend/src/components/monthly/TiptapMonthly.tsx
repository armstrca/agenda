import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Content, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useRef, useState } from 'react';
import { getDb } from '../../db/index.ts';
import { getEntry, upsertEntry } from '../../domain/entries.ts';
import { toISO } from '../../domain/dates.ts';
import type { EntryContent } from '../../domain/types.ts';

interface TiptapMonthlyProps {
  tiptap_id: string | number;
  pageId: string;
  className: string;
  date?: Date;
  isCurrentMonth?: boolean;
}

// One day cell of the monthly page. Keyed by (pageId, tiptap_id) like the weekly slots; the entry
// date is the cell's calendar day, formatted from local components (never toISOString, which is UTC).
const TiptapMonthly = ({ tiptap_id, pageId, className, date, isCurrentMonth }: TiptapMonthlyProps) => {
  const [initialContent, setInitialContent] = useState<Content>('<p></p>');
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<EntryContent | null>(null);
  const slot = String(tiptap_id);
  const entryDate = date instanceof Date ? toISO(date) : null;

  useEffect(() => {
    if (!pageId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const entry = await getEntry(db, pageId, slot);
        if (!cancelled && entry) setInitialContent(entry.content as JSONContent);
      } catch (error) {
        console.error('Error fetching planner entry:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, slot]);

  const savePlannerEntry = async (content: EntryContent) => {
    if (!pageId || !entryDate) {
      console.error('Cannot save planner entry: missing pageId or date', { pageId, entryDate, slot });
      return;
    }
    try {
      const db = await getDb();
      await upsertEntry(db, { page_id: pageId, tiptap_id: slot, entry_date: entryDate, content });
    } catch (error) {
      console.error('Error saving planner entry:', error);
    }
  };

  const debouncedSave = (content: EntryContent) => {
    pending.current = content;
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      pending.current = null;
      savePlannerEntry(content);
    }, 2000);
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
    // Keep TipTap 2's re-render-per-transaction so the bubble menu's active states update.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => {
      debouncedSave(editor.getJSON());
    },
    extensions: [
      // StarterKit 3 bundles Link; disabled because Link is configured below.
      StarterKit.configure({ link: false }),
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
    ],
  });

  useEffect(() => {
    if (editor && initialContent) {
      // TipTap 3 emits an update for setContent by default, which would re-save what was just loaded.
      editor.commands.setContent(initialContent, { emitUpdate: false });
    }
  }, [editor, initialContent]);

  return (
    <div className={className} style={{ opacity: isCurrentMonth ? 1 : 0.5 }}>
      <div className="content-wrapper">
        <div className="monthly-day-cell-date-box">
          <div className="monthly-day-cell-date">
            {date?.getDate()}
          </div>
        </div>
        <EditorContent
          editor={editor}
          className="monthly-day-cell-tiptap-main"
          spellCheck={false}
        />
      </div>

      {editor && (
        <BubbleMenu editor={editor}>
          <div className="bubble-menu">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive('bold') ? 'is-active' : ''}
            >
              B
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={editor.isActive('italic') ? 'is-active' : ''}
            >
              I
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={editor.isActive('strike') ? 'is-active' : ''}
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

export default TiptapMonthly;
