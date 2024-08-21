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
module.exports = function main() {
  console.log('call in host script')

  const output = run_script(`
    var module = module || { exports: {} };
    module.exports = function main() {
      console.log('call in guest script')
    }
  `)
  console.log(output)

  run_script(`
    console.log('pure script')
  `)

  run_script(`
    var module = module || { exports: {} };
  `)

  run_script(`
    var module = module || {};
  `)

  console.log('Finished.')
}
