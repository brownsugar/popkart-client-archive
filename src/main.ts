import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { exec } from 'node:child_process'
import { consola } from 'consola'
import EasyDl from 'easydl'
import { move } from 'fs-extra'
import { path7za } from '7zip-bin'
import KartPatchSocket from './lib/kart-patch-socket'
import { KartNfo2, LocalFile } from './lib/kart-files'
import {
  emptyDirectory,
  createDirectory,
  resolveUrl,
  clearStdoutLastLine,
  ungzip,
  filetimeToUnix,
} from './lib/utils'
import packageJson from '../package.json'
import server from '../server.json'

const run = async () => {
  try {
    consola.box(`PopKart Client archiver v${packageJson.version}`)

    consola.start('Loading patch info...')
    const socket = new KartPatchSocket()
    const patchInfo = await socket.connect(server.host, server.port)
    consola.success('Patch info loaded.\n', patchInfo)

    consola.start('Loading client files...')
    const remoteBaseUrl = resolveUrl(patchInfo.version.toString(), patchInfo.endpoint)
    const nfo2 = new KartNfo2(remoteBaseUrl)
    consola.log('NFO2 URL:', nfo2.url)
    const rootDir = process.cwd()
    const baseDir = resolve(rootDir, 'client')
    const tempDir = resolve(baseDir, 'temp')
    const clientFiles = (await nfo2.load())
      .map(patchFile => ({
        localFile: new LocalFile(baseDir, patchFile.path, tempDir),
        patchFile,
      }))
    const clientFileCount = clientFiles.length
    consola.success(`Client files loaded. (${clientFileCount} files)`)

    consola.start('Downloading client files...')
    await emptyDirectory(tempDir)
    for (const _i in clientFiles) {
      const i = Number(_i)
      const { localFile, patchFile } = clientFiles[i]

      const log = (percentage = '0') =>
        consola.log(`Downloading file ${i + 1} of ${clientFileCount}: ${patchFile.path}...${percentage}%`)
      log()

      const localPath = localFile.getDownloadPath()
      await createDirectory(localPath)

      const downloader = new EasyDl(
        resolveUrl(localFile.getRawFilePath(), remoteBaseUrl),
        localPath,
        {
          connections: 8,
          maxRetry: 5,
        }
      )
        .on('progress', ({ total }) => {
          clearStdoutLastLine()
          log(total.percentage.toFixed(1))
        })
      await downloader.wait()
      clearStdoutLastLine()
    }
    consola.success(`Client files downloaded.`)

    consola.start('Extracing client files...')
    for (const _i in clientFiles) {
      const i = Number(_i)
      const { localFile, patchFile } = clientFiles[i]
      consola.log(`Extracing file ${i + 1} of ${clientFileCount}: ${patchFile.path}...`)

      const path = localFile.getDownloadPath()
      await ungzip(path)
      await rm(path)
      localFile.extracted = true
      await move(localFile.getDownloadPath(), localFile.getDestinationPath(), {
        overwrite: true,
      })
      clearStdoutLastLine()
    }
    await emptyDirectory(tempDir)
    consola.success('Client files extracted.')

    consola.start('Validating client files...')
    for (const _i in clientFiles) {
      const i = Number(_i)
      const { localFile, patchFile } = clientFiles[i]
      consola.log(`Validating file ${i + 1} of ${clientFileCount}: ${patchFile.path}...`)

      if (!existsSync(localFile.path))
        throw new Error('File not found: ' + localFile.filePath)

      // Check file CRC
      await localFile.loadMeta()
      if (localFile.crc !== patchFile.crc)
        throw new Error('File CRC mismatch: ' + localFile.filePath)

      // Restore file modification time
      const { utimes } = require('utimes')
      await utimes(localFile.path, {
        mtime: filetimeToUnix(patchFile.dwHighDateTime, patchFile.dwLowDateTime),
      })
      clearStdoutLastLine()
    }
    consola.success('Client files validated.')

    consola.start('Archiving client files...')
    const run = promisify(exec)
    const zipName = `PopKart_Client_P${patchInfo.version}.zip`
    const archivesPath = resolve(rootDir, 'archives')
    const destPath = resolve(archivesPath, zipName)
    const filesPath = resolve(baseDir, '*')
    await emptyDirectory(archivesPath)
    const { stdout, stderr } = await run(`${path7za} a -tzip -mx=5 -v2g ${destPath} ${filesPath}`)
    consola.log(stdout)
    if (stderr)
      throw new Error(stderr)
    consola.success('Client files archived.')
  } catch (e) {
    consola.fatal('An error occurred.', e)
  }
}
run()
