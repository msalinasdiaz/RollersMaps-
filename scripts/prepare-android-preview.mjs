// Only touches Expo's generated, ignored Android project. Stable source identity stays intact.
import fs from 'node:fs';
const path = 'android/app/build.gradle';
if (!fs.existsSync(path)) throw Error('Genera primero Android con Expo prebuild.');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
let gradle = fs.readFileSync(path, 'utf8');
gradle = gradle.replace(/versionCode \d+/, `versionCode ${app.android.versionCode}`)
  .replace(/versionName "[^"]+"/, `versionName "${app.version}"`);
if (!gradle.includes('project.hasProperty("rollersMapsPreview")')) {
  if (!gradle.includes('        release {')) throw Error('Revisar la estructura Gradle antes de preparar la vista previa.');
  gradle = gradle.replace('        release {', '        release {\n            if (project.hasProperty("rollersMapsPreview")) { applicationIdSuffix ".preview" }');
}
fs.writeFileSync(path, gradle);
console.log('Android preparado: usa -ProllersMapsPreview=true para una instalación separada.');
