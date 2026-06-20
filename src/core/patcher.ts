import { resolve } from 'node:path'
import { consola } from 'consola'
import { loadKartNfo2, loadTcgTxf } from '../lib/kart-manifest'
import { KartLocalFile, TcgLocalFile, KartPatchFile, TcgPatchFile } from '../lib/kart-files'
import { resolveUrl } from '../lib/utils'
import type { KartPatchServerInfo, PatchDiff, ClientFilePair } from './types'

export const getFileHash = (localFile: KartLocalFile | TcgLocalFile, remoteFile: KartPatchFile | TcgPatchFile) => {
  const local = localFile.isTcgMode() ? localFile.md5 : localFile.crc
  const remote = remoteFile.isTcgMode() ? remoteFile.md5 : remoteFile.crc
  return { local, remote }
}

export const getPatchDiff = async (patchInfo: KartPatchServerInfo): Promise<PatchDiff> => {
  consola.start('Start loading client files...')
  let remoteBaseUrl: string
  let remoteFileList: KartPatchFile[] | TcgPatchFile[]

  if (patchInfo.mode === 'tcg') {
    remoteBaseUrl = patchInfo.endpoint
    remoteFileList = await loadTcgTxf(remoteBaseUrl)
  } else {
    remoteBaseUrl = resolveUrl(patchInfo.version.toString(), patchInfo.endpoint)
    remoteFileList = await loadKartNfo2(remoteBaseUrl)
  }

  const rootDir = process.cwd()
  const clientDir = resolve(rootDir, 'client')
  const tempDir = resolve(clientDir, 'temp')

  const clientFiles: ClientFilePair[] = remoteFileList.map((remoteFile: KartPatchFile | TcgPatchFile) => ({
    localFile: patchInfo.mode === 'tcg'
      ? new TcgLocalFile(clientDir, remoteFile.path, tempDir)
      : new KartLocalFile(clientDir, remoteFile.path, tempDir),
    remoteFile,
  }))
  consola.success(`Client files loaded. (${clientFiles.length} files)`)

  consola.start('Start filtering client files...')
  const patchFiles: ClientFilePair[] = []

  for (const { localFile, remoteFile } of clientFiles) {
    const succeed = await localFile.loadMeta()
    const hash = getFileHash(localFile, remoteFile)
    if (succeed && hash.local === hash.remote) continue
    patchFiles.push({ localFile, remoteFile })
  }
  consola.success(`Client files filtered. (${patchFiles.length} files to download)`)

  return {
    clientFiles,
    patchFiles,
    remoteBaseUrl,
  }
}
