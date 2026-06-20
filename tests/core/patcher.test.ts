import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFileHash, getPatchDiff } from '../../src/core/patcher'
import { loadKartNfo2, loadTcgTxf } from '../../src/lib/kart-manifest'

const mockState = vi.hoisted(() => ({
  kartLoadMetaResult: true,
  tcgLoadMetaResult: true,
  kartCrc: 123,
  tcgMd5: 'local-md5',
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
    crc = mockState.kartCrc

    constructor(basePath: string, filePath: string, _tempDir: string) {
      this.path = `${basePath}/${filePath}`
      this.filePath = filePath
    }

    isTcgMode() {
      return false
    }

    async loadMeta() {
      this.crc = mockState.kartCrc
      return mockState.kartLoadMetaResult
    }
  }

  class MockTcgLocalFile {
    path = ''
    filePath = ''
    md5 = mockState.tcgMd5

    constructor(basePath: string, filePath: string, _tempDir: string) {
      this.path = `${basePath}/${filePath}`
      this.filePath = filePath
    }

    isTcgMode() {
      return true
    }

    async loadMeta() {
      this.md5 = mockState.tcgMd5
      return mockState.tcgLoadMetaResult
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
    mockState.kartLoadMetaResult = true
    mockState.tcgLoadMetaResult = true
    mockState.kartCrc = 123
    mockState.tcgMd5 = 'local-md5'
  })

  it('getFileHash should select crc for kart mode', () => {
    const localFile = {
      isTcgMode: () => false,
      crc: 11,
      md5: 'x',
    }
    const remoteFile = {
      isTcgMode: () => false,
      crc: 22,
      md5: 'y',
    }

    // @ts-expect-error
    expect(getFileHash(localFile, remoteFile)).toEqual({ local: 11, remote: 22 })
  })

  it('getFileHash should select md5 for tcg mode', () => {
    const localFile = {
      isTcgMode: () => true,
      crc: 11,
      md5: 'local',
    }
    const remoteFile = {
      isTcgMode: () => true,
      crc: 22,
      md5: 'remote',
    }

    // @ts-expect-error
    expect(getFileHash(localFile, remoteFile)).toEqual({ local: 'local', remote: 'remote' })
  })

  it('getFileHash should resolve local and remote hash types independently', () => {
    const localFile = {
      isTcgMode: () => true,
      crc: 11,
      md5: 'local-md5',
    }
    const remoteFile = {
      isTcgMode: () => false,
      crc: 99,
      md5: 'remote-md5',
    }

    // @ts-expect-error
    expect(getFileHash(localFile, remoteFile)).toEqual({ local: 'local-md5', remote: 99 })
  })

  it('getPatchDiff should use txf loader in tcg mode and keep mismatched files', async () => {
    vi.mocked(loadTcgTxf).mockResolvedValue([
      {
        path: 'Data/a.rho',
        md5: 'remote-md5',
        size: 100,
        isTcgMode: () => true,
      },
    ] as unknown as Awaited<ReturnType<typeof loadTcgTxf>>)

    const result = await getPatchDiff({
      endpoint: 'http://mock/tcg',
      id: 'ID',
      version: 100,
      mode: 'tcg',
    })

    expect(loadTcgTxf).toHaveBeenCalledWith('http://mock/tcg')
    expect(loadKartNfo2).not.toHaveBeenCalled()
    expect(result.remoteBaseUrl).toBe('http://mock/tcg')
    expect(result.clientFiles.length).toBe(1)
    expect(result.patchFiles.length).toBe(1)
  })

  it('getPatchDiff should use nfo2 loader in kart mode and filter matching files', async () => {
    vi.mocked(loadKartNfo2).mockResolvedValue([
      {
        path: 'Data/a.rho',
        crc: 123,
        size: 100,
        isTcgMode: () => false,
      },
    ] as unknown as Awaited<ReturnType<typeof loadKartNfo2>>)

    const result = await getPatchDiff({
      endpoint: 'http://mock/kart/',
      id: 'ID',
      version: 3502,
      mode: 'kart',
    })

    expect(loadKartNfo2).toHaveBeenCalledWith('http://mock/kart/3502')
    expect(loadTcgTxf).not.toHaveBeenCalled()
    expect(result.remoteBaseUrl).toBe('http://mock/kart/3502')
    expect(result.clientFiles.length).toBe(1)
    expect(result.patchFiles.length).toBe(0)
  })

  it('getPatchDiff should keep files when local metadata load fails', async () => {
    mockState.kartLoadMetaResult = false
    mockState.kartCrc = 777

    vi.mocked(loadKartNfo2).mockResolvedValue([
      {
        path: 'Data/a.rho',
        crc: 777,
        size: 100,
        isTcgMode: () => false,
      },
    ] as unknown as Awaited<ReturnType<typeof loadKartNfo2>>)

    const result = await getPatchDiff({
      endpoint: 'http://mock/kart/',
      id: 'ID',
      version: 3502,
      mode: 'kart',
    })

    expect(result.clientFiles.length).toBe(1)
    expect(result.patchFiles.length).toBe(1)
  })
})
