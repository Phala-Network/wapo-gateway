import * as R from 'ramda'
import { z } from 'zod'

import { sqld_execute } from '../sqld'

export const secretSchema = z.object({
  cid: z.string(),
  data: z.record(z.any()),
  inherit: z.string().optional(),
})

export const secretAccessTokenSchema = z.object({
  key: z.string(),
  token: z.string(),
})

export const vaultItemSchema = secretSchema.merge(secretAccessTokenSchema).extend({
  parents: z.record(z.any()).optional(),
  secret: z.record(z.any()),
})


export type Secret = z.infer<typeof secretSchema>

export type SecretAccessToken = z.infer<typeof secretAccessTokenSchema>

export type VaultItem = z.infer<typeof vaultItemSchema>

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//
// Functions
//
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

function sha256_hex(data: string) {
  return Buffer.from(Wapo.nonCryptographicHash('wyhash64', data)).toString('hex')
}

function inherit_vault_item(parents: Record<string, any>, data: Record<string, any>) {
  return R.mergeDeepWith(
    (l, r) => Array.isArray(l) ? R.concat(l, r) : r,
    parents,
    data
  )
}

export async function get_vault_item(key: string): Promise<VaultItem | null> {
  const result = await sqld_execute([
    {
      q: 'SELECT * FROM vaults WHERE key = ? LIMIT 1',
      params: [key],
    }
  ])
  if (result.length === 0) {
    return null
  }
  const col = result[0].results.columns
  const row = result[0].results.rows[0]
  const obj = R.zipObj(col, row)
  obj.data = obj.secret = JSON.parse(obj.data)
  if (obj.parents) {
    obj.parents = JSON.parse(obj.parents)
    obj.secret = inherit_vault_item(obj.parents, obj.secret)
  }
  return obj as VaultItem
}

export async function get_vault_item_by_access_token(key: string, token: string): Promise<VaultItem | null> {
  const item = await get_vault_item(key)
  if (!item) {
    return null
  }
  if (item.token !== token) {
    return null
  }
  return item
}

export async function save_secret(secret: Secret) {
  const { cid, data, inherit } = secretSchema.parse(secret)
  const token = sha256_hex(`${cid}:${Math.random()}:${Date.now()}`)
  const key = sha256_hex(`${cid}:${JSON.stringify({ token, cid, data })}`)
  if (inherit) {
    const item = await get_vault_item(inherit)
    if (item) {
      const parents = inherit_vault_item(item.parents ?? {}, item.data)
      await sqld_execute([
        {
          q: 'INSERT INTO vaults (key, token, cid, data, inherit, parents) VALUES (?, ?, ?, ?, ?, ?)',
          params: [
            key,
            token,
            cid,
            JSON.stringify(data),
            inherit,
            JSON.stringify(parents),
          ],
        }
      ])
      return { token, key }
    }
  }
  await sqld_execute([
    {
      q: 'INSERT INTO vaults (key, token, cid, data) VALUES (?, ?, ?, ?)',
      params: [
        key,
        token,
        cid,
        JSON.stringify(data),
      ],
    }
  ])
  return { token, key }
}

