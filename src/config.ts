/**
 * Donate (value for value, no ads). Venmo handle of the game's creator; the DONATE
 * panel (game-over / victory screens only) opens https://venmo.com/u/<handle>.
 * Empty string = the panel is hidden entirely.
 */
export const VENMO_HANDLE = 'futuressobright888';

export const DONATE_URL = VENMO_HANDLE ? `https://venmo.com/u/${encodeURIComponent(VENMO_HANDLE)}` : '';
