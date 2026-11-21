const { withEntitlementsPlist } = require('expo/config-plugins');

// expo-widgets 57.0.23 adds APNs even when remote updates are disabled.
// Our Live Activity is updated by local GPS; preserve all other entitlements.
module.exports = function withLocalLiveActivity(config) {
  const widgets = config.plugins?.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-widgets');
  if (widgets?.[1]?.enablePushNotifications !== false) return config;
  return withEntitlementsPlist(config, mod => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
};
