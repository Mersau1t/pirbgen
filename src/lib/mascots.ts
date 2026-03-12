import pirbDefault from '@/assets/pirb-mascot.png';
import pirbIdle from '@/assets/pirb-idle.png';
import pirbPeck from '@/assets/pirb-peck.png';
import pirbWin from '@/assets/pirb-win.png';
import pirbLose from '@/assets/pirb-lose.png';
import pirbDuel from '@/assets/pirb-duel.png';
import pirbDaily from '@/assets/pirb-daily.png';
import pirbRage from '@/assets/pirb-rage.png';
import pirbStreak from '@/assets/pirb-streak.png';

import gainzyMascot from '@/assets/gainzy-mascot.png';
import gainzyGenerating from '@/assets/gainzy-generating.png';
import gainzyWin from '@/assets/gainzy-win.png';
import gainzyLose from '@/assets/gainzy-lose.png';

export type MascotState = 'idle' | 'generating' | 'win' | 'lose' | 'duel' | 'daily' | 'rage' | 'streak';

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
    case 'rage': return pirbRage;
    case 'streak': return pirbStreak;
    default: return pirbDefault;
  }
}
