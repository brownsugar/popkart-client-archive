import { consola } from 'consola'
import { setOutput, setFailed } from '@actions/core'
import KartPatchSocket from './lib/kart-patch-socket'
import packageJson from '../package.json'
import server from '../server.json'
import meta from '../meta.json'

const run = async () => {
  const t0 = performance.now()
  const getPerformanceResult = () => {
    const t1 = performance.now()
    return ((t1 - t0) / 1000).toFixed(2)
  }
  try {
    consola.box(`PopKart Client archiver v${packageJson.version}`)

    consola.start('Loading patch info...')
    const socket = new KartPatchSocket()
    const patchInfo = await socket.connect(server.host, server.port)
    consola.success('Patch info loaded.\n', patchInfo)

    consola.start('Checking version...')
    if (meta.version && meta.version >= patchInfo.version) {
      consola.info(`Client is up-to-date, nothing to do. Current version: ${meta.version}.`)
      return
    }
    consola.success(`New version found, previous version: ${meta.version}, latest version: ${patchInfo.version}.`)
    setOutput('endpoint', patchInfo.endpoint)
    setOutput('id', patchInfo.id)
    setOutput('version', patchInfo.version)
  } catch (e) {
    consola.log(`Done with an error occurred in ${getPerformanceResult()}s.`)
    setFailed(e)
  } finally {
    consola.success(`Done in ${getPerformanceResult()}s.`)
  }
}
run()
