import { createFileRoute } from '@tanstack/react-router'
import React from 'react'
import TldrawComponent from '../components/TLDrawComponent'

export const Route = createFileRoute('/tldraw')({
  component: TldrawComponent,
})

function RouteComponent() {
  return <div>Hello "/tldraw"!</div>
}
