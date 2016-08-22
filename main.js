/*jslint browser: true*/
/*global Tangram, gui */

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

load = (function load() {
    /*** URL parsing ***/
    // determine the version of Tangram, scene url, and content to load during start-up
    scene_url = 'scene.yaml';
    var scene_lib = '0.8';
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

    if (scene_lib.indexOf("/") > -1) {
        // assume it's a full path
        // check that it's a tangram library
        if (scene_lib.substr(scene_lib.length - 17) == '/tangram.debug.js' ||
            scene_lib.substr(scene_lib.length - 15) == '/tangram.min.js') {
            var lib_url = scene_lib;
        } else {
            // noooo you don't
            console.log('lib param error:', scene_lib, "is not a valid tangram library, defaulting to 0.7");
            scene_lib = '0.8';
        }
    }
    else if (scene_lib.indexOf("/") == -1) {
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
        .then(() => {
            return injectScript("lib/leaflet-hash.js");
        })
        // Finally, mapzen-UI
        .then(() => {
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
        leafletcss="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.0.0-rc.1/leaflet.css";
        leafletjs="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.0.0-rc.1/leaflet.js";
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
            {"keyboardZoomOffset" : .05}
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
