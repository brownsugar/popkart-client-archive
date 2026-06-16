import { consola } from 'consola'
import { setOutput, setFailed } from '@actions/core'
import { connectSocket, connectTCGServer } from './lib/kart-patch'
import { getOptionalEnv } from './lib/env'
import { getElapsedSeconds } from './lib/utils'
import packageJson from '../package.json'
import server from '../server.json'
import meta from '../meta.json'
import type { KartPatchServerInfo } from './core/types'

const getPatchInfo = async (): Promise<KartPatchServerInfo> => {
  const tcgServerEndpoint = getOptionalEnv('PATCH_SERVER_ENDPOINT')

  if (tcgServerEndpoint) {
    consola.info('Connecting to TCG server...')
    return await connectTCGServer(tcgServerEndpoint)
  }

  consola.info('Connecting to patch socket...')
  return await connectSocket(server.host, server.port)
}

const run = async () => {
  const t0 = performance.now()
  let failed = false

  try {
    consola.box(`PopKart Client Archiver v${packageJson.version}`)

    consola.start('Start loading patch info...')
    const patchInfo = await getPatchInfo()
    const { endpoint, id, version, mode } = patchInfo
    consola.success('Patch info loaded.\n', patchInfo)

    consola.start('Start checking version...')
    if (meta.version && meta.version >= version) {
      consola.info(`Client is up-to-date, nothing to do. Current version: ${meta.version}.`)
      return
    }

    consola.success(`New version found, previous version: ${meta.version || 'N/A'}, latest version: ${version}.`)
    consola.info(`Run \`pnpm start-main --endpoint=${endpoint} --id=${id} --version=${version} --mode=${mode}\` to start the archiving process.`)

    setOutput('endpoint', endpoint)
    setOutput('id', id)
    setOutput('version', version)
    setOutput('mode', mode)
  } catch (e) {
    failed = true
    consola.error(`Run failed after ${getElapsedSeconds(t0)}s.`)
    setFailed(e instanceof Error ? e : String(e))
  } finally {
    if (!failed)
      consola.success(`Run completed in ${getElapsedSeconds(t0)}s.`)
  }
}

run()
