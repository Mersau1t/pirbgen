// Pirb trash-talk lines for the status bar during live trades
const PIRB_TRASH_TALK = [
  "PIRB: lmao u really went in? 💀",
  "PIRB: this is gonna be hilarious 🍿",
  "PIRB: ur portfolio called... it's crying",
  "PIRB: imagine losing to a pigeon 🐦",
  "PIRB: *pecks your liquidation button*",
  "PIRB: skill issue detected 🎯",
  "PIRB: enjoy being poor, anon",
  "PIRB: my grandma trades better than u",
  "PIRB: ngmi energy is strong with this one",
  "PIRB: *eats your stop loss like bread crumbs*",
  "PIRB: hey nice trade... SIKE 😂",
  "PIRB: u call that leverage? pathetic",
  "PIRB: just close it bro. save urself",
  "PIRB: ur gonna get absolutely PIRBINATED",
  "PIRB: *poops on your chart* 💩",
  "PIRB: wen rekt? ...any second now",
  "PIRB: this is called getting PIRBED",
  "PIRB: i've seen better entries from a goldfish",
  "PIRB: *casually flies away with your money* 🕊️",
  "PIRB: bro think he's a trader 💀💀💀",
  "PIRB: HFSP — have fun staying PIRBED",
  "PIRB: ur the exit liquidity, anon",
  "PIRB: another victim for the pigeon gods",
  "PIRB: *aggressive cooing intensifies*",
  "PIRB: that candle is redder than ur face rn",
  "PIRB: plot twist: u were the liquidity all along",
];

const PIRB_DUEL_TALK = [
  "PIRB: two idiots enter, one idiot leaves 💀",
  "PIRB: *sells popcorn in the arena* 🍿",
  "PIRB: this duel is gonna be VIOLENT",
  "PIRB: place ur bets... on the pigeon 🐦",
  "PIRB: PVP degens are my favorite snack",
  "PIRB: both of u are gonna lose lmao",
  "PIRB: *aggressively spectates*",
  "PIRB: fight fight fight! ...and lose!",
];

const PIRB_DAILY_TALK = [
  "PIRB: daily challenge? more like daily humiliation",
  "PIRB: 90 seconds to embarrass urself speedrun",
  "PIRB: tick tock, ur money goes byebye ⏰",
  "PIRB: today's special: fresh liquidation",
];

/** Get a random Pirb trash-talk line */
export function getPirbTrashTalk(mode: 'solo' | 'duel' | 'daily' = 'solo'): string {
  const pool = mode === 'duel' ? PIRB_DUEL_TALK
    : mode === 'daily' ? PIRB_DAILY_TALK
    : PIRB_TRASH_TALK;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Get a cycling Pirb line based on elapsed seconds */
export function getPirbTrashTalkCycled(elapsed: number, mode: 'solo' | 'duel' | 'daily' = 'solo'): string {
  const pool = mode === 'duel' ? [...PIRB_DUEL_TALK, ...PIRB_TRASH_TALK]
    : mode === 'daily' ? [...PIRB_DAILY_TALK, ...PIRB_TRASH_TALK]
    : PIRB_TRASH_TALK;
  const idx = Math.floor(elapsed / 5) % pool.length; // changes every 5s
  return pool[idx];
}
