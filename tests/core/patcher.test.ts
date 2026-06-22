import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rm } from 'node:fs/promises'
import { getPatchDiff, removeRemovedClientFiles } from '../../src/core/patcher'
import { loadKartNfo2, loadTcgTxf } from '../../src/lib/kart-manifest'
import { DIR_NAMES } from '../../src/lib/paths'

vi.mock('node:fs/promises', () => ({
  rm: vi.fn(),
}))

vi.mock('../../meta.json', () => ({
  default: {
    id: 'OLDPATCHABCDEFQ',
    version: 3501,
  },
}))

vi.mock('../../src/lib/kart-manifest', () => {
  return {
    loadKartNfo2: vi.fn(),
    loadTcgTxf: vi.fn(),
  }
})

vi.mock('../../src/lib/kart-files', () => {
  class MockKartLocalFile {
    path = ''
    filePath = ''
    crc = 0

    constructor(basePath: string, filePath: string, _tempDir: string) {
      this.path = `${basePath}/${filePath}`
      this.filePath = filePath
    }

    isTcgMode() {
      return false
    }
  }

  class MockTcgLocalFile {
    path = ''
    filePath = ''
    md5 = ''

    constructor(basePath: string, filePath: string, _tempDir: string) {
      this.path = `${basePath}/${filePath}`
      this.filePath = filePath
    }

    isTcgMode() {
      return true
    }
  }

  return {
    KartLocalFile: MockKartLocalFile,
    TcgLocalFile: MockTcgLocalFile,
    KartPatchFile: class {},
    TcgPatchFile: class {},
  }
})

describe('core/patcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removeRemovedClientFiles should skip when no files are removed', async () => {
    await removeRemovedClientFiles([])
    expect(rm).not.toHaveBeenCalled()
  })

  it('removeRemovedClientFiles should remove files from client directory', async () => {
    const removedFiles = ['Data/a.rho', 'Data/b.rho']
    await removeRemovedClientFiles(removedFiles)

    expect(rm).toHaveBeenCalledTimes(2)
    expect(rm).toHaveBeenNthCalledWith(1, expect.stringContaining(DIR_NAMES.client), { force: true })
    expect(rm).toHaveBeenNthCalledWith(2, expect.stringContaining(DIR_NAMES.client), { force: true })
  })

  it('getPatchDiff should diff tcg manifests by patch id endpoint', async () => {
    vi.mocked(loadTcgTxf).mockImplementation(async endpoint => {
      if (endpoint === 'http://mock/tcg/NEWPATCHABCDEFX') {
        return [
          {
            path: 'Data/a.rho',
            md5: 'new-md5',
            size: 100,
            isTcgMode: () => true,
            getFileHash: () => 'new-md5',
          },
          {
            path: 'Data/b.rho',
            md5: 'same-md5',
            size: 100,
            isTcgMode: () => true,
            getFileHash: () => 'same-md5',
          },
        ] as unknown as Awaited<ReturnType<typeof loadTcgTxf>>
      }

      if (endpoint === 'http://mock/tcg/OLDPATCHABCDEFQ') {
        return [
          {
            path: 'Data/a.rho',
            md5: 'old-md5',
            size: 100,
            isTcgMode: () => true,
            getFileHash: () => 'old-md5',
          },
          {
            path: 'Data/c.rho',
            md5: 'removed-md5',
            size: 100,
            isTcgMode: () => true,
            getFileHash: () => 'removed-md5',
          },
        ] as unknown as Awaited<ReturnType<typeof loadTcgTxf>>
      }

      throw new Error(`Unexpected endpoint: ${endpoint}`)
    })

    const result = await getPatchDiff({
      endpoint: 'http://mock/tcg/NEWPATCHABCDEFX',
      id: 'NEWPATCHABCDEFX',
      version: 3502,
      mode: 'tcg',
    })

    expect(loadTcgTxf).toHaveBeenCalledWith('http://mock/tcg/NEWPATCHABCDEFX')
    expect(loadTcgTxf).toHaveBeenCalledWith('http://mock/tcg/OLDPATCHABCDEFQ')
    expect(loadKartNfo2).not.toHaveBeenCalled()
    expect(result.remoteBaseUrl).toBe('http://mock/tcg/NEWPATCHABCDEFX')
    expect(result.clientFiles.length).toBe(2)
    expect(result.patchFiles.length).toBe(2)
    expect(result.patchFiles.map(file => file.remoteFile.path)).toEqual(['Data/a.rho', 'Data/b.rho'])
    expect(result.removedFiles).toEqual(['Data/c.rho'])
  })

  it('getPatchDiff should diff kart manifests and separate changed/new/removed', async () => {
    vi.mocked(loadKartNfo2).mockImplementation(async endpoint => {
      if (endpoint === 'http://mock/kart/3502') {
        return [
          {
            path: 'Data/a.rho',
            crc: 111,
            size: 100,
            isTcgMode: () => false,
            getFileHash: () => 111,
          },
          {
            path: 'Data/b.rho',
            crc: 222,
            size: 100,
            isTcgMode: () => false,
            getFileHash: () => 222,
          },
        ] as unknown as Awaited<ReturnType<typeof loadKartNfo2>>
      }

      if (endpoint === 'http://mock/kart/3501') {
        return [
          {
            path: 'Data/a.rho',
            crc: 100,
            size: 100,
            isTcgMode: () => false,
            getFileHash: () => 100,
          },
          {
            path: 'Data/c.rho',
            crc: 333,
            size: 100,
            isTcgMode: () => false,
            getFileHash: () => 333,
          },
        ] as unknown as Awaited<ReturnType<typeof loadKartNfo2>>
      }

      throw new Error(`Unexpected endpoint: ${endpoint}`)
    })

    const result = await getPatchDiff({
      endpoint: 'http://mock/kart/',
      id: 'ID',
      version: 3502,
      mode: 'kart',
    })

    expect(loadKartNfo2).toHaveBeenCalledWith('http://mock/kart/3502')
    expect(loadTcgTxf).not.toHaveBeenCalled()
    expect(result.remoteBaseUrl).toBe('http://mock/kart/3502')
    expect(loadKartNfo2).toHaveBeenCalledWith('http://mock/kart/3501')
    expect(loadTcgTxf).not.toHaveBeenCalled()
    expect(result.clientFiles.length).toBe(2)
    expect(result.patchFiles.map(file => file.remoteFile.path)).toEqual(['Data/a.rho', 'Data/b.rho'])
    expect(result.removedFiles).toEqual(['Data/c.rho'])
  })
})
