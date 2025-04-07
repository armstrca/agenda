import { Extension } from '@tiptap/core'
import { Plugin } from 'prosemirror-state'
import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

const CharacterLimiter = Extension.create({
  name: 'characterLimiter',
  addProseMirrorPlugins() {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = "1.25rem 'Aref Ruqaa', Helvetica" // Match your CSS

    return [
      new Plugin({
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true

          const newDoc = tr.doc || state.doc
          const paragraphs = newDoc.content.content.filter(
            node => node.type.name === 'paragraph'
          ).length

          // Enforce 5 paragraph maximum
          if (paragraphs > 5) return false

          // Check only the 5th paragraph
          if (paragraphs === 5) {
            const lastParagraph = newDoc.content.content[4]
            const textContent = lastParagraph.textContent

            // Measure text width
            const metrics = context.measureText(textContent)
            return metrics.width < 870 // 870px container width
          }

          return true
        },
      }),
    ]
  },
})

const Tiptap = () => {
  const editor = useEditor({
    editable: true,
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
      CharacterLimiter,
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
    </div>
  );
};

export default Tiptap;
