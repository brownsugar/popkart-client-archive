import { readdir, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { consola } from 'consola'
import { setFailed } from '@actions/core'
import { extract } from 'zip-lib'
import { getElapsedSeconds, removeDirectory } from './lib/utils'
import { resolveClientDir } from './lib/paths'
import packageJson from '../package.json'

const run = async () => {
  const t0 = performance.now()

  try {
    consola.box(`PopKart Client Archiver v${packageJson.version}`)

    consola.start('Start restoring cache...')
    const cacheDir = resolve(process.cwd(), 'cache')
    const clientDir = resolveClientDir()

    let cacheEntries: string[]
    try {
      cacheEntries = await readdir(cacheDir)
    } catch {
      consola.info('No cache directory found.')
      return
    }

    const archives = cacheEntries
      .filter(name => /^PopKart_Client_\d+\.zip$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    if (archives.length === 0) {
      consola.info('No cached full client zips found.')
      await removeDirectory(cacheDir)
      return
    }
    consola.info(`Found ${archives.length} cached full client zip(s).`)

    await mkdir(clientDir, { recursive: true })

    for (let index = 0; index < archives.length; index++) {
      const archiveName = archives[index]
      const archivePath = resolve(cacheDir, archiveName)
      consola.start(`Start extracting ${archiveName} (${index + 1}/${archives.length})...`)
      await extract(archivePath, clientDir)
      consola.success(`Extracted ${archiveName}.`)
    }
    await removeDirectory(cacheDir)

    consola.success('Cached full client restored to client directory.')
  } catch (e) {
    setFailed(e instanceof Error ? e : String(e))
  } finally {
    consola.success(`Run completed in ${getElapsedSeconds(t0)}s.`)
  }
}

run()
