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

/** France (Français): blue / white / red vertical bands. */
export const FLAG_FR = svg(
  '<rect width="10" height="20" fill="#002395"/><rect x="10" width="10" height="20" fill="#fff"/>' +
    '<rect x="20" width="10" height="20" fill="#ED2939"/>',
);

/** Germany (Deutsch): black / red / gold horizontal bands. */
export const FLAG_DE = svg(
  '<rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#D00"/>' +
    '<rect y="13.33" width="30" height="6.67" fill="#FFCE00"/>',
);

/** Brazil (Português): green field, yellow diamond, blue globe with a white band. */
export const FLAG_BR = svg(
  '<rect width="30" height="20" fill="#009C3B"/>' +
    '<polygon points="15,2 28,10 15,18 2,10" fill="#FFDF00"/>' +
    '<circle cx="15" cy="10" r="4" fill="#002776"/>' +
    '<path d="M11.2 10.8 Q15 8.6 18.8 10.8" fill="none" stroke="#fff" stroke-width="1.1"/>',
);

/** Italy (Italiano): green / white / red vertical bands. */
export const FLAG_IT = svg(
  '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/>' +
    '<rect x="20" width="10" height="20" fill="#CE2B37"/>',
);

/** Netherlands (Nederlands): red / white / blue horizontal bands. */
export const FLAG_NL = svg(
  '<rect width="30" height="6.67" fill="#AE1C28"/><rect y="6.67" width="30" height="6.67" fill="#fff"/>' +
    '<rect y="13.33" width="30" height="6.67" fill="#21468B"/>',
);

/** Poland (Polski): white over red. */
export const FLAG_PL = svg(
  '<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#DC143C"/>',
);

/** Turkey (Türkçe): red field, white crescent and star. */
export const FLAG_TR = svg(
  '<rect width="30" height="20" fill="#E30A17"/>' +
    '<circle cx="11" cy="10" r="5" fill="#fff"/>' +
    '<circle cx="12.4" cy="10" r="4" fill="#E30A17"/>' +
    '<polygon fill="#fff" points="17.2,10 18.9,10.55 18.25,8.85 19.9,8.3 18.05,8.3 17.2,6.6 16.35,8.3 14.5,8.3 16.15,8.85 15.5,10.55"/>',
);

/** Indonesia (Bahasa Indonesia): red over white. */
export const FLAG_ID = svg(
  '<rect width="30" height="10" fill="#FF0000"/><rect y="10" width="30" height="10" fill="#fff"/>',
);

/** Philippines (Filipino): blue / red horizontal with white triangle, sun and stars. */
export const FLAG_PH = svg(
  '<rect width="30" height="10" fill="#0038A8"/><rect y="10" width="30" height="10" fill="#CE1126"/>' +
    '<polygon points="0,0 12,10 0,20" fill="#fff"/>' +
    '<circle cx="5" cy="10" r="2.2" fill="#FCD116"/>' +
    '<circle cx="5" cy="4.2" r="0.7" fill="#FCD116"/>' +
    '<circle cx="1.8" cy="12.5" r="0.7" fill="#FCD116"/>' +
    '<circle cx="8.2" cy="12.5" r="0.7" fill="#FCD116"/>',
);

/** Sweden (Svenska): blue field with a yellow Nordic cross. */
export const FLAG_SE = svg(
  '<rect width="30" height="20" fill="#005293"/>' +
    '<rect x="9" width="4" height="20" fill="#FECB00"/>' +
    '<rect y="8" width="30" height="4" fill="#FECB00"/>',
);

/** Russia: white / blue / red horizontal bands. */
export const FLAG_RU = svg(
  '<rect width="30" height="6.67" fill="#fff"/><rect y="6.67" width="30" height="6.67" fill="#0039A6"/>' +
    '<rect y="13.33" width="30" height="6.67" fill="#D52B1E"/>',
);

/** Ukraine: blue over yellow. */
export const FLAG_UA = svg(
  '<rect width="30" height="10" fill="#0057B7"/><rect y="10" width="30" height="10" fill="#FFD700"/>',
);

/** Japan: white field, red disc. */
export const FLAG_JP = svg(
  '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5.2" fill="#BC002D"/>',
);

/** South Korea: white field, taegeuk, four black trigrams (simplified). */
export const FLAG_KR = svg(
  '<rect width="30" height="20" fill="#fff"/>' +
    '<circle cx="15" cy="10" r="4.2" fill="#CD2E3A"/>' +
    '<path d="M15 10a4.2 4.2 0 0 1 0 0.01A4.2 4.2 0 1 1 15 5.8Z" fill="#0047A0"/>' +
    '<g stroke="#000" stroke-width="1.1" stroke-linecap="square" fill="none">' +
    '<path d="M5.2 3.2l2.4 2.4M4.2 4.8l3.2 0.2M6.4 2.4l0.2 3.2"/>' +
    '<path d="M24.8 3.2l-2.4 2.4M25.8 4.8l-3.2 0.2M23.6 2.4l-0.2 3.2"/>' +
    '<path d="M5.2 16.8l2.4-2.4M4.2 15.2l3.2-0.2M6.4 17.6l0.2-3.2"/>' +
    '<path d="M24.8 16.8l-2.4-2.4M25.8 15.2l-3.2-0.2M23.6 17.6l-0.2-3.2"/>' +
    '</g>',
);

/** India: saffron / white / green with navy Ashoka Chakra (simplified). */
export const FLAG_IN = svg(
  '<rect width="30" height="6.67" fill="#FF9933"/><rect y="6.67" width="30" height="6.67" fill="#fff"/>' +
    '<rect y="13.33" width="30" height="6.67" fill="#138808"/>' +
    '<circle cx="15" cy="10" r="2.4" fill="none" stroke="#000080" stroke-width="0.7"/>' +
    '<circle cx="15" cy="10" r="0.45" fill="#000080"/>',
);

/** Thailand: red / white / blue / white / red horizontal bands. */
export const FLAG_TH = svg(
  '<rect width="30" height="3.33" fill="#A51931"/><rect y="3.33" width="30" height="3.33" fill="#fff"/>' +
    '<rect y="6.66" width="30" height="6.68" fill="#2D2A4A"/>' +
    '<rect y="13.34" width="30" height="3.33" fill="#fff"/><rect y="16.67" width="30" height="3.33" fill="#A51931"/>',
);
