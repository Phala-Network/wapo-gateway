var module = module || { exports: {} };
module.exports = async function main() {
  await new Promise((_, reject) => {
    reject(new Error('test error'))
  })
}
