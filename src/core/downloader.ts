import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { consola } from 'consola'
import { stream } from 'undici'
import { extract } from 'zip-lib'
import { move } from 'fs-extra'
import { getRequiredEnv } from '../lib/env'
import { createDirectory, clearStdoutLastLine, resolveUrl, removeDirectory, ungzip, concurrentMap, withRetry } from '../lib/utils'
import type { ClientFilePair, KartPatchServerInfo } from './types'

const DOWNLOAD_RETRY_COUNT = 5
const DOWNLOAD_CONCURRENCY = 10
const EXTRACT_CONCURRENCY = 20
const UPDATE_CONCURRENCY = 20

const downloadFile = async (url: string, destPath: string): Promise<void> => {
  try {
    await stream(
      url,
      { method: 'GET' },
      response => {
        const statusCode = response?.statusCode ?? 200
        if (statusCode < 200 || statusCode >= 300)
          throw new Error(`Download failed with status ${statusCode} for URL: ${url}`)

        return createWriteStream(destPath)
      },
    )
  } catch (e) {
    await rm(destPath, { force: true })
    throw e
  }
}

export const downloadFullClient = async (clientDir: string): Promise<void> => {
  consola.info('No client cache found!')
  consola.start('Start downloading full client...')
  const clientArchiveUrl = getRequiredEnv('CLIENT_ARCHIVE_URL')

  const rootDir = process.cwd()
  const clientArchivePath = resolve(rootDir, 'PopKart_Client.zip')

  await downloadFile(clientArchiveUrl, clientArchivePath)
  consola.success('Full client downloaded.')

  consola.start('Start extracting full client...')
  await extract(clientArchivePath, clientDir)

  consola.success('Full client extracted.')
}

export const downloadPatchFiles = async (
  patchFiles: ClientFilePair[],
  remoteBaseUrl: string,
  patchInfo: KartPatchServerInfo,
): Promise<void> => {
  if (patchFiles.length === 0) {
    consola.info('Nothing to download.')
    return
  }

  const rootDir = process.cwd()
  const tempDir = resolve(rootDir, 'client', 'temp')

  consola.start('Start downloading client files...')
  await removeDirectory(tempDir)

  let completed = 0
  await concurrentMap(patchFiles, async ({ localFile, remoteFile }) => {
    const localPath = localFile.getDownloadPath()
    await createDirectory(localPath)

    await withRetry(async () => {
      await downloadFile(resolveUrl(localFile.getRawFilePath(), remoteBaseUrl), localPath)
    }, DOWNLOAD_RETRY_COUNT)

    completed++
    consola.log(`Downloading file ${completed} of ${patchFiles.length}: ${remoteFile.path}...`)
    clearStdoutLastLine()
  }, DOWNLOAD_CONCURRENCY)

  consola.success('Client files downloaded.')

  if (patchInfo.mode === 'kart') {
    consola.start('Start extracting client files...')
    completed = 0
    await concurrentMap(patchFiles, async ({ localFile, remoteFile }) => {
      completed++
      consola.log(`Extracting file ${completed} of ${patchFiles.length}: ${remoteFile.path}...`)
      const path = localFile.getDownloadPath()
      await ungzip(path)
      await rm(path)
      if (!localFile.isTcgMode()) localFile.extracted = true
      clearStdoutLastLine()
    }, EXTRACT_CONCURRENCY)

    consola.success('Client files extracted.')
  }

  consola.start('Start updating client files...')
  completed = 0
  await concurrentMap(patchFiles, async ({ localFile, remoteFile }) => {
    completed++
    consola.log(`Updating file ${completed} of ${patchFiles.length}: ${remoteFile.path}...`)
    await move(localFile.getDownloadPath(), localFile.getDestinationPath(), { overwrite: true })
    clearStdoutLastLine()
  }, UPDATE_CONCURRENCY)

  await removeDirectory(tempDir)
  consola.success('Client files updated.')
}
