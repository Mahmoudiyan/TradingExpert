// Fetch polyfill for kucoin-node-sdk compatibility
// This must run before any SDK code executes
// The SDK does: const fetch = require('node-fetch')
// So we need to ensure require('node-fetch') returns a function

// CRITICAL: Patch require to ensure node-fetch returns correctly when SDK requires it
// This must happen BEFORE the SDK module is loaded
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module')
const originalRequire = Module.prototype.require

Module.prototype.require = function(id: string) {
  // When SDK requires 'node-fetch', intercept and return our shim
  if (id === 'node-fetch' || id.endsWith('node-fetch')) {
    try {
      // Try to require our shim first
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const shimPath = require.resolve('../lib/node-fetch-shim.js')
        const shimFetch = originalRequire.call(this, shimPath)
        if (typeof shimFetch === 'function') {
          return shimFetch
        }
      } catch (shimError) {
        // Shim not found, fall back to original
      }
      
      // Fallback to original node-fetch
      const nodeFetch = originalRequire.call(this, id)
      // Ensure we return a function
      if (typeof nodeFetch === 'function') {
        return nodeFetch
      } else if (nodeFetch && typeof nodeFetch.default === 'function') {
        return nodeFetch.default
      } else if (nodeFetch && typeof nodeFetch.fetch === 'function') {
        return nodeFetch.fetch
      }
      return nodeFetch
    } catch (e) {
      console.error('Error requiring node-fetch in polyfill:', e)
      throw e
    }
  }
  return originalRequire.call(this, id)
}

// Also set up global fetch for good measure
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFetch = require('node-fetch')
  
  // Get the actual fetch function
  let fetchImpl: typeof fetch | ((...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>)
  if (typeof nodeFetch === 'function') {
    fetchImpl = nodeFetch
  } else if (nodeFetch && typeof nodeFetch.default === 'function') {
    fetchImpl = nodeFetch.default
  } else if (nodeFetch && typeof nodeFetch.fetch === 'function') {
    fetchImpl = nodeFetch.fetch
  } else {
    fetchImpl = nodeFetch
  }
  
  // Set global fetch
  globalThis.fetch = fetchImpl
  if (typeof global !== 'undefined') {
    global.fetch = fetchImpl
  }
  
  // IMPORTANT: Don't overwrite Response/Request/Headers classes
  // Next.js needs the native Response.json() static method which node-fetch's Response doesn't have
  // The SDK only needs fetch() to work - it doesn't need these global classes
  // So we skip setting them to preserve Next.js's native implementations
} catch (e) {
  console.error('Failed to setup fetch polyfill:', e)
}

