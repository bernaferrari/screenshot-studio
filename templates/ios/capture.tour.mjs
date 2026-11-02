// {{name}}'s App Store screens, captured on the iOS simulator. `npx screenshot-studio recapture --boot` builds the
// app for the simulator (studio.json → capture), boots each profile's simulator (profiles.json "simulator"), runs this
// in every language and theme, and exports. Alone: npx screenshot-studio tour [--profile iphone]. See what to tap:
// npx screenshot-studio screen --simulator "iPhone 17 Pro Max".

/** @type {import('screenshot-studio').Tour} */
export default {
  app: '{{package}}',
  // Each theme starts the app afresh; its debug or capture build fills itself with fictional sample data. Launch
  // extras arrive as UserDefaults (`extras: {screenshotScene: 'home'}` → -screenshotScene home), in the capture's language.
  start: d => d.launch({extras: {screenshotScene: 'home'}}),
  scenes: {
    light: {
      '01-hero': null,                         // the screen the app opens on
      '02-second': d => d.tap('Settings'),     // tap by the text on screen, in the default language
    },
    dark: {
      '03-hero-dark': null,
    },
  },
};
