// Test stand-in for expo-sharing (native-only).
module.exports = {
  isAvailableAsync: async () => false,
  shareAsync: async () => {},
};
