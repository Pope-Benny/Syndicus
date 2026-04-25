import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import handler from './dist/server/server.js'

const port = process.env.PORT || 3000

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

  if (url.pathname.startsWith('/assets/')) {
    const assetFile = url.pathname.replace(/^\/assets\//, '')
    const filePath = `./dist/client/assets/${assetFile}`
    if (existsSync(filePath)) {
      const content = await readFile(filePath)
      const ext = assetFile.split('.').pop()
      const types: Record<string, string> = {
        js: 'application/javascript',
        css: 'text/css',
        png: 'image/png',
        jpg: 'image/jpeg',
        svg: 'image/svg+xml',
      }
      res.setHeader('content-type', types[ext!] || 'application/octet-stream')
      res.end(content)
      return
    }
    res.statusCode = 404
    res.end('Not found')
    return
  }

  if (url.pathname === '/hero.png') {
    const heroPath = './dist/client/hero.png'
    if (existsSync(heroPath)) {
      const content = await readFile(heroPath)
      res.setHeader('content-type', 'image/png')
      res.end(content)
      return
    }
  }

  const options: RequestInit = {
    method: req.method ?? 'GET',
    headers: new Headers(req.headers as Record<string, string>),
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    options.body = req
    options.duplex = 'half'
  }

  const request = new Request(url.href, options)

  try {
    const response = await handler.fetch(request)
    res.statusCode = response.status
    for (const [key, value] of response.headers) {
      res.setHeader(key, value)
    }
    const body = await response.text()
    res.end(body)
  } catch (err) {
    res.statusCode = 500
    res.setHeader('content-type', 'text/plain')
    res.end(String(err))
  }
})

server.listen(port, () => {
  console.log(`Server running at http://127.0.0.1:${port}`)
})