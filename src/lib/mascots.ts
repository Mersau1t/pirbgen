/**
 * Mascot asset registry.
 * 
 * All variants currently point to the default pirb-mascot.png.
 * To replace, just add the new file to src/assets/ and update the import here.
 * 
 * Expected files (when ready):
 *   src/assets/pirb-idle.png
 *   src/assets/pirb-peck.png
 *   src/assets/pirb-win.png
 *   src/assets/pirb-lose.png
 *   src/assets/pirb-duel.png
 *   src/assets/pirb-daily.png
 *   src/assets/gainzy-mascot.png
 *   src/assets/gainzy-generating.png
 *   src/assets/gainzy-win.png
 *   src/assets/gainzy-lose.png
 */

import pirbDefault from '@/assets/pirb-mascot.png';

// --- PIRB variants (replace imports when assets are ready) ---
const pirbIdle = pirbDefault;
const pirbPeck = pirbDefault;
const pirbWin = pirbDefault;
const pirbLose = pirbDefault;
const pirbDuel = pirbDefault;
const pirbDaily = pirbDefault;

// --- GAINZY variants (replace imports when assets are ready) ---
const gainzyMascot = pirbDefault;
const gainzyGenerating = pirbDefault;
const gainzyWin = pirbDefault;
const gainzyLose = pirbDefault;

export type MascotState = 'idle' | 'generating' | 'win' | 'lose' | 'duel' | 'daily';

export function getMascot(state: MascotState, isGainzy = false): string {
  if (isGainzy) {
    switch (state) {
      case 'idle': return gainzyMascot;
      case 'generating': return gainzyGenerating;
      case 'win': return gainzyWin;
      case 'lose': return gainzyLose;
      default: return gainzyMascot;
    }
  }

  switch (state) {
    case 'idle': return pirbIdle;
    case 'generating': return pirbPeck;
    case 'win': return pirbWin;
    case 'lose': return pirbLose;
    case 'duel': return pirbDuel;
    case 'daily': return pirbDaily;
    default: return pirbDefault;
  }
}
