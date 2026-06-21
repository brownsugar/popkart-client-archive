import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { consola } from 'consola'
import { request, stream } from 'undici'
import { extract } from 'zip-lib'
import { move } from 'fs-extra'
import { createDirectory, clearStdoutLastLine, resolveUrl, removeDirectory, ungzip, concurrentMap, withRetry } from '../lib/utils'
import { resolveClientFullTempDir, resolveClientTempDir } from '../lib/paths'
import type { ClientFilePair, KartPatchServerInfo } from './types'

const DOWNLOAD_RETRY_COUNT = 5
const DOWNLOAD_CONCURRENCY = 10
const EXTRACT_CONCURRENCY = 20
const UPDATE_CONCURRENCY = 20
const FULL_CLIENT_RELEASE_API_URL = 'https://api.github.com/repos/brownsugar/popkart-client-archive/releases/latest'

interface GithubReleaseAsset {
  name?: string
  browser_download_url?: string
}

interface GithubReleaseResponse {
  assets?: GithubReleaseAsset[]
}

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
  consola.start('Start fetching latest full client release assets...')
  const response = await request(FULL_CLIENT_RELEASE_API_URL, {
    method: 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'popkart-client-archiver',
    },
  })

  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(`Failed to fetch latest release metadata with status ${response.statusCode}`)

  const release = await response.body.json() as GithubReleaseResponse
  const archives = (release.assets ?? [])
    .filter(asset => asset.name?.startsWith('PopKart_Client') && asset.name.toLowerCase().endsWith('.zip'))
    .map(asset => ({
      name: asset.name as string,
      url: asset.browser_download_url,
    }))
    .filter(asset => !!asset.url)

  if (archives.length === 0)
    throw new Error('No matching full client archives found in latest release assets.')

  consola.success(`Found ${archives.length} full client archive(s).`)

  const tempArchiveDir = resolveClientFullTempDir()
  await removeDirectory(tempArchiveDir)

  for (let index = 0; index < archives.length; index++) {
    const archive = archives[index]
    const archivePath = resolve(tempArchiveDir, archive.name)

    consola.start(`Start downloading full client archive ${index + 1} of ${archives.length}: ${archive.name}...`)
    await createDirectory(archivePath)
    await downloadFile(archive.url as string, archivePath)
    consola.success(`Downloaded ${archive.name}.`)

    consola.start(`Start extracting full client archive ${index + 1} of ${archives.length}: ${archive.name}...`)
    await extract(archivePath, clientDir)
    consola.success(`Extracted ${archive.name}.`)
  }
  await removeDirectory(tempArchiveDir)

  consola.success('All full client archives downloaded and extracted.')
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

  const tempDir = resolveClientTempDir()

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
