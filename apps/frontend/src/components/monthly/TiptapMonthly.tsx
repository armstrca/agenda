import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useState } from 'react';

const TiptapMonthly = ({ tiptap_id, pageId, className, date, isCurrentMonth, plannerId }) => {
  const [initialContent, setInitialContent] = useState('<p></p>');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch existing planner_entry data
  useEffect(() => {
    const fetchPlannerEntry = async () => {
      try {
        const response = await fetch(
          `/api/planners/${plannerId}/pages/${pageId}/planner_entries?tiptap_id=${tiptap_id}`
        );

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            setInitialContent(data[0].content || '<p></p>');
          } else if (data.content) {
            setInitialContent(data.content || '<p></p>');
          }
        } else {
          console.error('Failed to fetch planner entry:', response.status);
        }
      } catch (error) {
        console.error('Error fetching planner entry:', error);
      }
    };

    fetchPlannerEntry();
  }, [pageId, tiptap_id, plannerId]);

  const editor = useEditor({
    editable: true,
    content: initialContent,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      savePlannerEntry(pageId, html, tiptap_id);
    },
    extensions: [
      StarterKit,
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
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  const savePlannerEntry = async (pageId, content, tiptap_id) => {
    if (!pageId) {
      console.error('Cannot save - pageId is missing');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/planners/${plannerId}/pages/${pageId}/planner_entries`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content,
            tiptap_id,
            entry_date: date.toISOString().split('T')[0]
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error saving planner entry:', errorData);
        throw new Error(errorData.error || 'Failed to save planner entry');
      }

      return await response.json();
    } catch (error) {
      console.error('Error saving planner entry:', error);
      // Optionally show error to user
    } finally {
      setIsSaving(false);
    }
  };

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