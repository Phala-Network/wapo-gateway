import * as R from 'ramda'
import { sqld_execute } from '../sqld'

export async function get_code(cid: string): Promise<string | null> {
  const result = await sqld_execute([
    {
      q: 'SELECT * FROM codes WHERE cid = ? LIMIT 1',
      params: [cid],
    }
  ])
  if (result.length === 0 || result[0].results.rows.length === 0) {
    return null
  }
  const col = result[0].results.columns
  const row = result[0].results.rows[0]
  const obj = R.zipObj(col, row)
  return obj.code
}

export async function save_code(cid: string, code: string) {
  await sqld_execute([
    {
      q: 'INSERT INTO codes (cid, code) VALUES (?, ?)',
      params: [
        cid,
        code,
      ],
    }
  ])
}

export async function cached(cid: string, fn: (cid: string) => Promise<string>) {
  const code = await get_code(cid)
  if (code) {
    return code
  }
  const result = await fn(cid)
  await save_code(cid, result)
  return result
}
