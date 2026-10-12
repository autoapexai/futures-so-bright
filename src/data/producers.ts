/**
 * PRODUCERS screen: everyone who gives time, talent or treasure is a producer of the game.
 * Add names here (first name + last initial by default, for privacy; never a kid's name unless a
 * grown-up says yes).
 * Stored OLDEST to NEWEST: append new producers at the end. The screen shows them newest first.
 */
export const PRODUCERS: string[] = ['Kara Bilthouse', 'Kirby Maquez'];

/** Newest first, for display. */
export const producersNewestFirst = (): string[] => [...PRODUCERS].reverse();

/** The one credit line at the top of the PRODUCERS screen. */
export const CREATED_BY = 'Created by Dan Bilthouse';
