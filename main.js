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

var map, scene, hash, query, scene_url;
var minz = 1;
var maxz = 22;
var maxbounds;
var legacyLeaflet = false;

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
        // Then hash and mapzen-ui, which depends on Leaflet
        .then(function() {
            return Promise.all([
                injectScript("lib/leaflet-hash.js"),
                injectScript("https://mapzen.com/common/ui/mapzen-ui.min.js")
            ])
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
        leafletcss="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.0.0-beta.2/leaflet.css";
        leafletjs="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.0.0-beta.2/leaflet.js";
    } else {
        leafletcss="https://unpkg.com/leaflet@1.0.2/dist/leaflet.css";
        leafletjs="https://unpkg.com/leaflet@1.0.2/dist/leaflet.js";
    }
    document.getElementById("leafletcss").href = leafletcss;

    return injectScript(leafletjs);
}

function initMap() {
    bugOptions = {}
    window.map = (function () {
        // console.log('Leaflet version:', window.L.version)

        'use strict';

        var map_start_location = [40.70531887544228, -74.00976419448853, 15]; // NYC

        /*** Map ***/

        // leaflet-style URL hash pattern:
        // #[zoom],[lat],[lng]
        var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');

        if (url_hash.length == 3) {
            map_start_location = [url_hash[1],url_hash[2], url_hash[0]];
            // convert from strings
            map_start_location = map_start_location.map(Number);
        }

        var options = {"keyboardZoomOffset" : .05,
            "zoomSnap" : 0,
            "minZoom": minz,
            "maxZoom": maxz };

        if (typeof maxbounds != 'undefined') {
            options["maxBounds"] = maxbounds;
        }

        var map = L.map('map', options);
        var layer = Tangram.leafletLayer({
            scene: scene_url,
            attribution: '<a href="https://mapzen.com/tangram" target="_blank">Tangram</a> | &copy; OSM contributors | <a href="https://mapzen.com/" target="_blank">Mapzen</a>'
        });

        if (query.quiet) {
            layer.options.attribution = "";
            map.attributionControl.setPrefix('');
            bugOptions = {
                locate: false,
                search: false
            }
            window.addEventListener("load", function() {
                document.getElementById("mz-bug").style.display = "none";
            });
        }

        if (query.noscroll) {
            map.scrollWheelZoom.disable();
        }

        window.layer = layer;
        scene = layer.scene;
        window.scene = scene;
        // setView expects format ([lat, long], zoom)
        map.setView(map_start_location.slice(0, 3), map_start_location[2]);

        if (typeof maxbounds != 'undefined' && query.fitbounds) {
            map.fitBounds(maxbounds);
        }

        hash = new L.Hash(map);

        layer.addTo(map);

        return map;

    }());
    MPZN.bug(bugOptions);
}

/**
 * Displays helpful feedback to viewers when WebGL is not available on the browser.
 */
function displayNoWebGLMessage() {
    document.getElementById('no-webgl').style.display = 'block';
}
