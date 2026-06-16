import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { consola } from 'consola'
import { clearStdoutLastLine, filetimeToUnix, concurrentMap } from '../lib/utils'
import { getFileHash } from './patcher'
import type { ClientFilePair } from './types'

const VALIDATION_CONCURRENCY = 20

export const validateClientFiles = async (clientFiles: ClientFilePair[]): Promise<ClientFilePair[]> => {
  consola.start('Start validating client files...')
  let completed = 0

  const invalidFiles: ClientFilePair[] = []

  await concurrentMap(clientFiles, async filePair => {
    const { localFile, remoteFile } = filePair
    completed++
    consola.log(`Validating file ${completed} of ${clientFiles.length}: ${remoteFile.path}...`)

    if (!existsSync(localFile.path)) {
      invalidFiles.push(filePair)
      clearStdoutLastLine()
      return
    }

    // Check file hash
    await localFile.loadMeta()
    const hash = getFileHash(localFile, remoteFile)
    if (hash.local !== hash.patch) {
      invalidFiles.push(filePair)
      await rm(localFile.path, { force: true }) // Delete corrupted file
      clearStdoutLastLine()
      return
    }

    // Restore file modification time
    if (!remoteFile.isTcgMode()) {
      const { utimes } = await import('utimes')
      await utimes(localFile.path, {
        mtime: filetimeToUnix(remoteFile.dwHighDateTime, remoteFile.dwLowDateTime),
      })
    }

    clearStdoutLastLine()
  }, VALIDATION_CONCURRENCY)

  if (invalidFiles.length > 0)
    consola.warn(`Validation failed for ${invalidFiles.length} files.`)
  else
    consola.success('Client files validated successfully.')

  return invalidFiles
}
