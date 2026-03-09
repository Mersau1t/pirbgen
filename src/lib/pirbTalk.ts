// Pirb trash-talk lines for the status bar during live trades
const PIRB_TRASH_TALK = [
  "PIRB: lmao u really went in? 💀",
  "PIRB: this is gonna be hilarious 🍿",
  "PIRB: ur portfolio called... it's crying fr fr",
  "PIRB: no cap ur getting rekt rn",
  "PIRB: *PIRB aggressively pecks ur bags*",
  "PIRB: skill issue detected 🎯",
  "PIRB: enjoy being poor, anon",
  "PIRB: my nft trades better than u",
  "PIRB: ngmi energy is strong with this one",
  "PIRB: *PIRB eats ur stop loss like bread crumbs*",
  "PIRB: nice trade... SIKE 😂",
  "PIRB: u call that leverage? kek",
  "PIRB: just close it bro. save urself",
  "PIRB: ur gonna get absolutely PIRBINATED",
  "PIRB: *poops on ur chart* 💩",
  "PIRB: wen rekt? ...any second now",
  "PIRB: this is called getting PIRBED bestie",
  "PIRB: i've seen better entries from a normie",
  "PIRB: *casually flies away with ur money* 🕊️",
  "PIRB: bro think he's a trader 💀💀💀",
  "PIRB: HFSP — have fun staying PIRBED",
  "PIRB: ur the exit liquidity fr fr",
  "PIRB: another victim for the PIRB gods",
  "PIRB: *aggressive cooing intensifies*",
  "PIRB: that candle is redder than ur face rn",
  "PIRB: plot twist: u were the liquidity all along",
  "PIRB: cope harder anon 💀",
  "PIRB: ratio + L + PIRBED",
  "PIRB: touch grass after this L",
  "PIRB: sheeeesh that entry was mid",
  "PIRB: not even ur mom would long this",
  "PIRB: imagine fumbling this bag 😭",
  "PIRB: rent free in ur head rn",
];

const PIRB_DUEL_TALK = [
  "PIRB: two idiots enter, one idiot leaves 💀",
  "PIRB: *sells popcorn in the arena* 🍿",
  "PIRB: this duel is gonna be VIOLENT no cap",
  "PIRB: place ur bets... PIRB always wins tho 🐦",
  "PIRB: PVP degens are my favorite snack fr",
  "PIRB: both of u are gonna lose lmao",
  "PIRB: *PIRB aggressively spectates*",
  "PIRB: fight fight fight! ...and lose!",
  "PIRB: imagine dueling another degen kek",
  "PIRB: this is content 🍿",
];

const PIRB_DAILY_TALK = [
  "PIRB: daily challenge? more like daily humiliation",
  "PIRB: 90 seconds to embarrass urself speedrun any%",
  "PIRB: tick tock, ur money goes byebye ⏰",
  "PIRB: today's special: fresh liquidation fr",
  "PIRB: daily L incoming",
  "PIRB: another day another rekt",
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
