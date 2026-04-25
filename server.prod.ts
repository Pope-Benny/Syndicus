import { serve } from 'h3-v2'

const serverModule = await import('./dist/server/server.js')
const server = serverModule.default

const port = parseInt(process.env.PORT || '3003', 10)

const serverInstance = serve(server.fetch, {
  port,
})

console.log(`Server running on http://localhost:${port}`)