import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getConfig } = require('expo/config');
const { load } = require('@expo/env');
const { prepareReleaseGradle } = require('../plugins/with-android-release.cjs');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const variables = [
  'ROLLERSMAPS_ANDROID_KEYSTORE_PATH',
  'ROLLERSMAPS_ANDROID_KEY_ALIAS',
  'ROLLERSMAPS_ANDROID_STORE_PASSWORD',
  'ROLLERSMAPS_ANDROID_KEY_PASSWORD',
  'GOOGLE_MAPS_ANDROID_API_KEY',
];

try {
  load(projectRoot, { silent: true });
  const missing = variables.filter((name) => !process.env[name]);
  if (missing.length) throw new Error('Faltan variables de entorno: ' + missing.join(', ') + '.');
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(process.env.GOOGLE_MAPS_ANDROID_API_KEY)) {
    throw new Error('GOOGLE_MAPS_ANDROID_API_KEY no tiene formato de clave Google.');
  }
  const keystorePath = path.resolve(process.env.ROLLERSMAPS_ANDROID_KEYSTORE_PATH);
  if (!fs.existsSync(keystorePath) || !fs.statSync(keystorePath).isFile()) {
    throw new Error('No se encuentra la clave de carga indicada.');
  }
  const realKeystorePath = fs.realpathSync(keystorePath);
  const relativeKeyPath = path.relative(fs.realpathSync(projectRoot), realKeystorePath);
  if (relativeKeyPath === '' || (!relativeKeyPath.startsWith('..' + path.sep) && !path.isAbsolute(relativeKeyPath))) {
    throw new Error('Guarda la clave de carga fuera de la carpeta del proyecto y de Git.');
  }
  const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: true });
  if (exp.version !== '1.0.0' || exp.android?.versionCode !== 32 || exp.android?.package !== 'cl.santiagorollers.rollersmaps') {
    throw new Error('Configura version 1.0.0, versionCode 32 y el paquete cl.santiagorollers.rollersmaps.');
  }
  const mapsPlugin = exp.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-maps');
  const mapsConfigured = mapsPlugin?.[1]?.androidGoogleMapsApiKey === process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
    exp.android?.config?.googleMaps?.apiKey === process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!mapsConfigured || exp.extra?.googleMapsAndroidEnabled !== true) throw new Error('La configuracion Expo no habilita Google Maps con la clave Android indicada.');

  if (process.argv.includes('--write-native')) {
    const gradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
    if (!fs.existsSync(gradlePath)) throw new Error('Genera Android con Expo prebuild antes de preparar la firma.');
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/versionCode \d+/, 'versionCode 32').replace(/versionName "[^"]+"/, 'versionName "1.0.0"');
    gradle = prepareReleaseGradle(gradle, { googleMapsAndroidEnabled: exp.extra?.googleMapsAndroidEnabled === true });
    fs.writeFileSync(gradlePath, gradle);
  }
  console.log('Preparacion Android 1.0.0 (32) verificada. La firma privada se valida tambien en Gradle.');
} catch (error) {
  // Errors contain variable names or configuration instructions, never their values.
  console.error(error instanceof Error ? error.message : 'No se pudo validar la configuracion Android.');
  process.exitCode = 1;
}
