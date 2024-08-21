import { Hono, HonoRequest } from 'hono'
import { logger } from 'hono/logger'
import { timing } from 'hono/timing'
import { zValidator } from '@hono/zod-validator'

import { handle } from '@phala/wapo-env/host'

import { fetch_pinata } from './code_storage/ipfs'
import { cached } from './code_storage/cache_adapter'
import { secretSchema, secretAccessTokenSchema, get_vault_item, get_vault_item_by_access_token, save_secret } from './vault/sqld_adapter'

const app = new Hono()

app.use('*', logger())
app.use('*', timing())

async function run_guest_script(cid: string, path: string, req: HonoRequest) {
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

  // const path = c.req.path.replace(`/ipfs/${cid}`, '/')
  // console.log(c.req.path, cid, path)
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

  try {
    const result = await new Promise((resolve) => 
      Wapo.isolateEval({
        scripts: [code],
        args: [JSON.stringify(payload)],
        env: {
          secret: JSON.stringify(secret || ''),
        },
        timeLimit: 60_000,
        gasLimit: 200_000,
        memoryLimit: 1024 * 1024 * 20,
        // polyfills: ['browser'],
        polyfills: ['nodejs'],
      }, resolve)
    )
    return result
  } catch (err) {
    console.log('error')
    console.log(err)
  }
}

app.all('/ipfs/:cid{[a-zA-Z0-9\/]+}', async (c) => {
  try {
    const cid = c.req.param('cid')
    const path = c.req.path.replace(`/ipfs/${cid}`, '/')

    const result = await run_guest_script(cid, path, c.req)
    if (result) {
      const payload = JSON.parse(result as string)
      return c.body(payload.body ?? '', payload.status ?? 200, payload.headers ?? {})
    }
  } catch (err) {
    console.log('error')
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
)
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
