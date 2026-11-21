const { withAppBuildGradle, withProjectBuildGradle, withGradleProperties } = require('expo/config-plugins');

const START = '// @generated begin rollersmaps-release';
const END = '// @generated end rollersmaps-release';
const NATIVE_START = '// @generated begin rollersmaps-native-job-pools';
const NATIVE_END = '// @generated end rollersmaps-native-job-pools';

// AGP invokes Ninja directly, so CMAKE_BUILD_PARALLEL_LEVEL alone does not limit
// its jobs. Apply pools to every Android module, including react-native-screens.
const NATIVE_CONFIGURATION = `
${NATIVE_START}
subprojects { rmNativeProject ->
    def rmConfigureCmakePools = {
        def rmAndroidExtension = rmNativeProject.extensions.getByName('android')
        rmAndroidExtension.defaultConfig.externalNativeBuild.cmake.arguments.addAll([
            '-DCMAKE_JOB_POOLS=rm_compile=1;rm_link=1',
            '-DCMAKE_JOB_POOL_COMPILE=rm_compile',
            '-DCMAKE_JOB_POOL_LINK=rm_link'
        ])
    }
    rmNativeProject.pluginManager.withPlugin('com.android.application') { rmConfigureCmakePools() }
    rmNativeProject.pluginManager.withPlugin('com.android.library') { rmConfigureCmakePools() }
}
${NATIVE_END}
`;

// Gradle reads signing material only from the process environment. No password
// or private key is serialized into the generated project or Expo app config.
const RELEASE_CONFIGURATION = `
${START}
def rmSigning = [
    path: System.getenv('ROLLERSMAPS_ANDROID_KEYSTORE_PATH'),
    alias: System.getenv('ROLLERSMAPS_ANDROID_KEY_ALIAS'),
    storePassword: System.getenv('ROLLERSMAPS_ANDROID_STORE_PASSWORD'),
    keyPassword: System.getenv('ROLLERSMAPS_ANDROID_KEY_PASSWORD')
]
def rmSigningReady = rmSigning.values().every { it != null && !it.isEmpty() }
def rmGoogleMapsAndroidEnabled = __ROLLERSMAPS_MAPS_ENABLED__
android.signingConfigs.create('rollersMapsRelease') {
    if (rmSigningReady) {
        storeFile file(rmSigning.path)
        storePassword rmSigning.storePassword
        keyAlias rmSigning.alias
        keyPassword rmSigning.keyPassword
    }
}
android.buildTypes.release.signingConfig = android.signingConfigs.rollersMapsRelease
android.buildTypes.release.ndk.debugSymbolLevel = 'SYMBOL_TABLE'

// Fail at configuration time, including when Gradle is invoked directly.
def rmValidateRelease = {
    if (project.hasProperty('rollersMapsPreview') || android.buildTypes.release.applicationIdSuffix) {
        throw new GradleException('RollersMaps 1.0: la compilacion comercial no admite un paquete preview ni un sufijo de aplicacion.')
    }
    if (android.defaultConfig.applicationId != 'cl.santiagorollers.rollersmaps' ||
        android.defaultConfig.versionName != '1.0.0' || android.defaultConfig.versionCode != 32) {
        throw new GradleException('RollersMaps 1.0: revisa paquete, versionName 1.0.0 y versionCode 32.')
    }
    if (!rmSigningReady) {
        throw new GradleException('RollersMaps 1.0: faltan las variables de firma. Usa scripts/build-android-release.ps1 con tu clave de carga.')
    }
    def rmKeyFile = file(rmSigning.path).canonicalFile
    if (!rmKeyFile.isFile() || rmKeyFile.toPath().startsWith(file(projectRoot).canonicalFile.toPath())) {
        throw new GradleException('RollersMaps 1.0: la clave de carga debe existir fuera de la carpeta del proyecto.')
    }
    def rmMapsKey = System.getenv('GOOGLE_MAPS_ANDROID_API_KEY')
    if (!rmMapsKey || !(rmMapsKey ==~ /AIza[0-9A-Za-z_-]{35}/)) {
        throw new GradleException('RollersMaps 1.0: falta GOOGLE_MAPS_ANDROID_API_KEY valida y restringida.')
    }
    def rmNativeManifest = new groovy.xml.XmlSlurper(false, false).parse(file('src/main/AndroidManifest.xml'))
    def rmNativeMapsKey = rmNativeManifest.application.'meta-data'.find {
        it.attributes()['android:name'] == 'com.google.android.geo.API_KEY'
    }.attributes()['android:value']
    if (!rmGoogleMapsAndroidEnabled || rmNativeMapsKey != rmMapsKey) {
        throw new GradleException('RollersMaps 1.0: vuelve a generar Android con tu clave Maps. La configuracion nativa y el mapa de la app no coinciden.')
    }
    try {
        def rmKeyStore = java.security.KeyStore.getInstance(rmKeyFile, rmSigning.storePassword.toCharArray())
        def rmCert = rmKeyStore.getCertificate(rmSigning.alias)
        if (!(rmCert instanceof java.security.cert.X509Certificate) ||
            rmCert.subjectX500Principal.name.toLowerCase().contains('cn=android debug') ||
            !(rmKeyStore.getKey(rmSigning.alias, rmSigning.keyPassword.toCharArray()) instanceof java.security.PrivateKey)) {
            throw new IllegalArgumentException('invalid release key')
        }
    } catch (Exception ignored) {
        throw new GradleException('RollersMaps 1.0: la clave privada no es valida para distribucion. No se permite la firma Android Debug.')
    }
}
if (gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }) rmValidateRelease()
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') }) rmValidateRelease()
}
${END}
`;

