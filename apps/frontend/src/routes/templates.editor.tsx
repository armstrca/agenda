import { createFileRoute } from '@tanstack/react-router'
import PageTemplateEditor from '../components/editor/PageTemplateEditor.tsx'

// Cast path to any to avoid type errors until routeTree is regenerated
export const Route = createFileRoute('/templates/editor' as any)({
  component: () => <PageTemplateEditor />,
})
