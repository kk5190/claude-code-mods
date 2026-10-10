// Shaped like this machine's real output: AirPlay (ControlCenter), an ephemeral kernel port, and two dev servers.
export const LSOF = [
  'p822', 'cControlCenter', 'f10', 'n*:7000', 'f12', 'n*:5000',
  'p5146', 'cpython3.13', 'f14', 'n127.0.0.1:57035',
  'p4321', 'cnode', 'f20', 'n[::1]:4321', 'f21', 'n127.0.0.1:4321',
  'p8000', 'cpython3.13', 'f6', 'n127.0.0.1:8000',
].join('\n')
export const PS = [
  '  822 07-00:31:07 /System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter',
  ' 4321    02:05:09 node /home/dev/shop-web/node_modules/.bin/astro dev',
  ' 8000       04:12 /home/dev/catalog-api/.venv/bin/python -m http.server 8000',
].join('\n')
export const CWD = ['p822', 'fcwd', 'n/', 'p4321', 'fcwd', 'n/home/dev/shop-web', 'p8000', 'fcwd', 'n/home/dev/catalog-api'].join('\n')
