import { dirname } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { createGunzip } from 'zlib'

export const resolveUrl = (input: string, base: string) => {
  return input
    ? base.replace(/\/+$/, '') + '/' + input.replace(/^\/+/, '')
    : base
}

export const createDirectory = (path: string) => {
  const dir = dirname(path)
  return mkdir(dir, {
    recursive: true,
  })
}

export const emptyDirectory = (path: string) => {
  return rm(path, {
    recursive: true,
    force: true,
  })
}

export const ungzip = (path: string) =>
  new Promise(resolve => {
    const src = createReadStream(path)
    const destination = createWriteStream(path.replace('.gz', ''))

    src
      .pipe(createGunzip())
      .pipe(destination)
    destination.on('close', resolve)
  })

export const filetimeToUnix = (high: number, low: number) => {
  // Diff between Windows epoch 1601-01-01 00:00:00 & Unix epoch 1970-01-01 00:00:00
  const diff = BigInt(11644473600000)
  const filetime = BigInt(high * Math.pow(2, 32) - low) / BigInt(10000)
  const timestamp = filetime - diff
  return Number(timestamp)
}

export const clearStdoutLastLine = () => {
  process.stdout.moveCursor(0, -1)
  process.stdout.clearLine(1)
}
