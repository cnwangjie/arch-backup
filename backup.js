#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const util = require('util')
const child_process = require('child_process')

const _println = t => process.stdout.write(t + '\n')
const _log = (...args) => _println(util.formatWithOptions({ colors: true }, ...args))
const _writeFile = util.promisify(fs.writeFile)
const __exec = util.promisify(child_process.exec)
const _exec = cmd => __exec(cmd, { cwd: __dirname, maxBuffer: 2 << 20 }).then(({stdout}) => stdout.toString())

const _groupBy = (items, keyMap) => {
  const result = {}
  items.forEach(item => {
    const key = typeof keyMap === 'function' ? keyMap(item) : item
    if (key in result) result[key].push(item)
    else result[key] = [item]
  })
  return result
}

const _mapValues = (obj, map) => {
  const r = {}
  for (const [k, v] of Object.entries(obj)) {
    r[k] = map(v)
  }
  return r
}

const _flat = arrs => [].concat.call(...arrs)

const _parsePackageInfo = t => {
  const r = {}
  t.split('\n')
    .map(l => l.split(':')
      .map(i => i.trim()))
    .forEach(([k, v]) => r[k] = v)
  return r
}

const _gitDiff = async file => {
  const [a = 0, d = 0] = await _exec(`git diff --numstat ${file}`)
    .then(t => t.split(/\s+/).map(i => +i || 0))
  return {a, d}
}

const backupPackageLists = async () => {
  const [groups, pkgsInGroup] = await _exec('pacman -Qge')
    .then(s => s.trim()
      .split('\n')
      .map(l => l.split(/\s+/)))
    .then(s => _groupBy(s, l => l[0]))
    .then(s => _mapValues(s, (l => l.map(([, p]) => p))))
    .then(s => [Object.keys(s), _flat(Object.values(s))])

  const task0 = ['pacman -Qeim', 'pacman -Qein'].map(cmd => _exec(cmd)
    .then(result => result.split('\n\n')
      .filter(i => i)
      .map(_parsePackageInfo)
      .map(i => i.Name)))
  const [aurlist, pkglist] = await Promise.all(task0)

  _log('packages installed:')
  _log(' %O from AUR', aurlist.length)
  _log(' %O from official repo', pkglist.length)
  _log(' %O groups', groups.length)
  const explicitly = _flat([aurlist, pkglist].map(list => list.filter(p => !pkgsInGroup.includes(p))))
  _log(' %O explicitly installed', explicitly.length)
  _log()

  const tasks1 = [ [groups, 'grouplist'], [explicitly, 'pkglist'] ].map(async ([list, filename]) => {
    const text = list.map(i => i + '\n').join('')
    const absolute = path.join(__dirname, filename)
    await _writeFile(absolute, text)
    const diff = await _gitDiff(filename)
    _log('write %s ok %O new and %O removel', filename, diff.a, diff.d)
  })
  return Promise.all(tasks1)
}

const methods = {
  backup: backupPackageLists,
}

const [,, method = 'backup'] = process.argv

methods[method]()


