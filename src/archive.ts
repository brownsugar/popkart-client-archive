import { writeFile } from 'node:fs/promises'
import { consola } from 'consola'
import { setOutput, setFailed } from '@actions/core'
import { getPatchDiff, removeRemovedClientFiles } from './core/patcher'
import { downloadFullClient, downloadPatchFiles } from './core/downloader'
import { validateClientFiles } from './core/validator'
import { archiveClientFiles } from './core/archiver'
import { buildFromArchives } from './core/cache'
import { formatSize, getArgs, getElapsedSeconds } from './lib/utils'
import { parseCliArgs } from './core/cli'
import { resolveClientDir, resolveMetaPath } from './lib/paths'
import packageJson from '../package.json'
import meta from '../meta.json'

const run = async () => {
  const t0 = performance.now()
  let failed = false
  const isTestRun = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'

  try {
    consola.box(`PopKart Client Archiver v${packageJson.version}`)

    consola.start('Start retrieving patch info...')
    const patchInfo = parseCliArgs(getArgs())
    consola.success('Patch info retrieved.\n', patchInfo)

    // 1. Get diff
    const { clientFiles, patchFiles, removedFiles, remoteBaseUrl, addedCount, updatedCount, removedCount, sizeDelta } = await getPatchDiff(patchInfo)

    setOutput('addedCount', addedCount)
    setOutput('updatedCount', updatedCount)
    setOutput('removedCount', removedCount)
    setOutput('sizeChanged', formatSize(sizeDelta))

    // 2. Download missing/changed files
    const downloadNeeded = patchFiles.length > 0
    if (!downloadNeeded)
      consola.info('Nothing to download.')

    if (patchFiles.length === 0 && removedFiles.length === 0)
      setOutput('noClientCache', true)

    if (downloadNeeded)
      await downloadPatchFiles(patchFiles, remoteBaseUrl, patchInfo)

    await removeRemovedClientFiles(removedFiles)

    // 3. Validate files
    let invalidFiles = await validateClientFiles(clientFiles)
    if (invalidFiles.length === clientFiles.length) {
      consola.info('No valid local client files found. Downloading full client...')
      const clientDir = resolveClientDir()
      await downloadFullClient(clientDir)
      invalidFiles = await validateClientFiles(clientFiles)
    }

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

    // 5. Build full client cache dir
    consola.start('Start building cache dir from full client archives...')
    if (isTestRun)
      consola.info('Skip cache dir build in test run.')
    else {
      const cacheBuilt = await buildFromArchives()
      if (!cacheBuilt) {
        setOutput('noFullClientCache', true)
        consola.info('No full client archives found to cache.')
      } else
        consola.success('Cache dir prepared from full client archives.')
    }

    // 6. Update meta
    consola.start('Start updating meta file...')
    if (isTestRun)
      consola.info('Skip meta file update in test run.')
    else {
      meta.id = patchInfo.id
      meta.version = patchInfo.version
      meta.timestamp = Date.now()
      const metaPath = resolveMetaPath()
      await writeFile(metaPath, JSON.stringify(meta, null, 2), { flag: 'w' })
      consola.success('Meta file updated.')
    }
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
