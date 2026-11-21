const { withAppBuildGradle, withMainApplication } = require('expo/config-plugins');

const GRADLE_START = '// @generated begin rollersmaps-standalone-test';
const GRADLE_END = '// @generated end rollersmaps-standalone-test';
const HOST_START = '// @generated begin rollersmaps-standalone-test-host';
const HOST_END = '// @generated end rollersmaps-standalone-test-host';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withoutGeneratedBlock(contents, start, end) {
  const starts = contents.split(start).length - 1;
  const ends = contents.split(end).length - 1;
  if (starts !== ends || starts > 1) throw new Error('Bloque de APK de prueba incompleto o duplicado.');
  if (!starts) return contents;
  const block = new RegExp('^[ \\t]*' + escapeRegExp(start) + '\\r?\\n[\\s\\S]*?^[ \\t]*' + escapeRegExp(end) + '(?:\\r?\\n|$)', 'gm');
  const result = contents.replace(block, '');
  if (result.includes(start) || result.includes(end)) throw new Error('No se pudo reconocer el bloque del APK de prueba.');
  return result;
}

function prepareTestApkGradle(contents) {
  if (!contents.includes('com.android.application') || !contents.includes('android {') || !contents.includes('react {')) {
    throw new Error('Estructura Gradle no reconocida para el APK de prueba.');
  }
  const original = withoutGeneratedBlock(contents, GRADLE_START, GRADLE_END);
  return original.trimEnd() + `

${GRADLE_START}
// Opt in only for an installable test APK. Ordinary debug still uses Metro.
def rmStandaloneTest = project.hasProperty('rollersMapsStandaloneTest') &&
    (project.property('rollersMapsStandaloneTest').toString().isEmpty() ||
     project.property('rollersMapsStandaloneTest').toString().toBoolean())
android.defaultConfig.buildConfigField 'boolean', 'ROLLERSMAPS_STANDALONE_TEST', rmStandaloneTest.toString()
if (rmStandaloneTest) {
    // RN registers a production JS/Hermes bundle for variants outside this list.
    react {
        debuggableVariants = []
    }
}
${GRADLE_END}
`;
}

function prepareTestApkMainApplication(contents) {
  const original = withoutGeneratedBlock(contents, HOST_START, HOST_END);
  if ((original.match(/ExpoReactHostFactory\.getDefaultReactHost\(/g) ?? []).length !== 1 || /useDevSupport\s*=/.test(original)) {
    throw new Error('Revisar ExpoReactHostFactory antes de configurar el APK de prueba.');
  }
  const anchor = /(ExpoReactHostFactory\.getDefaultReactHost\(\s*\r?\n)([ \t]*)(context\s*=\s*applicationContext,)(\r?\n)/;
  if (!anchor.test(original)) throw new Error('No se encontro el argumento context de ExpoReactHostFactory.');
  return original.replace(anchor, (_match, opening, indent, context, newline) =>
    opening + indent + context + newline +
    indent + HOST_START + newline +
    indent + 'useDevSupport = BuildConfig.DEBUG && !BuildConfig.ROLLERSMAPS_STANDALONE_TEST,' + newline +
    indent + HOST_END + newline);
}

module.exports = function withAndroidTestApk(config) {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('El APK de prueba requiere Gradle Groovy.');
    mod.modResults.contents = prepareTestApkGradle(mod.modResults.contents);
    return mod;
  });
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('El APK de prueba requiere MainApplication Kotlin de Expo 57.');
    mod.modResults.contents = prepareTestApkMainApplication(mod.modResults.contents);
    return mod;
  });
};
module.exports.prepareTestApkGradle = prepareTestApkGradle;
module.exports.prepareTestApkMainApplication = prepareTestApkMainApplication;
