define(["dojo/Evented", "dojo/_base/declare", "dojo/_base/lang", "dojo/has", "esri/kernel", "dijit/_WidgetBase", "dijit/a11yclick", "dijit/_TemplatedMixin", "dojo/on",
// load template    
"dojo/text!application/dijit/templates/MapParcelSearch.html", "dojo/dom-class", "dojo/dom-style", "dojo/dom-construct", "dojo/_base/event", "dojo/_base/array", "dijit/registry", "dijit/form/Button", 
"esri/tasks/QueryTask", "esri/tasks/query", "esri/tasks/FeatureSet", "esri/geometry/Extent", "esri/symbols/SimpleFillSymbol", "esri/symbols/SimpleLineSymbol", "esri/Color", "esri/layers/GraphicsLayer", "dijit/form/TextBox"], function (
Evented, declare, lang, has, esriNS, _WidgetBase, a11yclick, _TemplatedMixin, on, dijitTemplate, domClass, domStyle, domConstruct, event, array, registry, button, QueryTask, Query, FeatureSet, Extent, SimpleFillSymbol, SimpleLineSymbol, Color, GraphicsLayer) {
    var Widget = declare("esri.dijit.MapParcelSearch", [_WidgetBase, _TemplatedMixin, Evented], {
        templateString: dijitTemplate,
        // defaults
        options: {
            theme: "TableOfContents",
            map: null,
            layers: null,
            config: null,
            visible: true,
            //The graphics layer to show search results
            _mapParcelSearchGraphicsLayer: null,
            //The polygon symbol for the search results
            _symbolSearchResults: null
        },
        //The graphics layer to show search results
        _mapParcelSearchGraphicsLayer: null,
        //The polygon symbol for the search results
        _symbolSearchResults: null,
        
        // lifecycle: 1
        constructor: function (options, srcRefNode) {
            // mix in settings and defaults
            var defaults = lang.mixin({}, this.options, options);
            // widget node
            this.domNode = srcRefNode;
            // properties
            this.set("map", defaults.map);
            this.set("layers", defaults.layers);
            this.set("config", defaults.config);
            this.set("theme", defaults.theme);
            this.set("visible", defaults.visible);
            // listeners
            this.watch("theme", this._updateThemeWatch);
            this.watch("visible", this._visible);
            this.watch("layers", this._refreshLayers);
            this.watch("map", this.refresh);
            // classes
            this.css = {
                container: "toc-container",
                layer: "toc-layer",
                firstLayer: "toc-first-layer",
                title: "toc-title",
                titleContainer: "toc-title-container",
                content: "toc-content",
                titleCheckbox: "toc-checkbox",
                checkboxCheck: "icon-check-1",
                titleText: "toc-text",
                accountText: "toc-account",
                visible: "toc-visible",
                settingsIcon: "icon-cog",
                settings: "toc-settings",
                actions: "toc-actions",
                account: "toc-account",
                clear: "clear"
            };
        },
        // start widget. called by user
        startup: function () {
            // map not defined
            if (!this.map) {
                this.destroy();
                console.log("TableOfContents::map required");
            }
            // when map is loaded
            if (this.map.loaded) {
                this._init();
            } else {
                on.once(this.map, "load", lang.hitch(this, function () {
                    this._init();
                }));
            }
        },
        // connections/subscriptions will be cleaned up during the destroy() lifecycle phase
        destroy: function () {
            //Clear any current graphics before doing a new query
            this._clearMapParcelGraphicsLayer();
            this._removeEvents();
            this.inherited(arguments);
        },
        /* ---------------- */
        /* Public Events */
        /* ---------------- */
        // load
        // toggle
        // expand
        // collapse
        /* ---------------- */
        /* Public Functions */
        /* ---------------- */
        show: function () {
            this.set("visible", true);
        },
        hide: function () {
            //Clear any current graphics before doing a new query
            this._clearMapParcelGraphicsLayer();
            this.set("visible", false);
        },
        refresh: function () {
            this._createList();
        },
        /* ---------------- */
        /* Private Functions */
        /* ---------------- */
        _init: function () {
            this._visible();
            this.set("loaded", true);
            this.emit("load", {});

            this.own(on(this._mapSearchText, "keyup", lang.hitch(this, function (event) {
                //Check if the Enter key was clicked
                if (event.keyCode == '13')
                    this._doQuery();
            })));

            this.own(on(this._parcelSearchText, "keyup", lang.hitch(this, function (event) {
                //Check if the Enter key was clicked
                if (event.keyCode == '13')
                    this._doQuery();
            })));

            this.own(on(this._mapparcelSearchTextClick, a11yclick, lang.hitch(this, function () {
                this._doQuery();
            })));
        },

        _doQuery: function () {
            //Clear any current graphics before doing a new query
            this._clearMapParcelGraphicsLayer();

            //Get the value from the textbox (string)
            var searchValues = this._getSearchValues();
            //Make sure serch input values are valid
            if (this._validSearchInputValues(searchValues[0], searchValues[1]))
                //Construct the where clause given the search params and conduct AGS query
                this._queryFeatureLayer(this._createWhereClause(searchValues));
        },

        //Creates the graphics layer and symbol for it, as needed. Also adds graphics layer to map.
        _createMapParcelGraphicsLayerAndSymbol: function() {
            if (this._mapParcelSearchGraphicsLayer == null) {
                this._mapParcelSearchGraphicsLayer = new GraphicsLayer();
                this.map.addLayer(this._mapParcelSearchGraphicsLayer);
            }
            if (this._symbolSearchResults == null) {
                this._symbolSearchResults = new SimpleFillSymbol(SimpleFillSymbol.STYLE_NULL,
                                                new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
                                                    new Color([0, 255, 255]), 2), new Color());
            }
        },

        _clearMapParcelGraphicsLayer: function () {
            if (this._mapParcelSearchGraphicsLayer != null)
                this._mapParcelSearchGraphicsLayer.clear();
        },

        //Places the map value first and the parcel value second
        _getSearchValues: function() {
            var values = [
                this._mapSearchText.value,
                this._parcelSearchText.value
            ];
            return values;
        },

        _validSearchInputValues: function (mapSearchValue, parcelSearchValue) {
            // Requires both a map and parcel number to search
            if (mapSearchValue == null || mapSearchValue.length <= 0) {
                alert('Please enter a Map ID number for searching.');
                return false;
            } else if (parcelSearchValue == null || parcelSearchValue.length <= 0) {
                alert('Please enter a Parcel ID number for searching.');
                return false;
            } else
                return true;
        },

        _createWhereClause: function (searchValues) {
            return "Map = " + searchValues[0] + " and Parcel = " + searchValues[1];
        },

        _queryFeatureLayer: function (whereClause) {
            //Find the feature layer to query (Carroll County Parcels)
            var featureLayer;
            for (var i = 0; i < this.layers.length; i++) {
                var layer = this.layers[i];
                if (layer.id.toLowerCase().indexOf('carrollcountyparcels') >= 0) {
                    featureLayer = layer;
                    break;
                }
            }

            var queryTask = new QueryTask(featureLayer.url);

            //Query the layer with the appropriate field search
            var query = new Query();
            query.where = whereClause;
            query.outSpatialReference = this.map.spatialReference;
            query.returnGeometry = true;

            // Perform the query on the server
            queryTask.execute(query, lang.hitch(this, function (featureSet) {
                //Check for features in result
                if (featureSet.features.length > 0) {
                    //Create a graphics layer and symbol if not already present
                    this._createMapParcelGraphicsLayerAndSymbol();
                    //Get the extent of all features
                    var extent = featureSet.features[0].geometry.getExtent();
                    featureSet.features[0].setSymbol(this._symbolSearchResults);
                    this._mapParcelSearchGraphicsLayer.add(featureSet.features[0]);
                    for (var featInd = 1; featInd < featureSet.features.length; featInd++) {
                        extent = extent.union(featureSet.features[featInd].geometry.getExtent());
                        featureSet.features[featInd].setSymbol(this._symbolSearchResults);
                        this._mapParcelSearchGraphicsLayer.add(featureSet.features[featInd]);
                    }
                    //Zoom to the extent
                    this.map.setExtent(extent);
                } else
                    alert("No features found.");
            }), function (err) {
                console.log("Error querying service: ", err);
                alert("Error querying service.");
            });
        },

        _updateThemeWatch: function () {
            var oldVal = arguments[1];
            var newVal = arguments[2];
            domClass.remove(this.domNode, oldVal);
            domClass.add(this.domNode, newVal);
        },
        _visible: function () {
            if (this.get("visible")) {
                domStyle.set(this.domNode, "display", "block");
            } else {
                domStyle.set(this.domNode, "display", "none");
                //Clear any current graphics before doing a new query
                this._clearMapParcelGraphicsLayer();
            }
        }
    });
    if (has("extend-esri")) {
        lang.setObject("dijit.MapParcelSearch", Widget, esriNS);
    }
    return Widget;
});