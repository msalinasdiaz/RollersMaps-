/** Google Maps is enabled only when the native Android key is configured. */
module.exports = ({ config }) => {
  const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  return {
    ...config,
    plugins: [
      // Expo applies entitlement mods in reverse order. Run ours after expo-widgets.
      './plugins/with-local-live-activity.cjs',
      ...(config.plugins ?? []),
      ['react-native-maps', apiKey ? { androidGoogleMapsApiKey: apiKey } : {}],
      './plugins/with-android-release.cjs',
      './plugins/with-android-test-apk.cjs',
    ],
    extra: {
      ...config.extra,
      googleMapsAndroidEnabled: Boolean(apiKey),
    },
  };
};
