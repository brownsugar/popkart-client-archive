import { dirname } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import crypto from 'node:crypto'

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

export const removeDirectory = (path: string) => {
  return rm(path, {
    recursive: true,
    force: true,
  })
}

export const ungzip = (path: string) =>
  new Promise<void>(resolve => {
    const src = createReadStream(path)
    const destination = createWriteStream(path.replace('.gz', ''))

    src
      .pipe(createGunzip())
      .pipe(destination)
    destination.on('close', resolve)
  })

export const generateMd5 = (path: string) => {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = createReadStream(path)
    stream.on('data', data => {
      hash.update(data)
    })
    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })
    stream.on('error', e => {
      reject(e)
    })
  })
}

export const filetimeToUnix = (high: number, low: number) => {
  // Diff between Windows epoch 1601-01-01 00:00:00 & Unix epoch 1970-01-01 00:00:00
  const diff = BigInt(11644473600000)
  const filetime = BigInt(high * Math.pow(2, 32) - low) / BigInt(10000)
  const timestamp = filetime - diff
  return Number(timestamp)
}

export const getArgs = () => {
  const argv = process.argv ?? []
  return argv
    .reduce((result, string) => {
      if (string.startsWith('--')) {
        const [key, ...value] = string.slice(2).split('=')
        result[key] = value.join('=')
      }
      return result
    }, {} as Record<string, string>)
}

export const clearStdoutLastLine = () => {
  if (process.stdout.isTTY) {
    process.stdout.moveCursor(0, -1)
    process.stdout.clearLine(1)
  }
}
