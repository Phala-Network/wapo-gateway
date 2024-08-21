import * as R from 'ramda'

export type Value = null | string | number | bigint | ArrayBuffer;
export type InValue = Value | boolean | Uint8Array | Date;
export type InStatement = { q: string; params: undefined | Record<string, Value> | Array<Value> } | string;
export type InArgs = Array<InValue> | Record<string, InValue>;

export type OutError = {
  error: string
}

export type QueryResult = {
  results: {
    columns: Array<string>,
    rows: Array<Array<Value>>,
    rows_read: bigint,
    rows_written: bigint,
    query_duration_ms: bigint
  }
}

export async function sqld_execute(statements: InStatement[]): Promise<Array<QueryResult>> {
  const resp = await fetch(process.env.WAPOJS_PUBLIC_SQLD_API!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      statements,
    })
  })
  if (resp.status !== 200) {
    throw new Error(`Unexpected status code: ${resp.status}`)
  }
  const data = await resp.json()
  if (!R.is(Array, data)) {
    throw new Error(data.error)
  }
  return data as Array<QueryResult>
}

