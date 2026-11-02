// {{name}}'s store screens, captured on the emulator. `npx screenshot-studio recapture --boot` builds the capture
// app (studio.json → capture), boots the emulator, runs this for every language, device size and theme, and exports.
// Alone: npx screenshot-studio tour [--profile phone]. See what to tap: npx screenshot-studio screen.

/** @type {import('screenshot-studio').Tour} */
export default {
  app: '{{package}}.storecapture',
  activity: '.MainActivity',
  scenes: {
    // Each scene says how to reach its screen from the one before; the studio saves it as <profile>/<scene>.png.
    // Every theme starts from a fresh launch.
    light: {
      '01-hero': null,                         // the screen the app opens on
      '02-second': d => d.tap('Settings'),     // tap by the text on screen, in the default language
    },
    dark: {
      '03-hero-dark': null,
    },
  },
};
