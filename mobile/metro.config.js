// Metro for the Verso mobile app. The app shares pure TypeScript logic with
// the web app (../src: songs, lyric timing, dictionaries, quizzes, rooms
// rules), so Metro watches that folder too. Any package a shared file imports
// resolves from this app's node_modules, so there is only ever one React.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../src");
config.watchFolders = [...(config.watchFolders ?? []), shared];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

const isPackage = (name) => !name.startsWith(".") && !name.startsWith("/") && !name.startsWith("@/") && !name.startsWith("@shared/");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath.startsWith(shared + path.sep) && isPackage(moduleName)) {
    return context.resolveRequest({ ...context, originModulePath: path.join(__dirname, "package.json") }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
