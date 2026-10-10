import { describe, expect, test } from 'claude-code/testing'

import { CWD, LSOF, PS } from './fixtures'
import { humanize, isDevServer, label, parseListening, toServers } from './servers'

describe('servers', () => {
  test('drops ephemeral ports and de-duplicates IPv4/IPv6 listeners', () => {
    const ports = parseListening(LSOF)
    expect(ports.get(4321)).toEqual([4321])
    expect(ports.has(5146)).toBe(false)
  })

  test('keeps dev runtimes, drops system services', () => {
    expect(isDevServer('node /x/astro dev')).toBe(true)
    expect(isDevServer('/home/dev/.venv/bin/python3.13 -m http.server')).toBe(true)
    expect(isDevServer('/System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter')).toBe(false)
  })

  test('humanizes ps elapsed time', () => {
    expect(humanize('07-00:31:07')).toBe('7d 0h')
    expect(humanize('02:05:09')).toBe('2h 5m')
    expect(humanize('04:12')).toBe('4m')
    expect(humanize('00:20')).toBe('20s')
  })

  test('labels commands by the tool they run', () => {
    expect(label('node /home/dev/shop-web/node_modules/.bin/astro dev')).toBe('astro dev')
    expect(label('node /a/node_modules/vite/bin/vite.js --port 5173')).toBe('vite --port 5173')
    expect(label('/home/dev/catalog-api/.venv/bin/python -m http.server 8000')).toBe('python -m http.server 8000')
  })

  test('joins the three outputs into servers sorted by port', () => {
    expect(toServers(LSOF, PS, CWD)).toEqual([
      { pid: 4321, ports: [4321], project: 'shop-web', cwd: '/home/dev/shop-web', command: 'node /home/dev/shop-web/node_modules/.bin/astro dev', uptime: '2h 5m' },
      { pid: 8000, ports: [8000], project: 'catalog-api', cwd: '/home/dev/catalog-api', command: '/home/dev/catalog-api/.venv/bin/python -m http.server 8000', uptime: '4m' },
    ])
  })
})