function prepareReleaseGradle(contents, { googleMapsAndroidEnabled = false } = {}) {
  if (!contents.includes('com.android.application') || !contents.includes('android {')) {
    throw new Error('Estructura Gradle no reconocida; no se modifica la firma.');
  }
  const start = contents.indexOf(START);
  const end = contents.indexOf(END);
  if ((start === -1) !== (end === -1) || (end !== -1 && end < start)) {
    throw new Error('Bloque de firma incompleto; revisa Android antes de compilar.');
  }
  const withoutBlock = start === -1 ? contents : contents.slice(0, start) + contents.slice(end + END.length);
  return withoutBlock.trimEnd() + '\n' + RELEASE_CONFIGURATION.replace('__ROLLERSMAPS_MAPS_ENABLED__', googleMapsAndroidEnabled ? 'true' : 'false');
}

function prepareNativeJobPoolsGradle(contents) {
  const start = contents.indexOf(NATIVE_START);
  const end = contents.indexOf(NATIVE_END);
  if ((start === -1) !== (end === -1) || (end !== -1 && end < start)) {
    throw new Error('Bloque CMake incompleto; revisa Android antes de compilar.');
  }
  const withoutBlock = start === -1 ? contents : contents.slice(0, start) + contents.slice(end + NATIVE_END.length);
  // ReactRootProjectPlugin calls evaluationDependsOn(":app"). Register callbacks
  // before either root plugin can evaluate :app and finalize its CMake arguments.
  const insertionPoint = withoutBlock.search(/^apply plugin:\s*["'](?:expo-root-project|com\.facebook\.react\.rootproject)["']/m);
  if (insertionPoint === -1) {
    throw new Error('No se encontro el plugin raiz de Expo/React Native; no se aplica el limite CMake fuera de orden.');
  }
  return withoutBlock.slice(0, insertionPoint).trimEnd() + '\n' + NATIVE_CONFIGURATION + '\n' + withoutBlock.slice(insertionPoint).trimStart();
}

module.exports = function withAndroidRelease(config) {
  config = withGradleProperties(config, (mod) => {
    for (const key of ['android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds']) {
      mod.modResults = mod.modResults.filter((entry) => entry.type !== 'property' || entry.key !== key);
      mod.modResults.push({ type: 'property', key, value: 'true' });
    }
    return mod;
  });
  config = withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('El plugin de limites CMake requiere Android Gradle en Groovy.');
    }
    mod.modResults.contents = prepareNativeJobPoolsGradle(mod.modResults.contents);
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('El plugin de firma requiere Android Gradle en Groovy.');
    }
    mod.modResults.contents = prepareReleaseGradle(mod.modResults.contents, { googleMapsAndroidEnabled: mod.extra?.googleMapsAndroidEnabled === true });
    return mod;
  });
};
module.exports.prepareReleaseGradle = prepareReleaseGradle;
module.exports.prepareNativeJobPoolsGradle = prepareNativeJobPoolsGradle;
