/**
 * KartFiles
 * Base on 1https://github.com/brownsugar/kart-patcher/blob/main/src-electron/lib/kart-files.ts
 */
import { open } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { Buffer } from 'node:buffer'
import { generateMd5, resolveUrl } from './utils'

class KartCrc {
  // eslint-disable-next-line no-useless-constructor
  constructor(
    readonly path: string,
  ) {}

  async generate() {
    const file = await open(this.path, 'r')
    const stat = await file.stat()
    let filesize = stat.size
    let result = 0

    if (filesize) {
      while (true) {
        let bytesToRead
        if (filesize >= 0x10000)
          bytesToRead = 0x10000
        else
          bytesToRead = filesize

        const buffer = Buffer.alloc(bytesToRead)
        const { bytesRead } = await file.read(buffer, 0, bytesToRead)
        if (bytesRead !== bytesToRead)
          throw new Error('[KartCrc] Failed to calculate file CRC.')

        result = this.calculateChunk(result, buffer, bytesRead)
        filesize -= bytesRead
        if (!filesize)
          break
      }
    }

    file.close()
    return result
  }

  private calculateChunk(prevResult: number, buffer: Buffer, bufferLength: number) {
    const v3 = buffer
    let v4 = prevResult & 0xFFFF // convert int to int16
    let v5 = prevResult >>> 16

    if (!buffer)
      return 1

    let index = 0
    for (let i = bufferLength; i; v5 %= 0xFFF1) {
      let v8 = i
      if (i >= 0x15B0)
        v8 = 0x15B0

      i -= v8
      if (v8 >= 16) {
        let v9 = v8 >>> 4
        v8 += -16 * (v8 >>> 4)
        while (v9) {
          const v10 = v3[index + 0] + v4
          const v11 = v10 + v5
          const v12 = v3[index + 1] + v10
          const v13 = v12 + v11
          const v14 = v3[index + 2] + v12
          const v15 = v14 + v13
          const v16 = v3[index + 3] + v14
          const v17 = v16 + v15
          const v18 = v3[index + 4] + v16
          const v19 = v18 + v17
          const v20 = v3[index + 5] + v18
          const v21 = v20 + v19
          const v22 = v3[index + 6] + v20
          const v23 = v22 + v21
          const v24 = v3[index + 7] + v22
          const v25 = v24 + v23
          const v26 = v3[index + 8] + v24
          const v27 = v26 + v25
          const v28 = v3[index + 9] + v26
          const v29 = v28 + v27
          const v30 = v3[index + 10] + v28
          const v31 = v30 + v29
          const v32 = v3[index + 11] + v30
          const v33 = v32 + v31
          const v34 = v3[index + 12] + v32
          const v35 = v34 + v33
          const v36 = v3[index + 13] + v34
          const v37 = v36 + v35
          const v38 = v3[index + 14] + v36
          const v39 = v38 + v37
          v4 = v3[index + 15] + v38
          v5 = v4 + v39
          index += 16
          --v9
        }
      }

      for (; v8 > 0; --v8) {
        v4 += v3[index++]
        v5 += v4
      }

      v4 %= 0xFFF1
    }

    return v4 | (v5 << 16)
  }
}

class PatchFile {
  isTcgMode(): this is TcgPatchFile {
    return typeof this['md5'] !== 'undefined'
  }
}

export class KartPatchFile extends PatchFile {
  constructor(
    readonly path: string,
    readonly unknownValue: string,
    readonly crc: number,
    readonly size: number,
    readonly sizeGzipped: number,
    readonly dwHighDateTime: number,
    readonly dwLowDateTime: number,
    readonly delta1TargetCrc: number,
    readonly delta1Size: number,
    readonly delta2TargetCrc: number,
    readonly delta2Size: number,
    readonly alwaysZero: 0,
  ) {
    super()
  }
}

export class TcgPatchFile extends PatchFile {
  constructor(
    readonly path: string,
    readonly path2: string,
    readonly md5: string,
    readonly size: number,
  ) {
    super()
  }
}

class LocalFile {
  path: string
  basename: string
  size = 0

  constructor(
    readonly basePath: string,
    readonly filePath: string,
    readonly tempDir: string,
  ) {
    this.path = resolve(basePath, filePath)
    this.basename = basename(filePath)
  }

  isTcgMode(): this is TcgLocalFile {
    return typeof this['md5'] !== 'undefined'
  }

  getDestinationPath() {
    return resolve(this.basePath, this.getRawFilePath())
  }

  getDownloadPath() {
    return resolve(this.basePath, this.tempDir, this.getRawFilePath())
  }

  getRawFilePath() {
    return this.filePath + this.getRawFileExt()
  }

  getRawFileExt() {
    return ''
  }
}

export class KartLocalFile extends LocalFile {
  mtimeMs = 0
  crc = 0

  target: 'full' | 'delta1' | 'delta2' = 'full'
  extracted = false

  async loadMeta() {
    if (!existsSync(this.path))
      return false

    const stat = statSync(this.path)
    const crc = new KartCrc(this.path)
    this.size = stat.size
    this.mtimeMs = stat.mtimeMs
    this.crc = await crc.generate()
    return true
  }

  getRawFileExt() {
    return this.target === 'full'
      ? this.extracted ? '' : '.gz'
      : `.${this.target}`
  }
}

export class TcgLocalFile extends LocalFile {
  md5 = ''

  async loadMeta() {
    if (!existsSync(this.path))
      return false

    const stat = statSync(this.path)
    this.size = stat.size
    this.md5 = await generateMd5(this.path)
    return true
  }
}

export class KartNfo2 {
  url: string

  constructor(endpoint: string) {
    this.url = resolveUrl('files.nfo2', endpoint)
  }

  async load() {
    const response = await fetch(this.url)
    const data = await response.text()
    if (!data.startsWith('NFO200'))
      throw new Error('[KartNfo2] Invalid nfo2 file.\n' + data)

    return data
      .trim()
      .split('\r\n')
      .slice(1)
      .map(line => {
        const info = line
          .split(',')
          .map(text => {
            const unquotedText = text.slice(1, -1)
            const value = isNaN(Number(unquotedText))
              ? unquotedText.replace(/\\/g, '/')
              : Number(unquotedText)
            return value
          }) as ConstructorParameters<typeof KartPatchFile>
        return new KartPatchFile(...info)
      })
      // .slice(0, 20) // FOR DEBUGGING ONLY
  }
}

export class KartTxf {
  url: string

  constructor(endpoint: string) {
    this.url = resolveUrl('NT.txf', endpoint)
  }

  async load() {
    const response = await fetch(this.url)
    const data = await response.text()
    if (!data.includes(':\\'))
      throw new Error('[KartTxf] Invalid txf file.\n' + data)

    return data
      .trim()
      .split('\r\n')
      .map(line => {
        const info = line
          .split(':')
          .map(text => {
            const value = isNaN(Number(text))
              ? text.replace(/\\/g, '/')
              : Number(text)
            return value
          }) as ConstructorParameters<typeof TcgPatchFile>
        return new TcgPatchFile(...info)
      })
      // .slice(0, 20) // FOR DEBUGGING ONLY
  }
}
