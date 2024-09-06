import { Hono, HonoRequest } from 'hono'
import { logger } from 'hono/logger'
import { timing } from 'hono/timing'
import { requestId } from 'hono/request-id'
import { zValidator } from '@hono/zod-validator'
import * as R from 'ramda'
import { z } from 'zod'

import { handle } from '@phala/wapo-env/host'

import { fetch_pinata } from './code_storage/ipfs'
import { cached } from './code_storage/cache_adapter'
import { sqld_execute } from './sqld'
import { secretSchema, secretAccessTokenSchema, get_vault_item, get_vault_item_by_access_token, save_secret } from './vault/sqld_adapter'

const app = new Hono()

app.use('*', logger())
app.use('*', timing())
app.use('*', requestId())

const LogLevel: Readonly<Record<number, string>> = {
  2: 'INFO',
  3: 'WARN',
  4: 'ERROR',
}

async function run_guest_script(cid: string, path: string, req: HonoRequest, requestId: string) {
  const code = await cached(cid, fetch_pinata)

  //
  // Prepare payload
  //
  let body: string | undefined = undefined
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    const buffer = await req.arrayBuffer()
    body = Buffer.from(buffer).toString()
  }

  // const key = c.req.query('key') || legacyKey
  const key = req.query('key')
  let secret: any = undefined
  if (key) {
    const item = await get_vault_item(key)
    if (item) {
      secret = item.secret
    }
  }

  const payload = {
    method: req.method,
    url: `https://wapo-gateway${path}`,
    path,
    queries: req.queries(),
    // @ts-ignore
    headers: Object.fromEntries(req.raw.headers.entries()),
    body,
    secret: secret || undefined,
  }

  const started = Date.now()

  const result = await Wapo.run(code, {
    args: [JSON.stringify(payload)],
    env: {
      secret: JSON.stringify(secret || ''),
    },
  })

  const ended = Date.now()

  const scriptId = `ipfs/${cid}`
  const q ='INSERT INTO logs (script_id, request_id, level, message, created_at) VALUES (?, ?, ?, ?, ?)'
  const statements = [{
    q,
    params: [
      scriptId,
      requestId,
      'REPORT',
      `START Request: ${req.method} ${req.raw.url.replace('https://wapo-gateway', '')}`,
      ended,
    ],
  }]
  result.logs.forEach((log) => {
    statements.push({
      q,
      params: [
        scriptId,
        requestId,
        LogLevel[log.level],
        log.message,
        ended,
      ],
    })
  })
  if (result.isError) {
    statements.push({
      q,
      params: [
        scriptId,
        requestId,
        'ERROR',
        result.error,
        ended,
      ],
    })
  }
  statements.push({
    q,
    params: [
      scriptId,
      requestId,
      'REPORT',
      `END Request: Duration: ${ended - started}ms`,
      ended,
    ],
  })
  await sqld_execute(statements)

  return result
}

app.all('/ipfs/:cid{[a-zA-Z0-9\/]+}', async (c) => {
  try {
    const cid = c.req.param('cid')
    const path = c.req.path.replace(`/ipfs/${cid}`, '/')

    const result = await run_guest_script(cid, path, c.req, c.get('requestId'))
    if (result.isOk) {
      const payload = JSON.parse(result.value as string)
      return c.body(payload.body ?? '', payload.status ?? 200, payload.headers ?? {})
    } else {
      return c.body(`Server Error\nRequest ID: ${c.get('requestId')}`, 500)
    }
  } catch (err) {
    console.log(err)
  }
  return c.body('Bad request', 400)
})


app.post('/vaults', zValidator('json', secretSchema), async (c) => {
  const secret = c.req.valid('json')
  const { token, key } = await save_secret(secret)
  return c.json({ token, key, succeed: true })
})

app.get('/vaults/:key/:token', zValidator('param', secretAccessTokenSchema), async (c) => {
  const { key, token } = c.req.valid('param')
  const item = await get_vault_item_by_access_token(key, token)
  if (!item) {
    return c.json({ token, key, succeed: false }, 404)
  }
  return c.json({ data: item.data, inherit: item.inherit, succeed: true })
})

const logQuerySchema = z.object({
  requestId: z.string().optional(),
  page: z.coerce.number().max(100).min(1).optional().default(1),
  limit: z.coerce.number().max(100).min(1).optional().default(100),
  format: z.enum(['json', 'text']).optional().default('text'),
})

interface RawLogRecord {
  id: number
  script_id: string
  request_id: string
  level: number
  message: string
  created_at: number
}

app.get('/logs/all/:scriptId{[a-zA-Z0-9\/]+}', zValidator('query', logQuerySchema), async (c) => {
  const scriptId = c.req.param('scriptId')
  const { requestId, page, limit, format } = c.req.valid('query')
  const offset = (page - 1) * limit
  console.log(scriptId, requestId, page, limit, offset)
  let cols = [], rows = []
  if (requestId) {
    const result = await sqld_execute([{
      q: 'SELECT * FROM logs WHERE script_id = ? AND request_id = ? ORDER BY created_at DESC, id DESC LIMIT ?, ?',
      params: [scriptId, requestId, offset, limit]
    }])
    cols = result[0].results.columns
    rows = result[0].results.rows
  } else {
    const result = await sqld_execute([{
      q: 'SELECT * FROM logs WHERE script_id = ? ORDER BY created_at DESC, id DESC LIMIT ?, ?',
      params: [scriptId, offset, limit]
    }])
    cols = result[0].results.columns
    rows = result[0].results.rows
  }
  const records = rows.map((row) => {
    const raw = R.zipObj(cols, row) as unknown as RawLogRecord
    const obj = R.omit(['id'], raw) as Record<string, any>
    obj.created_at = new Date(raw.created_at).toISOString()
    return obj
  })
  if (format === 'json') {
    return c.json(records)
  }
  return c.text(records.map((r) => `${r.created_at} [${r.request_id}] [${r.level}] ${r.message}`).join('\n') + '\n')
})

//
//
//

app.get('/migrate', async (c) => {
  const resp1 = await fetch(process.env.WAPOJS_PUBLIC_SQLD_API!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      statements: [
        `
CREATE TABLE IF NOT EXISTS vaults (
  key TEXT NOT NULL,
  token TEXT NOT NULL,
  cid TEXT NOT NULL,
  data TEXT NOT NULL,
  inherit TEXT,
  parents TEXT,
  PRIMARY KEY (key, cid)
);
        `,
        `
CREATE TABLE IF NOT EXISTS codes (
  cid TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cid)
);
        `,
        `
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
        `,
      ]
    })
  })
  const data1 = await resp1.json()
  console.log(JSON.stringify(data1))
  return c.text('pong')
})


// function main() {
//   const handler = handle(app)
//   handler()
// }

// main()

if (!process.env.WAPOJS_PUBLIC_CERT || !process.env.WAPOJS_PUBLIC_KEY) {
  throw new Error('Missing WAPOJS_PUBLIC_CERT or WAPOJS_PUBLIC_KEY')
}

const certificateChain = Buffer.from(process.env.WAPOJS_PUBLIC_CERT, 'base64').toString('utf-8')
const privateKey = Buffer.from(process.env.WAPOJS_PUBLIC_KEY, 'base64').toString('utf-8')
const serverName = process.env.WAPOJS_PUBLIC_SERVER_NAME || 'localhost'

export default handle(app, { certificateChain, privateKey, serverName })
