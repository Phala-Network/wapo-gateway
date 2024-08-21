import * as R from 'ramda'

//
// Check IPFS gateways: https://ipfs.github.io/public-gateway-checker/
//

export async function fetch_from_gateway(gateway: string, cid: string): Promise<string> {
  const resp = await fetch(`${gateway}/ipfs/${cid}`)
  const raw = await resp.text()
  return raw as string
}

export const fetch_cloudflare = R.partial(fetch_from_gateway, [
  'https://cloudflare-ipfs.com',
])

export const fetch_hardbin = R.partial(fetch_from_gateway, [
  'https://hardbin.com',
])

export const fetch_dweb = R.partial(fetch_from_gateway, [
  'https://dweb.link',
])

export const fetch_ipfs = R.partial(fetch_from_gateway, [
  'https://ipfs.io',
])

export const fetch_4everland = R.partial(fetch_from_gateway, [
  'https://ipfs.4everland.io',
])

export const fetch_pinata = R.partial(fetch_from_gateway, [
  'https://gateway.pinata.cloud',
])

export const fetch_runfission = R.partial(fetch_from_gateway, [
  'https://runfission.com',
])

export const fetch_trustless = R.partial(fetch_from_gateway, [
  'https://trustless-gateway.link',
])

export const fetch_nftstorage = R.partial(fetch_from_gateway, [
  'https://nftstorage.link',
])
