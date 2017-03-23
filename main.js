/*jslint browser: true*/
/*global Tangram, gui */

// Feature detects object. Currently only does webgl.
// Influenced by https://github.com/viljamis/feature.js/
var detects = {
    webgl: (function () {
        try {
            var canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
        } catch (x) {
            return false;
        }
    })()
}

function parseQuery (qstr) {
    var query = {};
    var a = qstr.split('&');
    for (var i in a) {
        var b = a[i].split('=');
        query[decodeURIComponent(b[0])] = decodeURIComponent(b[1]);
    }
    return query;
}

var query, scene_url;
var minz = 1;
var maxz = 22;
var maxbounds;
var legacyLeaflet = false;
var DEMO_API_KEY = 'search-PFZ8iFx';

load = (function load() {
    if (detects.webgl === false) {
        displayNoWebGLMessage();
        return;
    }

    /*** URL parsing ***/
    // determine the version of Tangram, scene url, and content to load during start-up
    scene_url = 'scene.yaml';
    var default_scene_lib = '0.11';
    var scene_lib = default_scene_lib;
    var build = "min";
    query = parseQuery(window.location.search.slice(1));
    if (query.scene) {
        // ?scene= is the parameter used by Tangram Play
        scene_url = query.scene;
    } else if (query.url) {
        scene_url = query.url;
    }
    if (query.lib) {
        scene_lib = query.lib;
    }
    if (query.debug) {
        build = "debug";
    }
    if (query.minz) {
        minz = query.minz;
    }
    if (query.maxz) {
        maxz = query.maxz;
    }
    if (query.maxbounds) {
        var a = query.maxbounds.split(',');
        maxbounds = [[a[0],a[1]],[a[2],a[3]]];
    }

    if (scene_lib.indexOf("/") > -1) {
        // assume it's a full path
        // check that it's a tangram library on a whitelisted domain
        if (scene_lib.match(/^https?:\/\/(.*mapzen.com|localhost)(:[0-9]+)?\/.*tangram\.(min|debug)\.js$/)) {
            var lib_url = scene_lib;

            // Check if it's a version 0.8 or lower, which uses Leaflet@1.0.0-beta.2
            var version = lib_url.match(/\d+.\d+(?:.\d+)?/);
            if (version && version.length > 0) {
              var v = parseVersionString(version[0]);
              if (v.major < 1 && v.minor < 8) {
                  legacyLeaflet = true;
              }
            }
        } else {
            // noooo you don't
            console.log('lib param error:', scene_lib, "is not a valid tangram library, defaulting to " + default_scene_lib);
            scene_lib = default_scene_lib;
        }
    }
    if (scene_lib.indexOf("/") == -1) {
        // assume it's a version # only
        lib_url = "https://mapzen.com/tangram/"+scene_lib+"/tangram."+build+".js";

        // Check if it's a version 0.8 or lower, which uses Leaflet@1.0.0-beta.2
        var v = parseVersionString(scene_lib);
        if (v.major < 1 && v.minor < 8) {
            legacyLeaflet = true;
        }
    }
    if (query.gist) {
        // read and interpret gist, also pass lib_url to load later
        parseGist(query.gist, lib_url);
    } else {
        // loadAllLibraries right away
        loadAllLibraries(lib_url);
    }
}());

function getGistURL(url) {
    var gistIdRegexp = /\/\/(?:(?:gist.github.com|gist.githubusercontent.com)(?:\/[A-Za-z0-9_-]+){0,1}|api.github.com\/gists)\/([a-z0-9]+)(?:$|\/|.)/;
    // The last capture group of the RegExp should be the gistID
    var gistId = url.match(gistIdRegexp).pop();
    return 'https://api.github.com/gists/' + gistId;
}

function parseGist(url, lib_url) {
    var lib = lib_url;
    var gist = getGistURL(url);
    readTextFile(gist, function(text){
        // parse API response data
        try {
            data = JSON.parse(text);
        } catch(e) {
            console.warn('Error parsing json:', e);
            return false;
        }
        // extract scene yaml from gist data
        try {
            scene_url = data.files['scene.yaml'].raw_url;
            loadAllLibraries(lib);
        } catch (e) {
            console.error(e);
            return false;
        }
    });
}

// load a file from a URL
function readTextFile(file, callback) {
    var rawFile = new XMLHttpRequest();
    rawFile.overrideMimeType("application/json");
    try {
        rawFile.open("GET", file, true);
    } catch (e) {
        console.error("Error opening file:", e);
    }
    rawFile.onreadystatechange = function() {
        // readyState 4 = done
        if (rawFile.readyState === 4 && rawFile.status == "200") {
            callback(rawFile.responseText);
        }
        else if (rawFile.readyState === 4 && rawFile.status == "404") {
            console.error("404 – can't load file", file);
        }

    }
    rawFile.send(null);
}

