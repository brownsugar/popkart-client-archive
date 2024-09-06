import { consola } from 'consola'
import { setOutput, setFailed } from '@actions/core'
import KartPatch from './lib/kart-patch'
import packageJson from '../package.json'
import server from '../server.json'
import meta from '../meta.json'
import type { KartPatchServerInfo } from './lib/kart-patch'

const run = async () => {
  const t0 = performance.now()
  const getPerformanceResult = () => {
    const t1 = performance.now()
    return ((t1 - t0) / 1000).toFixed(2)
  }
  try {
    consola.box(`PopKart Client archiver v${packageJson.version}`)

    consola.start('Loading patch info...')
    const tcgServerEndpoint = process.env.PATCH_SERVER_ENDPOINT
    const kartPatch = new KartPatch()

    let patchInfo: KartPatchServerInfo = null
    if (tcgServerEndpoint) {
      consola.info('Connecting to TCG server...')
      patchInfo = await kartPatch.connectTCGServer(tcgServerEndpoint)
    } else {
      consola.info('Connecting to patch socket...')
      patchInfo = await kartPatch.connectSocket(server.host, server.port)
    }
    consola.success('Patch info loaded.\n', patchInfo)

    consola.start('Checking version...')
    if (meta.version && meta.version >= patchInfo.version) {
      consola.info(`Client is up-to-date, nothing to do. Current version: ${meta.version}.`)
      return
    }
    consola.success(`New version found, previous version: ${meta.version}, latest version: ${patchInfo.version}.`)
    consola.info(`Run \`pnpm start-main --endpoint=${patchInfo.endpoint} --id=${patchInfo.id} --version=${patchInfo.version} --mode=${patchInfo.mode}\` to start the archiving process.`)
    setOutput('endpoint', patchInfo.endpoint)
    setOutput('id', patchInfo.id)
    setOutput('version', patchInfo.version)
    setOutput('mode', patchInfo.mode)
  } catch (e) {
    consola.log(`Done with an error occurred in ${getPerformanceResult()}s.`)
    setFailed(e)
  } finally {
    consola.success(`Done in ${getPerformanceResult()}s.`)
  }
}
run()
