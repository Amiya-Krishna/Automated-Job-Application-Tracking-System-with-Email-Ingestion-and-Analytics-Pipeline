// Test stand-in for expo-file-system/legacy (native-only).
const EncodingType = { Base64: 'base64' };
module.exports = {
  cacheDirectory: 'file:///cache/',
  EncodingType,
  writeAsStringAsync: async () => {},
};
