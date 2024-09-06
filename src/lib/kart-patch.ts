/**
 * KartPatchSocket
 * Base on https://github.com/brownsugar/kart-patcher/blob/main/src-electron/lib/kart-patch-socket.ts
 */
import { Socket } from 'node:net'
import { consola } from 'consola'
import BufferManager from './buffer-manager'

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
  file: []
  gameserver: []
}

export default class KartPatch {
  connectSocket(host: string, port: number) {
    return new Promise<KartPatchServerInfo>((resolve, reject) => {
      consola.info('[KartPatchSocket] Connecting to patch server...')
      let socket = new Socket()
      // socket.setTimeout(10000)
      socket.on('data', data => {
        const buffer = Buffer.from(data)
        const reader = new BufferManager(buffer)
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
        consola.error('[KartPatchSocket] Connection timeout.')
        socket?.destroy()
        reject()
      })
      socket.on('error', e => {
        consola.error('[KartPatchSocket] Connection error.\n', e)
        socket?.destroy()
        reject()
      })
      socket.on('close', () => {
        socket = null
      })
      socket.connect(port, host, () => {
        consola.ready(`[KartPatchSocket] Connected to ${host}:${port}.`)
      })
    })
  }

  async connectTCGServer(serverEndpoint: string): Promise<KartPatchServerInfo> {
    const tcgPatchInfo = await fetch(serverEndpoint).then(res => res.json()) as TCGPatchInfo
    if (!tcgPatchInfo.version)
      throw new Error('Invalid patch info.')

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
}
