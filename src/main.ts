import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { consola } from 'consola'
import { setOutput, setFailed } from '@actions/core'
import { getPatchDiff } from './core/patcher'
import { downloadFullClient, downloadPatchFiles } from './core/downloader'
import { validateClientFiles } from './core/validator'
import { archiveClientFiles } from './core/archiver'
import { getArgs, getElapsedSeconds } from './lib/utils'
import { parseCliArgs } from './core/cli'
import packageJson from '../package.json'
import meta from '../meta.json'

const run = async () => {
  const t0 = performance.now()
  let failed = false

  try {
    consola.box(`PopKart Client Archiver v${packageJson.version}`)

    consola.start('Start retrieving patch info...')
    const patchInfo = parseCliArgs(getArgs())
    consola.success('Patch info retrieved.\n', patchInfo)

    let downloadedFullClient = false
    while (true) {
      // 1. Get diff
      const { clientFiles, patchFiles, remoteBaseUrl } = await getPatchDiff(patchInfo)

      // 2. Download missing/changed files
      let downloadNeeded = true
      if (patchFiles.length === clientFiles.length) {
        consola.info('No client cache found!')

        if (downloadedFullClient)
          throw new Error('Patch diff still requires full download after full client refresh.')

        const clientDir = resolve(process.cwd(), 'client')
        await downloadFullClient(clientDir)
        downloadedFullClient = true
        consola.success('Full client downloaded and extracted. Recomputing patch diff...')
        continue
      } else if (patchFiles.length === 0) {
        consola.info('Nothing to download.')
        downloadNeeded = false
        setOutput('noClientCache', true)
      }

      if (downloadNeeded)
        await downloadPatchFiles(patchFiles, remoteBaseUrl, patchInfo)

      // 3. Validate files
      let invalidFiles = await validateClientFiles(clientFiles)
      if (invalidFiles.length > 0) {
        consola.info(`Attempting to re-download ${invalidFiles.length} corrupted files...`)
        await downloadPatchFiles(invalidFiles, remoteBaseUrl, patchInfo)
        invalidFiles = await validateClientFiles(invalidFiles)
        if (invalidFiles.length > 0)
          throw new Error(`Validation failed for ${invalidFiles.length} files after retrying.`)
      }

      // 4. Archive files
      if (downloadNeeded)
        await archiveClientFiles(clientFiles, patchFiles, patchInfo)

      break
    }

    // 5. Update meta
    consola.start('Start updating meta file...')
    meta.id = patchInfo.id
    meta.version = patchInfo.version
    meta.timestamp = Date.now()
    const metaPath = resolve(process.cwd(), 'meta.json')
    await writeFile(metaPath, JSON.stringify(meta, null, 2), { flag: 'w' })
    consola.success('Meta file updated.')
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
