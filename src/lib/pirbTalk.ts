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

const GAINZY_TALK = [
  "GAINZY: ur TA is just a horoscope for men who don't shower 🧼",
  "GAINZY: u're not a trader, u're a professional exit-liquidity provider 💀",
  "GAINZY: ur risk management is just hoping ur mom doesn't check the bank 🏦",
  "GAINZY: ur PnL looks like a staircase to hell 📉",
  "GAINZY: u buy the top and sell the bottom like a religious ritual ⛪",
  "GAINZY: ur 'alpha' is just reading 4-hour-old tweets from bots 🤖",
  "GAINZY: u shorted the bottom didn't u? absolute sentient potato 🥔",
  "GAINZY: ur portfolio is 99% AI slop and 1% hope 🗑️",
  "GAINZY: u're the reason Binance has a 'Liquidated' notification 🔔",
  "GAINZY: ur brain has the texture of smooth marble — zero wrinkles 🧠",
  "GAINZY: u treat pump.fun like it's a retirement plan 👴",
  "GAINZY: ur only hedge is a job application at McDonald's 🍟",
  "GAINZY: CEO of 'It's a long-term play' (after being down 90%) 📊",
  "GAINZY: ur Twitter is just a graveyard of failed predictions 🪦",
  "GAINZY: u have the conviction of a wet paper towel 🧻",
  "GAINZY: u're the human equivalent of a Rug Pull 🧶",
  "GAINZY: even the scammers feel bad for taking ur money 😢",
  "GAINZY: ur IQ is lower than the current gas price on Ethereum ⛽",
  "GAINZY: u're literally a Top Signal in human form 📡",
  "GAINZY: u're holding more bags than a bellboy at the Hilton 🧳",
  "GAINZY: ur 'technical analysis' is just drawing dicks on a 1-min chart 🖍️",
  "GAINZY: u're allergic to profit 🤧",
  "GAINZY: ur only successful trade was when u forgot ur password 🔐",
  "GAINZY: if being wrong was a sport, u'd be Olympic gold medalist 🥇",
  "GAINZY: ur portfolio is a museum of every bad decision in Web3 🏛️",
  "GAINZY: u're not trading the market — the market is trading u 🎭",
  "GAINZY: u've been liquidated so many times ur exchange sent a Thank You card 💌",
  "GAINZY: ur 'alpha' group is just three guys sharing one brain cell 🧫",
  "GAINZY: u buy the dip, but the dip keeps dipping 🕳️",
  "GAINZY: u're a 'pro trader' on Twitter and a broke student irl 🎓",
  "GAINZY: 200x leverage? more like 200x ways to lose everything 💣",
  "GAINZY: u look at a red candle and call it 'accumulation' 🤡",
  "GAINZY: nice 'gem' u found — pity it's actually a polished turd 💩",
  "GAINZY: just delete the app bro. for ur own sake 📱",
  "GAINZY: larping as a whale while eating ramen in ur parents' basement 🐋",
  "GAINZY: ur life is just one long guilty quote-tweet 🔁",
  "GAINZY: diamond hands legend — mostly cuz ur brain is hard as a rock 💎",
  "GAINZY: u spend more on gas fees than u have in ur wallet ⛽",
  "GAINZY: imagine fumbling a 200x bag... oh wait u just did 😭",
  "GAINZY: cope. seethe. get liquidated. repeat. 🔄",
];

/** Get a random Pirb trash-talk line */
export function getPirbTrashTalk(mode: 'solo' | 'duel' | 'daily' | 'gainzy' = 'solo'): string {
  const pool = mode === 'gainzy' ? GAINZY_TALK
    : mode === 'duel' ? PIRB_DUEL_TALK
    : mode === 'daily' ? PIRB_DAILY_TALK
    : PIRB_TRASH_TALK;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Get a cycling Pirb line based on elapsed seconds */
export function getPirbTrashTalkCycled(elapsed: number, mode: 'solo' | 'duel' | 'daily' | 'gainzy' = 'solo'): string {
  const pool = mode === 'gainzy' ? GAINZY_TALK
    : mode === 'duel' ? [...PIRB_DUEL_TALK, ...PIRB_TRASH_TALK]
    : mode === 'daily' ? [...PIRB_DAILY_TALK, ...PIRB_TRASH_TALK]
    : PIRB_TRASH_TALK;
  const idx = Math.floor(elapsed / 5) % pool.length; // changes every 5s
  return pool[idx];
}
