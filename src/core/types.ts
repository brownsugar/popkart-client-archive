import { KartLocalFile, TcgLocalFile, KartPatchFile, TcgPatchFile } from '../lib/kart-files'
import type { KartPatchServerInfo } from '../lib/kart-patch'

export interface ClientFilePair {
  localFile: KartLocalFile | TcgLocalFile
  remoteFile: KartPatchFile | TcgPatchFile
}

export interface PatchDiff {
  clientFiles: ClientFilePair[]
  patchFiles: ClientFilePair[]
  newFiles: string[]
  changedFiles: string[]
  removedFiles: string[]
  addedCount: number
  updatedCount: number
  removedCount: number
  sizeDelta: number
  remoteBaseUrl: string
}

export type { KartPatchServerInfo }
