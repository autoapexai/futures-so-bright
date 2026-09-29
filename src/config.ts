/**
 * Donate (value for value, no ads). Venmo business profile of the game; the VALUE FOR VALUE
 * card (game-over / victory screens only) opens it. Empty handle = the card is hidden entirely.
 */
export const VENMO_HANDLE = 'futuressobright888';

/** Web profile (desktop, and the phone fallback when the Venmo app doesn't open). */
export const DONATE_URL = VENMO_HANDLE ? `https://venmo.com/u/${encodeURIComponent(VENMO_HANDLE)}` : '';

/** Venmo app deep link (phones): a payment to the game's profile with the game as the note. */
export const VENMO_APP_URL = VENMO_HANDLE
  ? `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(VENMO_HANDLE)}&note=Future%27s%20So%20Bright`
  : '';

/** How long to wait for the Venmo app to take over before opening the web profile (ms). */
export const VENMO_APP_WAIT_MS = 1200;

/**
 * VALUE FOR VALUE card message (line breaks kept: one paragraph per line). Swap it here;
 * nothing else needs to change.
 */
export const V4V_MESSAGE = [
  "No ads. No sponsors. No one telling me what to build. Future's So Bright is supported solely by you.",
  'All that is asked: if you got value out of the game, return some value back. Any amount. Every dime helps.',
  'Your support is all there is.',
].join('\n');
