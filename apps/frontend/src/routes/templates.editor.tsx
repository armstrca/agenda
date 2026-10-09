import { createFileRoute } from '@tanstack/react-router'
import PageTemplateEditor from '../components/editor/PageTemplateEditor.tsx'

export const Route = createFileRoute('/templates/editor')({
  component: () => <PageTemplateEditor />,
})
