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
var maxbounds = [[-90,0],[90,180]];
var fitbounds = [[],[]];

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
        var max_sw_ne = query.maxbounds;
        console.log("&max: " + max_sw_ne);
        var a = max_sw_ne.split(',');
        console.log("split: " + a);
        maxbounds = [[a[0],a[1]],[a[2],a[3]]];
        console.log("maxbounds: " + maxbounds);
    }
    if (query.fitbounds) {
        var fit_sw_ne = query.fitbounds;
        console.log("&fit: " + fit_sw_ne);
        var b = fit_sw_ne.split(',');
        console.log("split: " + b);
        fitbounds = [[b[0],b[1]],[b[2],b[3]]];
        console.log("fitbounds: " + fitbounds);
    }    
    

    if (scene_lib.indexOf("/") > -1) {
        // assume it's a full path
        // check that it's a tangram library on a whitelisted domain
        if (scene_lib.match(/^https?:\/\/(.*mapzen.com|localhost)(:[0-9]+)?\/.*tangram\.(min|debug)\.js$/)) {
            var lib_url = scene_lib;
        } else {
            // noooo you don't
            console.log('lib param error:', scene_lib, "is not a valid tangram library, defaulting to " + default_scene_lib);
            scene_lib = default_scene_lib;
        }
    }
    if (scene_lib.indexOf("/") == -1) {
        // assume it's a version # only
        lib_url = "https://mapzen.com/tangram/"+scene_lib+"/tangram."+build+".js";
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
    if (typeof(str) != 'string') { return false; }
    var x = str.split('.');
    // parse from string or default to 0 if can't parse
    var maj = parseInt(x[0]) || 0;
    var min = parseInt(x[1]) || 0;
    var pat = parseInt(x[2]) || 0;
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
    // Load Tangram first.
    injectScript(tangramUrl)
        .then(initLeaflet) // Then Leaflet
        // Then hash, which depends on Leaflet
        .then(function() {
            return injectScript("lib/leaflet-hash.js");
        })
        // Finally, mapzen-UI
        .then(function() {
            return injectScript("https://mapzen.com/common/ui/mapzen-ui.min.js");
        })
        // Then initialize everything
        .then(initMap)
        .catch(function (err) {
            console.error('Error loading libraries:', err);
        });
}

function initLeaflet() {
    var leafletcss, leafletjs;
    // get tangram version
    var v = window.Tangram.version;
    // http://stackoverflow.com/a/9409894/738675
    v = v.replace(/[^\d.-]/g, '');
    // console.log('Tangram version:', v)
    v = parseVersionString(v);
    if (v.major < 1 && v.minor < 8) {
        leafletcss="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.0.0-beta.2/leaflet.css";
        leafletjs="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.0.0-beta.2/leaflet.js";
    } else {
        leafletcss="https://unpkg.com/leaflet@1.0.1/dist/leaflet.css";
        leafletjs="https://unpkg.com/leaflet@1.0.1/dist/leaflet.js";
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

        var map = L.map('map',
            {"keyboardZoomOffset" : .05,
            "zoomSnap" : 0,
            "minZoom": minz,
            "maxZoom": maxz,
            "maxBounds": maxbounds,
            "fitBounds": fitbounds,
            }
        );

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
