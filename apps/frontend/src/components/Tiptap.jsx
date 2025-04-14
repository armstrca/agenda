import { Extension } from '@tiptap/core';
import { Plugin } from 'prosemirror-state';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useState } from 'react';

const NoWrapValidator = Extension.create({
  name: 'noWrapValidator',
  addProseMirrorPlugins() {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = "1.25rem 'Aref Ruqaa', Helvetica"

    return [
      new Plugin({
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true

          const newDoc = tr.doc || state.doc
          const paragraphs = newDoc.content.content.filter(
            node => node.type.name === 'paragraph'
          ).length

          if (paragraphs > 5) return false

          let allowed = true
          newDoc.content.content.forEach(paragraph => {
            const text = paragraph.textContent
            const width = context.measureText(text).width
            if (width > 870) allowed = false
          })

          return allowed
        },
      }),
    ]
  },
})

const Tiptap = ({ tiptap_id, pageId, className }) => {
  // const storageKey = `tiptap-${tiptap_id}`;
  const [initialContent, setInitialContent] = useState('<p></p>');
  const [dimensions, setDimensions] = useState({ width: '100%', height: 'auto' });

  // Fetch existing planner_entry data
  useEffect(() => {
    const fetchPlannerEntry = async () => {
      try {
        const response = await fetch(
          `/api/planners/38e012ec-0ab2-4fbe-8e68-8a75e4716a35/pages/${pageId}/planner_entries?tiptap_id=${tiptap_id}`
        );

        if (response.ok) {
          const data = await response.json();
          // Handle array response and extract the first entry's content
          if (Array.isArray(data) && data.length > 0) {
            setInitialContent(data[0].content);
          } else if (data.content) { // Fallback for single object response
            setInitialContent(data.content);
          }
        } else {

        }
      } catch (error) {

      }
    };

    fetchPlannerEntry();
  }, [pageId, tiptap_id]);

  // Extract dimensions from the className
  // useEffect(() => {
  //   if (className && className.includes('tiptap')) {
  //     const element = document.querySelector(`.${className}`);
  //     console.log('Element:', element);
  //     console.log('ClassName:', className);
  //     if (element) {
  //       const { width, height } = getComputedStyle(element);
  //       setDimensions({ width, height });
  //     }
  //   }
  // }, [className]);

  // Initialize the editor
  const editor = useEditor({
    editable: true,
    content: initialContent,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // localStorage.setItem(storageKey, html);
      savePlannerEntry(pageId, html, tiptap_id);
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
      NoWrapValidator,
    ],
  })

  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  const savePlannerEntry = async (pageId, content, tiptap_id) => {
    try {
      const response = await fetch(`/api/planners/38e012ec-0ab2-4fbe-8e68-8a75e4716a35/pages/${pageId}/planner_entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, tiptap_id }),
      });

      if (!response.ok) {
      }
    } catch (error) {
    }
  };

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
            offset: [0, 10]
          }}
        >
          <div className="bubble-menu">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive('bold') ? 'is-active' : ''}
            >
              Bold
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={editor.isActive('italic') ? 'is-active' : ''}
            >
              Italic
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={editor.isActive('strike') ? 'is-active' : ''}
            >
              Strike
            </button>
            <button
              onClick={() => editor.chain().focus().toggleLink({ href: '' }).run()}
              className={editor.isActive('link') ? 'is-active' : ''}
            >
              Link
            </button>
          </div>
        </BubbleMenu>
      )}
    </div>
  );
};

export default Tiptap