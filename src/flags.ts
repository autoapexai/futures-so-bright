/**
 * Small inline flag icons for the LANGUAGE dropdown (MODES screen). Every flag is drawn in the
 * same 30 x 20 box so they line up; no ids, gradients or external images, so each can be used
 * any number of times on the page. A new language adds its flag here and in LANGS (i18n.ts).
 */
const svg = (body: string): string =>
  `<svg viewBox="0 0 30 20" width="30" height="20" focusable="false" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

/** United States (English): 13 red / white stripes, blue canton with white stars. */
const US_STARS = (() => {
  let s = '';
  const rows = [1.25, 3.3, 5.35, 7.4, 9.45];
  rows.forEach((y, i) => {
    const xs = i % 2 === 0 ? [1.6, 4.5, 7.4, 10.3] : [3.05, 5.95, 8.85];
    for (const x of xs) s += `<circle cx="${x}" cy="${y}" r="0.6"/>`;
  });
  return s;
})();
const US_STRIPES = (() => {
  const h = 20 / 13;
  let d = '';
  for (let k = 1; k < 13; k += 2) d += `M0 ${(k * h).toFixed(3)}h30v${h.toFixed(3)}H0z`;
  return d;
})();
export const FLAG_US = svg(
  `<rect width="30" height="20" fill="#B22234"/><path d="${US_STRIPES}" fill="#fff"/>` +
    `<rect width="12" height="10.77" fill="#3C3B6E"/><g fill="#fff">${US_STARS}</g>`,
);

/** Mexico (Español): green / white / red vertical bands, eagle emblem in the middle. */
export const FLAG_MX = svg(
  '<rect width="10" height="20" fill="#006847"/><rect x="10" width="10" height="20" fill="#fff"/>' +
    '<rect x="20" width="10" height="20" fill="#CE1126"/>' +
    '<path d="M12.2 11.2Q15 15.4 17.8 11.2" fill="none" stroke="#006847" stroke-width="0.9" stroke-linecap="round"/>' +
    '<ellipse cx="15" cy="9.4" rx="2.1" ry="2.5" fill="#8C5A2B"/>' +
    '<path d="M13.4 7.6L15 6.2L16.6 7.6" fill="none" stroke="#5C3A1A" stroke-width="0.7" stroke-linejoin="round"/>',
);

/** Vietnam (Tiếng Việt): red field, large yellow five-point star in the centre. */
export const FLAG_VN = svg(
  '<rect width="30" height="20" fill="#DA251D"/>' +
    '<polygon fill="#FFFF00" points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15"/>',
);

/** China (简体中文): red field, one large and four small yellow stars (small ones face the large one). */
export const FLAG_CN = svg(
  '<rect width="30" height="20" fill="#EE1C25"/><g fill="#FFFF00">' +
    '<polygon points="5,2 5.67,4.07 7.85,4.07 6.09,5.35 6.76,7.43 5,6.15 3.24,7.43 3.91,5.35 2.15,4.07 4.33,4.07"/>' +
    '<polygon points="9.14,2.51 9.62,1.97 9.25,1.34 9.91,1.63 10.39,1.08 10.33,1.8 11,2.09 10.29,2.25 10.22,2.97 9.85,2.35"/>' +
    '<polygon points="11.01,4.14 11.66,3.82 11.56,3.1 12.07,3.62 12.72,3.3 12.38,3.95 12.88,4.47 12.17,4.34 11.83,4.99 11.73,4.27"/>' +
    '<polygon points="11.04,6.73 11.76,6.7 11.96,6 12.21,6.68 12.94,6.66 12.37,7.1 12.62,7.79 12.01,7.38 11.44,7.83 11.64,7.13"/>' +
    '<polygon points="9.22,8.38 9.9,8.63 10.35,8.06 10.32,8.79 11,9.05 10.3,9.24 10.26,9.96 9.87,9.36 9.16,9.55 9.62,8.98"/>' +
    '</g>',
);
