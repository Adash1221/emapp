// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration
 * https://docs.expo.dev/guides/customizing-metro/
 */

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Optional: Add support for additional asset file extensions
// Example: SQLite database files
// config.resolver.assetExts.push('db');

// Example: Other custom assets (fonts, documents, etc.)
// config.resolver.assetExts.push('ttf', 'otf', 'pdf', 'xml', 'csv');

module.exports = config;