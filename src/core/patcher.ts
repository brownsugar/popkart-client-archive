import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'
import { consola } from 'consola'
import { loadKartNfo2, loadTcgTxf } from '../lib/kart-manifest'
import { KartLocalFile, TcgLocalFile, KartPatchFile, TcgPatchFile } from '../lib/kart-files'
import { resolveUrl } from '../lib/utils'
import type { KartPatchServerInfo, PatchDiff, ClientFilePair } from './types'
import meta from '../../meta.json'

export const removeRemovedClientFiles = async (removedFiles: string[]) => {
  if (removedFiles.length === 0)
    return

  consola.start(`Start removing ${removedFiles.length} obsolete local files...`)
  const clientDir = resolve(process.cwd(), 'client')

  for (const filePath of removedFiles)
    await rm(resolve(clientDir, filePath), { force: true })

  consola.success(`Removed ${removedFiles.length} obsolete local files.`)
}

const loadManifestByVersion = async (
  patchInfo: KartPatchServerInfo,
  version: number,
): Promise<{ remoteBaseUrl: string, remoteFileList: KartPatchFile[] | TcgPatchFile[] }> => {
  if (patchInfo.mode === 'tcg') {
    const targetId = version === patchInfo.version ? patchInfo.id : meta.id
    const remoteBaseUrl = patchInfo.endpoint.replace(/\/[A-Z]{15}/, `/${targetId}`)
    return {
      remoteBaseUrl,
      remoteFileList: await loadTcgTxf(remoteBaseUrl),
    }
  }

  const remoteBaseUrl = resolveUrl(version.toString(), patchInfo.endpoint)
  return {
    remoteBaseUrl,
    remoteFileList: await loadKartNfo2(remoteBaseUrl),
  }
}

export const getPatchDiff = async (patchInfo: KartPatchServerInfo): Promise<PatchDiff> => {
  consola.start('Start loading current and previous manifests...')
  const [currentManifest, previousManifest] = await Promise.all([
    loadManifestByVersion(patchInfo, patchInfo.version),
    loadManifestByVersion(patchInfo, meta.version),
  ])

  const remoteBaseUrl = currentManifest.remoteBaseUrl
  const remoteFileList = currentManifest.remoteFileList
  const previousRemoteFileList = previousManifest.remoteFileList

  const rootDir = process.cwd()
  const clientDir = resolve(rootDir, 'client')
  const tempDir = resolve(clientDir, 'temp')

  const clientFiles: ClientFilePair[] = remoteFileList.map((remoteFile: KartPatchFile | TcgPatchFile) => ({
    localFile: patchInfo.mode === 'tcg'
      ? new TcgLocalFile(clientDir, remoteFile.path, tempDir)
      : new KartLocalFile(clientDir, remoteFile.path, tempDir),
    remoteFile,
  }))
  consola.success(`Client files loaded. (${clientFiles.length} files in current manifest)`)

  consola.start('Start comparing manifests...')
  const previousManifestMap = new Map<string, KartPatchFile | TcgPatchFile>()
  for (const file of previousRemoteFileList)
    previousManifestMap.set(file.path, file)

  const currentManifestPathSet = new Set<string>(remoteFileList.map(file => file.path))

  const patchFiles: ClientFilePair[] = []
  const newFiles: string[] = []
  const changedFiles: string[] = []

  for (const { localFile, remoteFile } of clientFiles) {
    const previousRemoteFile = previousManifestMap.get(remoteFile.path)
    if (!previousRemoteFile) {
      newFiles.push(remoteFile.path)
      patchFiles.push({ localFile, remoteFile })
      continue
    }

    if (previousRemoteFile.getFileHash() !== remoteFile.getFileHash()) {
      changedFiles.push(remoteFile.path)
      patchFiles.push({ localFile, remoteFile })
    }
  }

  const removedFiles = previousRemoteFileList
    .filter(file => !currentManifestPathSet.has(file.path))
    .map(file => file.path)

  if (newFiles.length > 0)
    consola.info(`[Patcher] Found ${newFiles.length} new file(s)`)

  if (changedFiles.length > 0)
    consola.info(`[Patcher] Found ${changedFiles.length} changed file(s)`)

  if (removedFiles.length > 0)
    consola.info(`[Patcher] Found ${removedFiles.length} removed file(s)`)

  consola.success(`Manifest comparison finished. (${patchFiles.length} files to download)`)

  return {
    clientFiles,
    patchFiles,
    newFiles,
    changedFiles,
    removedFiles,
    remoteBaseUrl,
  }
}