// https://maymay.net/blog/2008/06/15/ridiculously-simple-javascript-version-string-to-object-parser/
function parseVersionString (str) {
    if (typeof(str) !== 'string') { return false; }

    // Remove extra non-numeric characters (e.g. `v` for version), preserves dots
    // http://stackoverflow.com/a/9409894/738675
    var x = str.replace(/[^\d.-]/g, '');

    var parts = x.split('.');
    // parse from string or default to 0 if can't parse
    var maj = parseInt(parts[0], 10) || 0;
    var min = parseInt(parts[1], 10) || 0;
    var pat = parseInt(parts[2], 10) || 0;
    return {
        major: maj,
        minor: min,
        patch: pat
    }
}

/**
 * Dynamically injects a script element into the page with the provided url.
 * Script loading is asynchronous, so `onload` property is wrapped with a
 * Promise object and returned so that it can be chained.
 *
 * @param {string} url - the script URL to load.
 */
function injectScript(url) {
    return new Promise(function (resolve, reject) {
        var scriptEl = document.createElement('script');
        scriptEl.onload = function () {
            resolve();
        }
        scriptEl.onerror = function () {
            reject('unable to load script ' + url);
        }
        scriptEl.src = url;
        document.head.appendChild(scriptEl);
    });
}

/**
 * Loads everything in the right order. Chains promises to deal with
 * asynchronous loading of scripts that depend on each other.
 *
 * @param {string} tangramUrl - the first library to load is Tangram. The
 *      version to load is determined by load()
 */
function loadAllLibraries(tangramUrl) {
    // Load Tangram and Leaflet first.
    Promise.all([ injectScript(tangramUrl), initLeaflet() ])
        // Then load Standalone Mapzen.js, which does not bundle Leaflet.
        // It also ignores loading Tangram when it's already present.
        .then(function() {
            var mapzenjs = 'https://mapzen.com/js/mapzen.standalone.min.js';
            if (query.debug) {
                mapzenjs = 'https://mapzen.com/js/mapzen.standalone.js';
            }

            // Also load leaflet-hash along with mapzen.js
            return Promise.all([
                injectScript("lib/leaflet-hash.js"),
                injectScript(mapzenjs)
            ]);
        })
        // Then initialize everything
        .then(initMap)
        .catch(function (err) {
            console.error('Error loading libraries:', err);
        });
}

function initLeaflet() {
    var leafletcss, leafletjs;

    if (legacyLeaflet === true) {
        leafletcss = 'https://unpkg.com/leaflet@1.0.0-beta.2/dist/leaflet.css';
        leafletjs = 'https://unpkg.com/leaflet@1.0.0-beta.2/dist/leaflet.js';
        if (query.debug) {
          leafletjs = 'https://unpkg.com/leaflet@1.0.0-beta.2/dist/leaflet-src.js';
        }
    } else {
        leafletcss = 'https://unpkg.com/leaflet@1.0.3/dist/leaflet.css';
        leafletjs = 'https://unpkg.com/leaflet@1.0.3/dist/leaflet.js';
        if (query.debug) {
          leafletjs = 'https://unpkg.com/leaflet@1.0.3/dist/leaflet-src.js';
        }
    }
    document.getElementById('leafletcss').href = leafletcss;

    return injectScript(leafletjs);
}

function initMap() {
    window.map = (function () {
        'use strict';

        var map_start_location = {
          lat: 40.705319,
          lng: -74.009764,
          zoom: 15
        }; // NYC

        /*** Map ***/

        // leaflet-style URL hash pattern:
        // #[zoom],[lat],[lng]
        var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');

        if (url_hash.length == 3) {
            map_start_location = {
                lat: Number(url_hash[1]),
                lng: Number(url_hash[2]),
                zoom: Number(url_hash[0])
            };
        }

        var options = {
            keyboardZoomOffset: .05,
            zoomSnap: 0,
            minZoom: minz,
            maxZoom: maxz,
            attributionControl: (query.quiet) ? false : true,
            tangramOptions: {
                scene: scene_url
            },
            // Insert API key for default scene, otherwise, expect it to be
            // provided in the scene file itself.
            apiKey: (scene_url === 'scene.yaml') ? DEMO_API_KEY : null,
            center: [map_start_location.lat, map_start_location.lng],
            zoom: map_start_location.zoom
        };

        if (typeof maxbounds != 'undefined') {
            options["maxBounds"] = maxbounds;
        }

        var map = L.Mapzen.map('map', options);

        if (!query.quiet) {
          var geocoder = L.Mapzen.geocoder(DEMO_API_KEY);
          geocoder.addTo(map);

          // Duplicates existing bug behavior.
          // TODO: more appropriate links & messages.
          L.Mapzen.bug({
              // name: 'Web Map',
              link: 'https://mapzen.com/',
              tweet: 'Check out this map!',
              repo: 'https://github.com/mapzen/'
          });

          var locator = L.Mapzen.locator();
          locator.setPosition('bottomright');
          locator.addTo(map);

          map.attributionControl.addAttribution('<a href="https://mapzen.com/products/tangram/">Tangram</a>');
        }

        if (query.noscroll) {
            map.scrollWheelZoom.disable();
        }

        window.layer = map._tangram._layer;
        window.scene = map._tangram._layer.scene;

        var hash = new L.Hash(map);

        map.on('tangramloaded', function (event) {
            var scene = event.tangramLayer.scene;
            if (isMapzenApiKeyMissing(scene) === true) showWarning();
        });

        // Reflow the message box after font is loaded (it has a different letter height)
        var font = new FontFaceObserver('Poppins');
        font.load().then(positionWarningElements);

        return map;
    }());
}

