async function run_script(code) {
  const result = await new Promise((resolve) => 
    Wapo.isolateEval({
      scripts: [code],
      args: [],
      env: {},
      timeLimit: 60_000,
      gasLimit: 100_000,
      memoryLimit: 1024 * 1024 * 10,
      polyfills: ['browser'],
    }, resolve)
  )
  return result
}

var module = module || { exports: {} };
module.exports = async function main() {
  console.log('call in host script')

  try {
    const ret_rejected = await run_script(`
      var module = module || { exports: {} };
      module.exports = async function main() {
        globalThis.scriptLogs = [
          "test 1",
          "test 2",
          "test 3",
        ]
        await new Promise((_, reject) => {
          reject(new Error('test error'))
        })
      }
    `)
    console.log(ret_rejected[0])
    console.log(ret_rejected[1])
    console.log(ret_rejected[2])

    // const test2 = await run_script(`
    //   var module = module || { exports: {} };
    //   module.exports = async function main() {
    //     throw new Error('test2')
    //   }
    // `)
    // console.log(test2[0])
    // console.log(test2[1])
    // console.log(test2[2])

    // const ret = await run_script(`
    //   var module = module || { exports: {} };
    //   module.exports = async function main() {
    //     console.log('call in guest script')
    //     await new Promise((resolve) => setTimeout(resolve, 1000))
    //     console.log('after timeout')
    //     return '123'
    //   }
    // `)
    // console.log(ret) // should be '123'
  } catch (e) {
    console.log(e)
  }
  console.log('Finished.')
}
