// Shim module for node-fetch
// This ensures the SDK gets a function when it requires('node-fetch')
// IMPORTANT: This file will be aliased by webpack, so we need to require the REAL node-fetch
// using a path that bypasses webpack resolution

const path = require('path');
const Module = require('module');

// Get the actual node-fetch from node_modules, bypassing webpack aliases
// We use Module._resolveFilename to get the real path, then require it directly
const nodeFetchPath = Module._resolveFilename('node-fetch', {
  paths: Module._nodeModulePaths(process.cwd()),
  parent: module.parent
});

// Clear from cache to force fresh load
delete require.cache[nodeFetchPath];

// Now require the real node-fetch
const nodeFetch = require(nodeFetchPath);

// node-fetch v2 exports the function directly
// Ensure we always return a function
let fetchFunction;
if (typeof nodeFetch === 'function') {
  fetchFunction = nodeFetch;
} else if (nodeFetch && typeof nodeFetch.default === 'function') {
  fetchFunction = nodeFetch.default;
} else if (nodeFetch && typeof nodeFetch.fetch === 'function') {
  fetchFunction = nodeFetch.fetch;
} else {
  // Last resort: return what we got
  fetchFunction = nodeFetch;
}

// Export as both default and named
module.exports = fetchFunction;
module.exports.default = fetchFunction;

// Also export all the other properties from node-fetch (Headers, Request, Response, etc.)
if (nodeFetch && typeof nodeFetch === 'object') {
  Object.keys(nodeFetch).forEach(key => {
    if (key !== 'default' && key !== 'fetch') {
      module.exports[key] = nodeFetch[key];
    }
  });
}

