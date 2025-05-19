import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useState } from 'react';
import { ipcInvoke } from '../utils/ipc';

const NoWrapValidator = Extension.create({
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
        filterTransaction: (tr, state) => {
          if (tr.getMeta('init-content')) return true
          if (!tr.docChanged) return true

          // 1. Find the container element
          const selector = this.options.container
          const el = selector
            ? document.querySelector(selector)
            : state.view.dom.parentElement

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
          const paragraphs = newDoc.content.content.filter(
            node => node.type.name === 'paragraph'
          ).length

          if (paragraphs > maxParagraphs) return false

          // 5. (Optional) your existing text‑width check
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          ctx.font = `${fontSize}px ${style.fontFamily}`
          let allowed = true
          newDoc.content.content.forEach(paragraph => {
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

const Tiptap = ({ tiptap_id, pageId, className }) => {
  const [initialContent, setInitialContent] = useState('<p></p>');
  const plannerId = "38e012ec-0ab2-4fbe-8e68-8a75e4716a35";


  useEffect(() => {
    const fetchPlannerEntry = async () => {
      try {
        const data = await ipcInvoke('planner_entries_index', {
          page_id: pageId,
          planner_id: plannerId,
          tiptap_id: tiptap_id
        });

        // Handle IPC response format
        if (data.planner_entries?.length > 0) {
          const rawContent = data.planner_entries[0].content;
          const decodedContent = new DOMParser().parseFromString(rawContent, 'text/html').body.innerHTML;
          setInitialContent(decodedContent);
        }
      } catch (error) {
        console.error('Failed to fetch planner entry:', error);
      }
    };

    fetchPlannerEntry();
  }, [pageId, tiptap_id, plannerId]);

  const editor = useEditor({
    editable: true,
    content: initialContent,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      savePlannerEntry(html);
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
      editor.commands.setContent(initialContent, false, {
        preserveWhitespace: true,
        meta: { 'init-content': true }
      });
    }
  }, [editor, initialContent]);

  const savePlannerEntry = async (content) => {
    try {
      await ipcInvoke('planner_entries_create', {
        page_id: pageId,
        planner_id: plannerId,
        tiptap_id: String(tiptap_id),
        content: content
      });
    } catch (error) {
      console.error('Failed to save planner entry:', error);
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