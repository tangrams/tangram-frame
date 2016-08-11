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
    var scene_lib = '0.9';
    var build = "min";
    query = parseQuery(window.location.search.slice(1));
    if (query.url) {
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
            console.log('lib param error:', scene_lib, "is not a valid tangram library, defaulting to 0.9");
            scene_lib = '0.9';
        }
    }
    if (scene_lib.indexOf("/") == -1) {
        // assume it's a version # only
        lib_url = "//mapzen.com/tangram/"+scene_lib+"/tangram."+build+".js";
    }
    var lib_script = document.createElement('script');
    lib_script.onload = function() {tangramLoaded();};
    lib_script.src = lib_url;
    document.body.appendChild(lib_script);
}());

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

function initLeaflet() {
    console.log('initLeaflet')
    var leafletcss, leafletjs;
    // get tangram version
    var v = window.Tangram.version;
    console.log('window.Tangram.version', window.Tangram.version)
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
    var leaflet_script = document.createElement('script');
    leaflet_script.onload = function() {leafletLoaded();};
    leaflet_script.src = leafletjs;
    document.body.appendChild(leaflet_script);

    var leaflet_style = document.createElement('style');
    leaflet_style.src = leafletcss;
    document.head.appendChild(leaflet_style);
}

var uiisloaded = false;
var hashisloaded = false;

function tangramLoaded() {
    console.log('tangramLoaded')
    initLeaflet();
}
function leafletLoaded() {
    console.log('leafletLoaded')
    initHash();
}
function initHash() {
    var leaflethash = document.createElement('script');
    leaflethash.onload = function() {leaflethashLoaded();};
    leaflethash.src = "lib/leaflet-hash.js";
    document.body.appendChild(leaflethash);

    var mapzenui = document.createElement('script');
    mapzenui.onload = function() {mapzenuiLoaded();};
    mapzenui.src = "//mapzen.com/common/ui/mapzen-ui.min.js";
    document.body.appendChild(mapzenui);
}
function leaflethashLoaded() {
    hashisloaded = true;
    if (hashisloaded && uiisloaded) {
        initMap();
    }
}
function mapzenuiLoaded() {
    uiisloaded = true;
    if (hashisloaded && uiisloaded) {
        initMap();
    }
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

