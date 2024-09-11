import { Hono } from 'hono/tiny'
// import { z } from 'zod'
// import { zValidator } from '@hono/zod-validator'

import { handle } from '@phala/wapo-env/guest'

const app = new Hono()

app.get('/', async (c) => {
  c.header('X-Request-Id', '123')
  // try {
  //   const decoded = JSON.parse(process.env.secret || '')
  //   console.log('Say Hi')
  //   return c.json({ hello: decoded.foo })
  // } catch (err) {
  // }
  return c.json({ hello: 'world' })
})

// const formBodySchema = z.object({
//   params1: z.string(),
//   params2: z.string(),
// })

// app.post('/', zValidator('form', formBodySchema), async (c) => {
//   const data = c.req.valid('form')
//   console.log(data)
//   return c.text('ok')
// })

export default handle({ ...app })
