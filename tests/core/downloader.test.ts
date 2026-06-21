/* eslint-disable camelcase */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { consola } from 'consola'
import { request, stream } from 'undici'
import { extract } from 'zip-lib'
import { move } from 'fs-extra'
import { downloadFullClient, downloadPatchFiles } from '../../src/core/downloader'
import { resolveClientDir, resolveClientFullTempDir, resolveClientTempDir } from '../../src/lib/paths'
import { resolve } from 'node:path'
import { rm, mkdir } from 'node:fs/promises'

let mockReleaseStatusCode = 200
let mockReleaseAssets: { name?: string, browser_download_url?: string }[] = []

vi.mock('undici', () => ({
  request: vi.fn().mockImplementation(async () => ({
    statusCode: mockReleaseStatusCode,
    body: {
      json: async () => ({
        assets: mockReleaseAssets,
      }),
    },
  })),
  stream: vi.fn().mockImplementation(async (url, options, factory) => {
    if (String(url).includes('/404')) {
      factory({ statusCode: 404 })
      return
    }

    const writer = factory()
    writer.end('mock file content')
    return new Promise(res => writer.on('finish', res))
  }),
}))

vi.mock('zip-lib', () => ({
  extract: vi.fn(),
}))

vi.mock('fs-extra', () => ({
  move: vi.fn(),
}))

describe('core/downloader', () => {
  const tempDir = resolveClientTempDir()
  const fullClientTempDir = resolveClientFullTempDir()

  beforeEach(async () => {
    mockReleaseStatusCode = 200
    mockReleaseAssets = []
    await mkdir(tempDir, { recursive: true })
    await mkdir(fullClientTempDir, { recursive: true })
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await rm(tempDir, { recursive: true, force: true })
    await rm(fullClientTempDir, { recursive: true, force: true })
  })

  it('should skip download if patchFiles array is empty', async () => {
    const spy = vi.spyOn(consola, 'info')

    await downloadPatchFiles([], 'http://mock', {
      endpoint: 'http://mock',
      id: 'ID',
      version: 1,
      mode: 'kart',
    })

    expect(spy).toHaveBeenCalledWith('Nothing to download.')
  })

  it('should throw when latest release metadata request fails', async () => {
    const clientDir = resolveClientDir()
    mockReleaseStatusCode = 500

    await expect(downloadFullClient(clientDir)).rejects.toThrow('Failed to fetch latest release metadata with status 500')
  })

  it('should throw when latest release has no matching archives', async () => {
    const clientDir = resolveClientDir()
    mockReleaseAssets = [
      { name: 'readme.txt', browser_download_url: 'http://mock/readme.txt' },
      { name: 'PopKart_Client.tar.gz', browser_download_url: 'http://mock/PopKart_Client.tar.gz' },
    ]

    await expect(downloadFullClient(clientDir)).rejects.toThrow('No matching full client archives found in latest release assets.')
  })

  it('should download and extract all PopKart_Client zip assets from latest release', async () => {
    const clientDir = resolveClientDir()
    mockReleaseAssets = [
      { name: 'PopKart_Client_1.zip', browser_download_url: 'http://mock/PopKart_Client_1.zip' },
      { name: 'PopKart_Client_2.ZIP', browser_download_url: 'http://mock/PopKart_Client_2.ZIP' },
      { name: 'Other_Client.zip', browser_download_url: 'http://mock/Other_Client.zip' },
      { name: 'PopKart_Client_no_url.zip' },
    ]

    await downloadFullClient(clientDir)

    expect(request).toHaveBeenCalledOnce()
    expect(stream).toHaveBeenCalledTimes(2)
    expect(extract).toHaveBeenCalledTimes(2)
  })

  it('should fail fast on non-2xx archive download responses', async () => {
    const clientDir = resolveClientDir()
    mockReleaseAssets = [
      { name: 'PopKart_Client.zip', browser_download_url: 'http://mock/404.zip' },
    ]

    await expect(downloadFullClient(clientDir)).rejects.toThrow('Download failed with status 404')
  })

  it('should run download and move flow for tcg mode patch files', async () => {
    const pair = {
      localFile: {
        getDownloadPath: () => resolve(tempDir, 'Data', 'test.rho'),
        getRawFilePath: () => 'Data/test.rho',
        getDestinationPath: () => resolve(resolveClientDir(), 'Data', 'test.rho'),
        isTcgMode: () => true,
      },
      remoteFile: {
        path: 'Data/test.rho',
        isTcgMode: () => true,
      },
    }

    await downloadPatchFiles([pair] as unknown as Parameters<typeof downloadPatchFiles>[0], 'http://mock/base', {
      endpoint: 'http://mock/base',
      id: 'ID',
      version: 1,
      mode: 'tcg',
    })

    expect(stream).toHaveBeenCalled()
    expect(move).toHaveBeenCalled()
  })
})
