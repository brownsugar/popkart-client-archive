/**
 * KartPatchSocket
 * Base on https://github.com/brownsugar/kart-patcher/blob/main/src-electron/lib/kart-patch-socket.ts
 */
import { Socket } from 'node:net'
import { consola } from 'consola'
import BufferManager from './buffer-manager'

const SOCKET_TIMEOUT_MS = 10_000

export interface KartPatchServerInfo {
  endpoint: string
  id: string
  version: number
  mode: 'tcg' | 'kart'
}

interface TCGPatchInfo {
  game_id: string
  game_name: string
  version: `P${number}`
  install_pack_time: string
  update_time: string
  download_prefix: string
  update_prefix: string
  file: unknown[]
  gameserver: unknown[]
}

export const connectSocket = (host: string, port: number): Promise<KartPatchServerInfo> => {
  return new Promise<KartPatchServerInfo>((resolve, reject) => {
    consola.info('[KartPatchSocket] Connecting to patch server...')
    let socket: Socket | null = new Socket()
    socket.setTimeout(SOCKET_TIMEOUT_MS)

    socket.on('data', data => {
      const reader = new BufferManager(data)
      reader.move(0x0A)

      const version = reader.nextShort()
      const endpoint = reader.nextStringAuto()
      socket?.destroy()

      resolve({
        endpoint,
        id: endpoint.match(/\/([A-Z]{15})$/)?.[1] || '',
        version,
        mode: 'kart',
      })
    })

    socket.on('timeout', () => {
      consola.error('[KartPatch][Socket] Connection timeout.')
      socket?.destroy()
      reject(new Error('Connection timeout'))
    })

    socket.on('error', e => {
      consola.error('[KartPatch][Socket] Connection error.\n', e)
      socket?.destroy()
      reject(e)
    })

    socket.on('close', () => {
      socket = null
    })

    socket.connect(port, host, () => {
      consola.ready(`[KartPatch][Socket] Connected to ${host}:${port}.`)
    })
  })
}

export const connectTCGServer = async (serverEndpoint: string): Promise<KartPatchServerInfo> => {
  const response = await fetch(serverEndpoint)
  if (!response.ok)
    throw new Error(`[KartPatch][TCG] Failed to fetch patch info from TCG server: ${response.status} ${response.statusText}`)

  const tcgPatchInfo = await response.json() as TCGPatchInfo
  if (!tcgPatchInfo.version)
    throw new Error('[KartPatch][TCG] Invalid patch info from TCG server.')

  const endpoint = tcgPatchInfo.update_prefix
  const id = tcgPatchInfo.update_prefix.match(/\/([A-Z]{15})$/)?.[1] || ''
  const version = Number(tcgPatchInfo.version.slice(1))

  return {
    endpoint,
    id,
    version,
    mode: 'tcg',
  }
}
