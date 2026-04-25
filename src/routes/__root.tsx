/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import '../styles.css'

const getPreferences = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await import('~/lib/db').then(m => m.getDb())
  return db.prepare('SELECT dark_mode FROM preferences WHERE id = 1').get()
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Syndicus - AI Curated RSS Reader',
      },
    ],
  }),
  loader: async () => {
    const prefs = await getPreferences({ data: {} })
    return { darkMode: prefs?.dark_mode === 1 }
  },
  component: RootComponent,
})

function RootComponent() {
  const data = Route.useLoaderData()

  return (
    <RootDocument darkMode={data?.darkMode}>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children, darkMode }: Readonly<{ children: ReactNode; darkMode?: boolean }>) {
  return (
    <html className={darkMode ? 'dark' : ''}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}