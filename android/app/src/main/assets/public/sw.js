/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "e8a1c0ea5857c7c7dbc20cc67b42f5f5"
  }, {
    "url": "pwa-512x512.png",
    "revision": "fa3cd9e17e5f9edd1295e7994e8053ab"
  }, {
    "url": "pwa-192x192.png",
    "revision": "461e3d079dbe4033f0541e4a066f4424"
  }, {
    "url": "index.html",
    "revision": "ed6370717880ba678a7f85a9ebc6f48c"
  }, {
    "url": "icon.svg",
    "revision": "de3825fdeaffe99000bb989fa4bd5ac5"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "94961e4b989ce6037ddd9f194f7b47e4"
  }, {
    "url": "assets/workbox-window.prod.es5-BBnX5xw4.js",
    "revision": null
  }, {
    "url": "assets/virtual_pwa-register-DmvzJaAi.js",
    "revision": null
  }, {
    "url": "assets/index-DFdndDiJ.css",
    "revision": null
  }, {
    "url": "assets/index-8-ApKYDz.js",
    "revision": null
  }, {
    "url": "_headers",
    "revision": "cf29f60707d30bf35da6ff9031770a34"
  }, {
    "url": "_redirects",
    "revision": "ea91721b625ee1760e5368ace2014144"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "94961e4b989ce6037ddd9f194f7b47e4"
  }, {
    "url": "icon.svg",
    "revision": "de3825fdeaffe99000bb989fa4bd5ac5"
  }, {
    "url": "pwa-192x192.png",
    "revision": "461e3d079dbe4033f0541e4a066f4424"
  }, {
    "url": "pwa-512x512.png",
    "revision": "fa3cd9e17e5f9edd1295e7994e8053ab"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "e8a1c0ea5857c7c7dbc20cc67b42f5f5"
  }, {
    "url": "manifest.webmanifest",
    "revision": "e0c55acddf57a534fb1a711018f88583"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
