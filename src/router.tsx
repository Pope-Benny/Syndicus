import * as React from 'react'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: () => (
      <div className="newspaper-container">
        <h1>Not Found</h1>
        <p>The requested page could not be found.</p>
        <a href="/" className="nav-link">Return to Feed</a>
      </div>
    ),
  })

  return router
}