import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(appDir, '.bistro-data')
const dataFile = path.join(dataDir, 'store.json')

const starterMenu = [
  { id: 1, name: 'Chicken Caesar Wrap', price: 6.5, category: 'Lunch', addedAt: 1714000000001 },
  { id: 2, name: 'Tomato Soup', price: 3.25, category: 'Soup', addedAt: 1714000000002 },
  { id: 3, name: 'Fruit Cup', price: 2.5, category: 'Snack', addedAt: 1714000000003 },
]

const starterUsers = [
  {
    id: 1,
    name: 'Central Bistro Admin',
    email: 'bistro@school.edu',
    password: 'demo123',
    role: 'bistro_admin',
  },
]

const defaultStore = {
  users: starterUsers,
  menu: starterMenu,
  requests: [],
  orders: [],
}

function normalizeStore(raw = {}) {
  return {
    users: Array.isArray(raw.users) ? raw.users : starterUsers,
    menu: Array.isArray(raw.menu) ? raw.menu : starterMenu,
    requests: Array.isArray(raw.requests) ? raw.requests : [],
    orders: Array.isArray(raw.orders) ? raw.orders : [],
  }
}

async function readStore() {
  try {
    return normalizeStore(JSON.parse(await readFile(dataFile, 'utf8')))
  } catch {
    return defaultStore
  }
}

async function writeStore(store) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(dataFile, `${JSON.stringify(normalizeStore(store), null, 2)}\n`)
}

let storeQueue = Promise.resolve()

function updateStore(updater) {
  const nextUpdate = storeQueue.then(async () => {
    const store = await readStore()
    const nextStore = normalizeStore(updater(store))
    await writeStore(nextStore)
    return nextStore
  })
  storeQueue = nextUpdate.catch(() => {})
  return nextUpdate
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null)
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function bistroApiPlugin() {
  const collections = new Set(['users', 'menu', 'requests', 'orders'])

  const middleware = async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/bistro')) return next()

    try {
      if (req.method === 'GET' && url.pathname === '/api/bistro/state') {
        sendJson(res, 200, await readStore())
        return
      }

      const collection = url.pathname.replace('/api/bistro/', '')
      if (req.method === 'PUT' && collections.has(collection)) {
        const payload = await readBody(req)
        if (!Array.isArray(payload)) {
          sendJson(res, 400, { error: 'Expected an array payload.' })
          return
        }

        const nextStore = await updateStore((store) => ({ ...store, [collection]: payload }))
        sendJson(res, 200, nextStore)
        return
      }

      sendJson(res, 404, { error: 'Not found.' })
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Bistro API error.' })
    }
  }

  return {
    name: 'bistro-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [bistroApiPlugin(), react()],
})
