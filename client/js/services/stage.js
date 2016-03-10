/**
 * Created by ralemy on 11/2/15.
 * Decorating Stage object to create double binding with Project
 *
 */

"use strict";

module.exports = (function (app) {
    app.factory("Stage", ["_", "$q", "$state", "$interval", "CreateJS", "Origin", "Ruler", "Tracer", "Zones", "Reader", "Item",
        "ZoneModel","TimeLapse",
        function (_, $q, $state, $interval, createjs, Origin, Ruler, Tracer, Zones, Reader, Item, zoneModel,TimeLapse) {
            var main = new createjs.Container(),
                canvas = document.createElement("canvas"),
                stage = new createjs.Stage(canvas),
                timeLapse=TimeLapse(),
                floorPlan, project, bkWidth = 1300, bkHeight = 700, events = {}, zone = null, readers = [], reader = null,
                items = {}, itemInterval = null, item = null, activeTweens = 0,
                layers = ["Floorplan", "Origin", "Zone", "Field", "Reader", "Item", "Ruler", "Tracer","TimeLapse"],
                wrapper = Object.create({
                        offAll: function () {
                            _.each(events, function (v, k) {
                                stage.off(k, v);
                            });
                        },
                        initLayers: function () {
                            main.removeAllChildren();
                            var children = _.map(layers, function (l) {
                                var layer = new createjs.Container();
                                layer.name = l;
                                return layer;
                            });
                            main.addChild.apply(main, children);
                        },
                        selectLayer: function (c) {
                            var i = _.findIndex(layers, function (l) {
                                return l === c.name;
                            });
                            return (i === -1) ? i = layers.length - 1 : i;
                        },
                        addChild: function () {
                            var args = Array.prototype.slice.call(arguments),
                                self = this;
                            _.each(args, function (c) {
                                main.children[self.selectLayer(c)].addChild(c);
                            });
                        },
                        removeChild: function () {
                            var args = Array.prototype.slice.call(arguments),
                                self = this;
                            _.each(args, function (c) {
                                main.children[self.selectLayer(c)].removeChild(c);
                            });
                        },
                        link: function (scope, el) {
                            var self = this;
                            el[0].appendChild(canvas);
                            self.offAll();
                            events.mousedown = stage.on("mousedown", function (ev) {
                                if ($state.current.name === "floorPlan.origin")
                                    self.origin = {x: ev.stageX / self.zoom, y: ev.stageY / self.zoom};
                                else if ($state.current.name === "floorPlan.trace")
                                    Tracer.mousedown(ev);
                                else if ($state.current.name === "floorPlan.ruler")
                                    return;
                                else
                                    return $state.go("floorPlan");
                                scope.$apply();
                            });
                            events.pressmove = stage.on("pressmove", function (ev) {
                                if ($state.current.name === "floorPlan.origin")
                                    self.origin = {x: ev.stageX / self.zoom, y: ev.stageY / self.zoom};
                                else if ($state.current.name === "floorPlan.trace")
                                    Tracer.pressmove(ev);
                                else
                                    project.mouse = {
                                        x: self.stageToMeters(ev.stageX / self.zoom, "x"),
                                        y: self.stageToMeters(ev.stageY / self.zoom, "y")
                                    };
                                scope.$apply();
                            });
                            events.pressup = stage.on("pressup", function () {
                                project.mouse = null;
                                scope.$apply();
                            });

                            events.dblclick = stage.on("dblclick", function (ev) {
                                if ($state.current.name === "floorPlan.trace")
                                    Tracer.dblclick(ev);
                                else
                                    return;
                                scope.$apply();
                            });
                            scope.$on("EndPlanState", function (ev, state) {
                                switch (state) {
                                    case "ruler":
                                        return self.removeRuler();
                                    case "trace":
                                        return self.endTrace();
                                    case "zone":
                                        return self.endZone();
                                    case "reader":
                                        return self.endReader();
                                    case "item":
                                        return self.endItem();
                                    default:
                                        break;
                                }
                            });
                            scope.$on("StartPlanState", function (ev, state) {
                                switch (state) {
                                    case "ruler":
                                        return self.addRuler();
                                    case "trace":
                                        return self.startTrace();
                                    case "zone":
                                        return self.startZone();
                                    case "reader":
                                        return self.startReader();
                                    case "item":
                                        return self.startItem();
                                    default:
                                        break;
                                }
                            });
                            self.scope = scope;
                            if (self.project && !self.origin.x)
                                self.origin = self.visibleCenter();
                            self.update();
                        },
                        screenToCanvas: function (v) {
                            return v / this.zoom;
                        },
                        stageToMeters: function (v, axis) {
                            return (axis === "y" ? -1 : 1) * (v - this.origin[axis]) / this.scale;
                        },
                        metersToStage: function (v, axis) {
                            if (axis === "y") v = -v;
                            return this.metersToCanvas(v) + this.origin[axis];
                        },
                        metersToCanvas: function (v) {
                            return v * this.scale;
                        },
                        startZone: function () {
                            this.zone = $state.params.zone;
                        },
                        endZone: function () {
                            this.zone = null;
                        },
                        startReader: function () {
                            this.reader = $state.params.reader;
                        },
                        endReader: function () {
                            this.reader = null;
                        },
                        startItem: function () {
                            this.item = $state.params.item;
                        },
                        endItem: function () {
                            this.item = null;
                        },
                        startTrace: function () {
                            var self = this;
                            return Tracer.trace(this).then(function (points) {
                                Zones.createZone(self.addZone(points), self, 1.2);
                                $state.go("floorPlan");
                            });
                        },
                        addZone: function (points) {
                            var zone = zoneModel(points);
                            this.zones.push(zone);
                            return zone;
                        },
                        cloneZone: function () {
                            var zone = Zones.cloneZone(this.zone.model, this);
                            this.zones.push(zone.model);
                            zone.activate();
                        },
                        deleteZone: function () {
                            var self = this;
                            this.zones = _.filter(this.zones, function (zone) {
                                return zone !== self.zone.model;
                            });
                            this.zone.destroy();
                            $state.go("floorPlan");
                        },
                        on: function () {
                            return stage.on.apply(stage, arguments);
                        },
                        off: function () {
                            return stage.off.apply(stage, arguments);
                        },
                        dispatchEvent: function () {
                            return stage.dispatchEvent.apply(stage, arguments);
                        },
                        endTrace: function () {
                            Tracer.cancel();
                        },
                        removeRuler: function () {
                            this.removeChild(Ruler.shape);
                            this.update();
                        },
                        setRulerLength: function (v) {
                            Ruler.length = v;
                            this.update();
                        },
                        addRuler: function () {
                            if (!this.containsShape(Ruler.shape))
                                this.addChild(Ruler.shape);
                            if (!Ruler.coords.startX)
                                Ruler.coords.init(this.visibleCenter(), 50);
                            Ruler.draw(true);
                            this.rulerLength = Ruler.length;
                        },
                        setFloorPlan: function (plan) {
                            var self = this;
                            return (plan) ?
                                angular.promiseBitmap(plan).then(function (bitmap) {
                                    bitmap.name = "Floorplan";
                                    self.floorPlan = bitmap;
                                    return bitmap;
                                }) :
                                $q.reject();
                        },
                        widthZoom: function () {
                            return bkWidth && canvas.parentNode ? canvas.parentNode.clientWidth / bkWidth : 1;
                        },
                        visibleCenter: function () {
                            if (!canvas.parentElement)
                                return {};
                            var visibleWidth = canvas.parentElement.clientWidth,
                                scrollLeft = canvas.parentElement.scrollLeft,
                                canvasWidth = canvas.width,
                                visibleHeight = canvas.parentElement.clientHeight,
                                scrollTop = canvas.parentElement.scrollTop,
                                canvasHeight = canvas.height,
                                screenX = (canvasWidth < visibleWidth) ? canvasWidth / 2 : scrollLeft + (visibleWidth / 2),
                                screenY = (canvasHeight < visibleHeight) ? canvasHeight / 2 : scrollTop + (visibleHeight / 2),
                                zoom = this.zoom || this.widthZoom();
                            return {
                                x: screenX / zoom,
                                y: screenY / zoom
                            };
                        },
                        connect: function (p) {
                            var self = this;
                            if (p === project)
                                return;
                            if (project)
                                project.disconnect(this);
                            project = p;
                            if (!p || !p.floorPlan)
                                return;
                            this.setFloorPlan(p.floorPlanUrl);
                            _.each(p.zones, function (zone) {
                                Zones.createZone(zone, self);
                            });
                            self.showReaders(p.showReaders);
                            self.update();
                        },
                        disconnect: function () {
                            project = null;
                            this.initLayers();
                            this.update();
                        },
                        drawOrigin: function () {
                            Origin.draw(true);
                        },
                        setOrigin: function (x, y) {
                            this.origin.x = bkWidth * x;
                            this.origin.y = bkHeight * y;
                            this.drawOrigin();
                        },
                        update: function () {
                            if (this.activeTweens <= 0)
                                if ($state.current.name.indexOf("floorPlan") === 0)
                                    stage.update();
                        },
                        setTolerance: function (v) {
                            this.zone.setTolerance(v);
                        },
                        updateReader: function (reader) {
                            var target = _.find(readers, function (r) {
                                return r.ref === reader.placement;
                            });
                            if (target)
                                target.draw(true);

                        },
                        addReader: function (ref) {
                            var reader = Reader.create(ref.placement, this);
                            readers.push(reader);
                            this.reader = reader;
                            reader.activate(true);
                            return reader;
                        },
                        removeReader: function (reader) {
                            readers = _.filter(readers, function (r) {
                                return r !== reader;
                            });
                            reader.destroy();
                        },
                        showReaders: function (v) {
                            var self = this;
                            if (v)
                                if (readers.length)
                                    _.each(readers, function (r) {
                                        r.draw();
                                    });
                                else
                                    readers = _.map(project.readers, function (reader) {
                                        return Reader.create(reader.placement, self);
                                    });
                            else
                                readers = _.reduce(readers, function (r, reader) {
                                    reader.destroy();
                                    return r;
                                }, []);
                            if ($state.current.name === "floorPlan.reader")
                                $state.go("floorPlan");
                            self.update();
                        },
                        showItems: function (v) {
                            if (v)
                                this.tweenItems(project.items);
                            else {
                                items = _.reduce(items, function (r, i) {
                                    i.destroy();
                                    return r;
                                }, {});
                                if ($state.current.name === "floorPlan.item")
                                    $state.go("floorPlan");
                            }
                            this.update();
                        },
                        pullItems: function (v) {
                            if (v)
                                itemInterval = itemInterval || $interval(function () {
                                        if ($state.current.name.indexOf("floorPlan") === 0)
                                            project.getItems();
                                    }, 5000);
                            else {
                                $interval.cancel(itemInterval);
                                itemInterval = null;
                            }
                            this.update();
                        },
                        tweenItems: function (itms) {
                            var self = this;
                            _.each(itms.data, function (i) {
                                if (!i.epc.match(self.epcFilter))
                                    return;
                                if (items[i.epc])
                                    items[i.epc].tween(i);
                                else
                                    items[i.epc] = Item(i, self);
                                items[i.epc].keep = true;
                            });
                            _.each(items, function (i) {
                                if (i.keep)
                                    return delete i.keep;
                                delete items[i.epc];
                                i.destroy();
                            });
                            if(project.timeLapse)
                                timeLapse.draw(project.timeLapseData.getTimeLapse());
                        },
                        containsShape: function (shape) {
                            var i = this.selectLayer(shape);
                            return main.children[i].contains(shape);
                        },
                        setEpcFilter: function () {
                            if (project.showItems)
                                if (!project.pullItems)
                                    this.showItems(true);
                        }
                    },
                    {
                        floorPlan: {
                            enumerable: false,
                            get: function () {
                                return floorPlan;
                            },
                            set: function (v) {
                                if (floorPlan)
                                    this.removeChild(floorPlan);
                                floorPlan = v;
                                if (!v) return;
                                bkWidth =  canvas.width = v.image.width;
                                bkHeight = canvas.height = v.image.height;
                                this.addChild(v);
                                if (!this.containsShape(Origin.shape))
                                    this.addChild(Origin.shape);
                                if(!this.containsShape(timeLapse.shape))
                                    this.addChild(timeLapse.shape);
                                project.zoom = this.zoom || this.widthZoom();
                                this.origin = this.origin.x === undefined ? this.visibleCenter() : this.origin;
                            }
                        },
                        origin: {
                            enumerable: true,
                            get: function () {
                                return project.origin;
                            },
                            set: function (v) {
                                project.origin.x = v.x;
                                project.origin.y = v.y;
                                Origin.draw(true);
                            }
                        },
                        zoom: {
                            enumerable: true,
                            get: function () {
                                return project.zoom;
                            },
                            set: function (v) {
                                if (!this.floorPlan) return;
                                canvas.width = bkWidth * v;
                                canvas.height = bkHeight * v;
                                main.setTransform(0, 0, v, v);
                                stage.dispatchEvent("Zoom");
                                this.update();
                            }
                        },
                        originBox: {
                            enumerable: false,
                            get: function () {
                                return {
                                    x: this.origin.x,
                                    y: this.origin.y,
                                    w: bkWidth,
                                    h: bkHeight
                                };
                            }
                        },
                        rulerCoords: {
                            get: function () {
                                return Ruler.coords;
                            }
                        },
                        rulerLength: {
                            enumerable: false,
                            get: function () {
                                return project.rulerLength;
                            },
                            set: function (v) {
                                project.rulerLength = v;
                            }
                        },
                        zones: {
                            enumerable: false,
                            get: function () {
                                return project.zones;
                            },
                            set: function (v) {
                                project.zones = v;
                            }
                        },
                        zone: {
                            enumerable: false,
                            get: function () {
                                return zone;
                            },
                            set: function (v) {
                                if (zone && v !== zone)
                                    zone.deactivate();
                                zone = v;
                                project.zone = v ? v.model : null;
                            }
                        },
                        scale: {
                            enumerable: false,
                            get: function () {
                                return project.scale;
                            }
                        },
                        reader: {
                            enumerable: false,
                            get: function () {
                                return reader;
                            },
                            set: function (v) {
                                if (reader && v !== reader)
                                    reader.deactivate();
                                reader = v;
                                project.reader = v ? _.find(project.readers, function (r) {
                                    return r.placement === v.ref;
                                }) : null;
                            }
                        },
                        item: {
                            get: function () {
                                return item;
                            },
                            set: function (v) {
                                if (item && v !== item)
                                    item.deactivate();
                                item = v;
                                project.item = v ? v.model : null;
                            }
                        },
                        activeTweens: {
                            get: function () {
                                return activeTweens;
                            },
                            set: function (v) {
                                activeTweens = v;
                            }
                        },
                        showReaderFields: {
                            get: function () {
                                return project.showReaderFields;
                            }
                        },
                        epcFilter: {
                            get: function () {
                                return project.epcFilter;
                            }
                        },
                        timeLapse:{
                            set:function(v){
                                if(v)
                                    timeLapse.draw(project.timeLapseData.getTimeLapse(),true);
                                else
                                    timeLapse.clear(true);
                            }
                        }
                    });
            canvas.width = bkWidth;
            canvas.height = bkHeight;
            canvas.setAttribute("oncontextmenu", "return false;");
            wrapper.initLayers();
            stage.addChild(main);
            wrapper.addChild(Origin.shape);
            Origin.stage = wrapper;
            Ruler.init(wrapper);
            timeLapse.init(wrapper);
            function switchFocus(ev, focus) {
                $state.params[focus] = ev[focus];
                if (wrapper[focus] && wrapper[focus] !== ev[focus]) wrapper[focus] = ev[focus];
                if (wrapper.scope && ev.force)
                    wrapper.scope.$apply();
                $state.go("floorPlan." + focus, $state.params);
            }

            stage.on("newZone", function (ev) {
                switchFocus(ev, "zone");
            });
            stage.on("newReader", function (ev) {
                switchFocus(ev, "reader");
            });
            stage.on("newItem", function (ev) {
                switchFocus(ev, "item");
            });
            createjs.Ticker.setFPS(30);
            createjs.Ticker.addEventListener("tick", function () {
                if (wrapper.activeTweens > 0)
                    stage.update();
            });
            return wrapper;
        }]);
})(angular.module(window.mainApp));