/**
 * The only version label players see: 'Iteration N', N = `git rev-list --count HEAD` of the commit
 * being built (vite.config.ts define). package.json keeps its own semver for tooling only.
 */
export const BUILD_ITERATION: string = __BUILD_ITERATION__;
