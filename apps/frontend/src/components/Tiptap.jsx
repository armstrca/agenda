import { Extension } from '@tiptap/core'
import { Plugin } from 'prosemirror-state'
import { useEffect } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

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

const Tiptap = ({ id }) => {
  const storageKey = `tiptap-${id}`;
  const editor = useEditor({
    editable: true,
    content: localStorage.getItem(storageKey) || '<p></p>',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      localStorage.setItem(storageKey, html)
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
    <div className="wl-textarea">
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
  )
}

export default Tiptap