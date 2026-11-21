// Test-only audio schedules for the independent scheduling and HTTP contracts.
// The Real Music edition intentionally ships no copyrighted or fake audio files.
// These URLs are simulated by Node unit tests and are NOT packaged as media.
export const syntheticPrograms = Object.fromEntries(
  ['flash-fm', 'cocoteo-fm', 'back-country', 'the-chamber', 'dirty-south', 'afro-bank'].map(
    (slug) => [
      slug,
      [1, 2].map((n) => ({
        id: `${slug}-${n}`,
        title: `Test cut ${n}`,
        artist: 'Automated test fixture',
        duration: n === 1 ? 17 : 31,
        url: `/audio/${slug}-${n}.mp3`,
      })),
    ],
  ),
);
