import { open, seal } from '../crypto/secretbox'
import { pool } from '../db/pool'
import { loadConfig } from '../config'
import type { Perfil } from './controle'

export interface AccessConfig {
  hostname?: string
  token?: string
  authKey?: string
}

export function validarConfigDeAcesso(perfil: Perfil, config: AccessConfig): string | null {
  if (perfil === 'tor') return null
  if (perfil === 'tailscale') {
    if (!config.authKey?.trim()) return 'TS_AUTHKEY ausente'
    if (!config.hostname?.trim()) return 'hostname ausente'
    return null
  }
  if (!config.token?.trim()) return 'TUNNEL_TOKEN ausente'
  if (!config.hostname?.trim()) return 'hostname ausente'
  return null
}

export async function salvarConfigDeAcesso(
  perfil: Perfil,
  userId: number,
  config: AccessConfig,
): Promise<void> {
  const limpo: AccessConfig = {
    ...(config.hostname?.trim() ? { hostname: config.hostname.trim() } : {}),
    ...(config.token?.trim() ? { token: config.token.trim() } : {}),
    ...(config.authKey?.trim() ? { authKey: config.authKey.trim() } : {}),
  }
  const erro = validarConfigDeAcesso(perfil, limpo)
  if (erro) throw new Error(erro)

  await pool.query(
    `INSERT INTO access_configs (profile, config_encrypted, updated_by)
     VALUES ($1,$2,$3)
     ON CONFLICT (profile) DO UPDATE
       SET config_encrypted = EXCLUDED.config_encrypted,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
    [perfil, seal(JSON.stringify(limpo), loadConfig().masterKeyHex), userId],
  )
}

export async function configDeAcesso(perfil: Perfil): Promise<AccessConfig | null> {
  const { rows } = await pool.query<{ config_encrypted: Buffer }>(
    'SELECT config_encrypted FROM access_configs WHERE profile = $1',
    [perfil],
  )
  if (!rows[0]) return null
  return JSON.parse(open(rows[0].config_encrypted, loadConfig().masterKeyHex)) as AccessConfig
}

export async function resumoDeConfigDeAcesso(perfil: Perfil) {
  const config = await configDeAcesso(perfil)
  return {
    profile: perfil,
    configured: config !== null,
    hostname: config?.hostname ?? null,
    hasSecret: Boolean(config?.token || config?.authKey),
  }
}

function valorDeShell(valor: string): string {
  return `'${valor.replaceAll("'", "'\"'\"'")}'`
}

export function envDeConfigDeAcesso(perfil: Perfil, config: AccessConfig): string {
  if (perfil === 'tailscale') {
    return [
      `export TS_AUTHKEY=${valorDeShell(config.authKey ?? '')}`,
      `export TAILSCALE_HOSTNAME=${valorDeShell(config.hostname ?? '')}`,
    ].join('\n')
  }
  if (perfil === 'cloudflared') {
    return [
      `export TUNNEL_TOKEN=${valorDeShell(config.token ?? '')}`,
      `export CLOUDFLARE_HOSTNAME=${valorDeShell(config.hostname ?? '')}`,
    ].join('\n')
  }
  return ''
}

export function variaveisDeConfigDeAcesso(
  perfil: Perfil,
  config: AccessConfig,
): Record<string, string> {
  if (perfil === 'tailscale') {
    return {
      TS_AUTHKEY: config.authKey ?? '',
      TAILSCALE_HOSTNAME: config.hostname ?? '',
    }
  }
  if (perfil === 'cloudflared') {
    return {
      TUNNEL_TOKEN: config.token ?? '',
      CLOUDFLARE_HOSTNAME: config.hostname ?? '',
    }
  }
  return {}
}
