# tangram-frame
A nice frame for displaying a Tangram map.

Pass the scene file through the url as a query and the location as a hash to load it.

#### query parameters

- url: the scene file to load
- quiet: hides attribution and UI
- noscroll: disables scrolling for iframe embedding
- lib: Tangram version number, defaults to 0.14.0
- debug: Tangram build, when this is not present defaults to min
- gist: url of a github gist saved from Tangram Play
- minz: sets the Leaflet minZoom parameter
- maxz: sets the Leaflet maxZoom parameter
- maxbounds: sets the Leaflet MaxBounds parameter in the format [sw lat],[sw lon],[ne lat],[ne lon]

Examples:

http://tangrams.github.io/tangram-frame/?url=https://raw.githubusercontent.com/meetar/tangram-sandbox/gh-pages/styles/blueprint.yaml#15/40.7053/-74.0097

http://tangrams.github.io/tangram-frame/?lib=0.7&debug&noscroll&quiet&url=https://raw.githubusercontent.com/meetar/tangram-sandbox/gh-pages/styles/blueprint.yaml&minz=4&maxz=10#15/40.7053/-74.0097
