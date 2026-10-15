// Les copies de la timeline sont exactement ce que scripts/synchro-timeline.mjs produit depuis video-neo
// (aucune retouche à la main). Sauté si video-neo n'est pas sur ce poste.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const VIDEO_NEO = join(homedir(), 'NEO/dev/video-neo')
const SCRIPT = join(__dirname, '../../../../../scripts/synchro-timeline.mjs')

describe.skipIf(!existsSync(join(VIDEO_NEO, 'labo/timeline/src/App.tsx')))('copies de la timeline du labo', () => {
  it('à jour et sans retouche à la main', () => {
    expect(execFileSync('node', [SCRIPT, '--verifier', VIDEO_NEO], { encoding: 'utf8' })).toContain('à jour')
  })
})