/**
 * Displays helpful feedback to viewers when WebGL is not available on the browser.
 */
function displayNoWebGLMessage() {
    document.getElementById('no-webgl').style.display = 'block';
}

// A basic check to see if an api key string looks like a valid key. Not
// *is* a valid key, just *looks like* one.
function isValidMapzenApiKey(string) {
    return Boolean(typeof string === 'string' && string.match(/^[-a-z]+-[0-9a-zA-Z_-]{5,7}$/));
}

// Adapted from Tangram Play's own automatic API-key insertion code
function isMapzenApiKeyMissing(scene) {
    var keyIsMissing = false;

    // The URL_PATTERN handles the old vector.mapzen.com origin (until it is fully
    // deprecated) as well as the new v1 tile.mapzen.com endpoint.
    // Extensions include both vector and raster tile services.
    var URL_PATTERN = /((https?:)?\/\/(vector|tile).mapzen.com([a-z]|[A-Z]|[0-9]|\/|\{|\}|\.|\||:)+(topojson|geojson|mvt|png|tif|gz))/;

    for (var i = 0, j = Object.keys(scene.config.sources); i < j.length; i++) {
        var source = scene.config.sources[j[i]];
        var valid = false;

        // Check if the source URL is a Mapzen-hosted vector tile service
        if (!source.url.match(URL_PATTERN)) continue;

        // Check if the API key is set on the params object
        if (source.url_params && source.url_params.api_key) {
            var apiKey = source.url_params.api_key;
            var globalApi = scene.config.global.sdk_mapzen_api_key;
            // Check if the global property is valid
            // Tangram.js compatibility note: Tangram <= v0.11.6 fires the `load`
            // event _before_ `global` property substitution, so we theoretically
            // need to resolve all global references for backwards compatitibility.
            // Here, we're only using a check for the global property used by
            // Mapzen basemaps.
            if (apiKey === 'global.sdk_mapzen_api_key' && isValidMapzenApiKey(globalApi)) {
                valid = true;
            } else if (isValidMapzenApiKey(apiKey)) {
                valid = true;
            }
        }
        // Check if there is an api_key param in the query string
        else if (source.url.match(/(\?|&)api_key=[-a-z]+-[0-9a-zA-Z_-]{7}/)) {
            valid = true;
        }

        if (!valid) {
            keyIsMissing = true;
            break;
        }
    }

    return keyIsMissing;
}

var resizeListenerAdded = false;

// Optimized resize throttling - via https://developer.mozilla.org/en-US/docs/Web/Events/resize
(function() {
    var throttle = function(type, name, obj) {
        obj = obj || window;
        var running = false;
        var func = function() {
            if (running) { return; }
            running = true;
             requestAnimationFrame(function() {
                obj.dispatchEvent(new CustomEvent(name));
                running = false;
            });
        };
        obj.addEventListener(type, func);
    };

    /* init - you can init any event */
    throttle("resize", "optimizedResize");
})();

function showWarning() {
    var el = document.getElementById('warning');
    el.style.display = 'block';
    positionWarningElements();
    // Prevent this listener from being added more than once.
    if (!resizeListenerAdded) {
        window.addEventListener('optimizedResize', positionWarningElements);
        resizeListenerAdded = true;
    };
}

function positionWarningElements() {
    var el = document.getElementById('warning');
    var rect = el.getBoundingClientRect();
    var mapEl = document.getElementById('map');
    mapEl.style.height = 'calc(100% - ' + rect.height + 'px)';
    mapEl.style.top = rect.height + 'px';
    var bugEl = document.getElementById('mz-bug');
    if (bugEl) {
        bugEl.style.transform = 'translateY(' + rect.height + 'px)';
    }
}
