'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.app.factory('beamlineService', function(appState, utilities, $window) {
    var self = this;
    var canEdit = true;
    //TODO(pjm) keep in sync with template_common.DEFAULT_INTENSITY_DISTANCE
    // consider moving to "constant" section of schema
    var DEFAULT_INTENSITY_DISTANCE = 20;
    self.activeItem = null;

    // Try to detect mobile/tablet devices using Mozilla recommendation below
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent
    var isTouchscreen = /Mobi|Silk/i.test($window.navigator.userAgent);

    self.dismissPopup = function() {
        $('.srw-beamline-element-label').popover('hide');
    };

    self.getActiveItemTitle = function() {
        if (self.activeItem && self.activeItem.title) {
            return self.activeItem.title;
        }
        return '';
    };

    self.getReportTitle = function(modelName, itemId) {
        var savedModelValues = appState.applicationState();
        if (itemId && savedModelValues.beamline) {
            for (var i = 0; i < savedModelValues.beamline.length; i += 1) {
                if (savedModelValues.beamline[i].id == itemId) {
                    return 'Intensity ' + savedModelValues.beamline[i].title + ' Report, '
                        + savedModelValues.beamline[i].position + 'm';
                }
            }
        }
        var model = savedModelValues[modelName];
        var distance = '';
        if (model && 'distanceFromSource' in model) {
            distance = ', ' + model.distanceFromSource + 'm';
        }
        else if (appState.isAnimationModelName(modelName)) {
            distance = ', ' + savedModelValues.beamline[savedModelValues.beamline.length - 1].position + 'm';
        }
        else if (modelName == 'initialIntensityReport') {
            if (savedModelValues.beamline && savedModelValues.beamline.length) {
                distance = ', ' + savedModelValues.beamline[0].position + 'm';
            }
            else {
                if ('models' in appState && 'simulation' in appState.models && 'distanceFromSource' in appState.models.simulation) {
                    distance = ', ' + appState.models.simulation.distanceFromSource + 'm';
                }
                else {
                    distance = ', ' + DEFAULT_INTENSITY_DISTANCE + 'm';
                }
            }
        }
        return appState.viewInfo(modelName).title + distance;
    };

    self.getWatchItems = function() {
        if (appState.isLoaded()) {
            var beamline = appState.applicationState().beamline;
            var res = [];
            for (var i = 0; i < beamline.length; i++) {
                if (beamline[i].type == 'watch') {
                    res.push(beamline[i]);
                }
            }
            return res;
        }
        return [];
    };

    self.isActiveItemValid = function() {
        return self.isItemValid(self.activeItem);
    };

    self.isBeamlineValid = function() {
        var models = appState.models;
        if (! models.beamline ) {
            return true;
        }
        for (var i = 0; i < models.beamline.length; ++i) {
            var item = models.beamline[i];
            if (! self.isItemValid(item)) {
                return false;
            }
        }
        return true;
    };

    self.isEditable = function() {
        return canEdit;
    };

    self.isItemValid = function(item) {
        if (! item) {
            return false;
        }
        var type = item.type;
        var fields = SIREPO.APP_SCHEMA.model[type];
        for (var field in fields) {
            var fieldType = fields[field][1];
            if (! utilities.validateFieldOfType(item[field], fieldType)) {
                return false;
            }
        }
        return true;
    };

    self.isTouchscreen = function() {
        return isTouchscreen;
    };

    self.isWatchpointReportModelName = function(name) {
        return name.indexOf('watchpointReport') >= 0;
    };

    self.removeActiveItem = function() {
        if (self.activeItem) {
            self.removeElement(self.activeItem);
        }
    };

    self.removeElement = function(item) {
        self.dismissPopup();
        appState.models.beamline.splice(appState.models.beamline.indexOf(item), 1);
    };

    self.setActiveItem = function(item) {
        self.activeItem = item;
    };

    self.setEditable = function(value) {
        canEdit = value;
    };

    self.setupWatchpointDirective = function($scope) {
        var modelKey = self.watchpointReportName($scope.itemId);
        $scope.modelAccess = {
            modelKey: modelKey,
            getData: function() {
                return appState.models[modelKey];
            },
        };

        $scope.reportTitle = function() {
            return self.getReportTitle('watchpointReport', $scope.itemId);
        };
    };

    self.watchBeamlineField = function($scope, model, beamlineFields, callback, filterOldUndefined) {
        $scope.beamlineService = self;
        beamlineFields.forEach(function(f) {
            $scope.$watch('beamlineService.activeItem.' + f, function (newValue, oldValue) {
                if (appState.isLoaded() && newValue !== null && newValue !== undefined && newValue != oldValue) {
                    if (filterOldUndefined && oldValue === undefined) {
                        return;
                    }
                    var item = self.activeItem;
                    if (item && item.type == model) {
                        callback(item);
                    }
                }
            });
        });
    };

    self.watchpointReportName = function(id) {
        return 'watchpointReport' + id;
    };

    return self;
});

SIREPO.app.directive('beamlineBuilder', function(appState, beamlineService) {
    return {
        restrict: 'A',
        transclude: true,
        scope: {
            parentController: '=beamlineBuilder',
            beamlineModels: '=',
        },
        template: [
            '<div class="srw-beamline text-center" data-ng-drop="true" data-ng-drop-success="dropComplete($data, $event)">',
              '<div data-ng-transclude=""></div>',
              '<p class="lead text-center">beamline definition area<br>',
              '<small data-ng-if="beamlineService.isEditable()"><em>drag and drop optical elements here to define the beamline</em></small></p>',
              '<div class="srw-beamline-container">',
                '<div style="display: inline-block" data-ng-repeat="item in getBeamline() track by item.id">',
                  '<div data-ng-if="$first" class="srw-drop-between-zone" data-ng-drop="true" data-ng-drop-success="dropBetween(0, $data)">&nbsp;</div>',
                  '<div data-ng-drag="true" data-ng-drag-data="item" data-item="item" data-beamline-item="" ',
                    'class="srw-beamline-element {{ beamlineService.isTouchscreen() ? \'\' : \'srw-hover\' }}" ',
                    'data-ng-class="{\'srw-disabled-item\': item.isDisabled, \'srw-beamline-invalid\': ! beamlineService.isItemValid(item)}">',
                  '</div><div class="srw-drop-between-zone" data-ng-drop="true" data-ng-drop-success="dropBetween($index + 1, $data)">&nbsp;</div>',
                '</div>',
            '</div>',
            '<div class="row"><div class="srw-popup-container-lg col-sm-10 col-md-8 col-lg-6"></div></div>',
              '<div class="row">',
                '<form>',
                  '<div class="col-md-6 col-sm-8 pull-right" data-ng-show="checkIfDirty()">',
                    '<button data-ng-click="saveBeamlineChanges()" class="btn btn-primary" data-ng-show="beamlineService.isBeamlineValid()">Save Changes</button> ',
                    '<button data-ng-click="cancelBeamlineChanges()" class="btn btn-default">Cancel</button>',
                  '</div>',
                '</form>',
              '</div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.beamlineService = beamlineService;

            function addItem(item) {
                var newItem = appState.clone(item);
                newItem.id = appState.maxId(appState.models.beamline) + 1;
                newItem.showPopover = true;
                if (appState.models.beamline.length) {
                    newItem.position = parseFloat(appState.models.beamline[appState.models.beamline.length - 1].position) + 1;
                }
                else {
                    if ('distanceFromSource' in appState.models.simulation) {
                        newItem.position = appState.models.simulation.distanceFromSource;
                    }
                    else {
                        newItem.position = 20;
                    }
                }
                if (newItem.type == 'ellipsoidMirror') {
                    newItem.firstFocusLength = newItem.position;
                }
                if (newItem.type == 'watch') {
                    appState.models[beamlineService.watchpointReportName(newItem.id)] = appState.setModelDefaults(
                        appState.cloneModel('initialIntensityReport'), 'watchpointReport');
                }
                appState.models.beamline.push(newItem);
                beamlineService.dismissPopup();
            }

            $scope.cancelBeamlineChanges = function() {
                beamlineService.dismissPopup();
                appState.cancelChanges($scope.beamlineModels);
            };
            $scope.dropComplete = function(data) {
                if (data && ! data.id) {
                    addItem(data);
                }
            };
            $scope.getBeamline = function() {
                return appState.models.beamline;
            };
            $scope.dropBetween = function(index, data) {
                if (! data) {
                    return;
                }
                var item;
                if (data.id) {
                    beamlineService.dismissPopup();
                    var curr = appState.models.beamline.indexOf(data);
                    if (curr < index) {
                        index--;
                    }
                    appState.models.beamline.splice(curr, 1);
                    item = data;
                }
                else {
                    // move last item to this index
                    item = appState.models.beamline.pop();
                }
                appState.models.beamline.splice(index, 0, item);
                if (appState.models.beamline.length > 1) {
                    if (index === 0) {
                        item.position = parseFloat(appState.models.beamline[1].position) - 0.5;
                    }
                    else if (index === appState.models.beamline.length - 1) {
                        item.position = parseFloat(appState.models.beamline[appState.models.beamline.length - 1].position) + 0.5;
                    }
                    else {
                        item.position = Math.round(100 * (parseFloat(appState.models.beamline[index - 1].position) + parseFloat(appState.models.beamline[index + 1].position)) / 2) / 100;
                    }
                }
            };
            $scope.checkIfDirty = function() {
                var isDirty = false;
                if ($scope.beamlineModels) {
                    var savedValues = appState.applicationState();
                    var models = appState.models;
                    $scope.beamlineModels.forEach(function(name) {
                        if (! appState.deepEquals(savedValues[name], models[name])) {
                            isDirty = true;
                        }
                    });
                }
                return isDirty;
            };

            $scope.saveBeamlineChanges = function() {
                // sort beamline based on position
                appState.models.beamline.sort(function(a, b) {
                    return parseFloat(a.position) - parseFloat(b.position);
                });
                $scope.parentController.prepareToSave();

                // culls and saves watchpoint models
                var watchpoints = {};
                for (var i = 0; i < appState.models.beamline.length; i++) {
                    var item = appState.models.beamline[i];
                    if (item.type == 'watch') {
                        watchpoints[beamlineService.watchpointReportName(item.id)] = true;
                    }
                }
                var savedModelValues = appState.applicationState();
                for (var modelName in appState.models) {
                    if (beamlineService.isWatchpointReportModelName(modelName) && ! watchpoints[modelName]) {
                        // deleted watchpoint, remove the report model
                        delete appState.models[modelName];
                        delete savedModelValues[modelName];
                        continue;
                    }
                    if (beamlineService.isWatchpointReportModelName(modelName)) {
                        savedModelValues[modelName] = appState.cloneModel(modelName);
                    }
                }
                appState.saveChanges($scope.beamlineModels);
            };
        },
    };
});

SIREPO.app.directive('beamlineIcon', function() {
    return {
        scope: {
            item: '=',
        },
        template: [
            '<svg class="srw-beamline-item-icon" viewbox="0 0 50 60" data-ng-switch="item.type">',
              '<g data-ng-switch-when="lens">',
                '<path d="M25 0 C30 10 30 50 25 60" class="srw-lens" />',
                '<path d="M25 60 C20 50 20 10 25 0" class="srw-lens" />',
              '</g>',
              '<g data-ng-switch-when="aperture">',
                '<rect x="23", y="0", width="5", height="24" class="srw-aperture" />',
                '<rect x="23", y="36", width="5", height="24" class="srw-aperture" />',
              '</g>',
              '<g data-ng-switch-when="ellipsoidMirror">',
                '<path d="M30 2 C40 10 40 50 30 58 L43 58 L43 2 L30 2" class="srw-mirror" />',
                '<ellipse cx="27" cy="30" rx="10" ry="28" class="srw-curvature" />',
              '</g>',
              '<g data-ng-switch-when="grating">',
                '<polygon points="24,0 20,15, 24,17 20,30 24,32 20,45 24,47 20,60 24,60 28,60 28,0" class="srw-mirror" />',
              '</g>',
              '<g data-ng-switch-when="mirror">',
                '<rect x="23" y="0" width="5", height="60" class="srw-mirror" />',
              '</g>',
              '<g data-ng-switch-when="sphericalMirror">',
                '<path d="M28 6 C54 10 54 50 28 54 L49 54 L49 6 L28 6" class="srw-mirror" />',
                '<ellipse cx="24" cy="30" rx="23" ry="23" class="srw-curvature" />',
              '</g>',
              '<g data-ng-switch-when="obstacle">',
                '<rect x="15" y="20" width="20", height="20" class="srw-obstacle" />',
              '</g>',
              '<g data-ng-switch-when="crl">',
                '<rect x="15", y="0", width="20", height="60" class="srw-crl" />',
                '<path d="M25 0 C30 10 30 50 25 60" class="srw-lens" />',
                '<path d="M25 60 C20 50 20 10 25 0" class="srw-lens" />',
                '<path d="M15 0 C20 10 20 50 15 60" class="srw-lens" />',
                '<path d="M15 60 C10 50 10 10 15 0" class="srw-lens" />',
                '<path d="M35 0 C40 10 40 50 35 60" class="srw-lens" />',
                '<path d="M35 60 C30 50 30 10 35 0" class="srw-lens" />',
              '</g>',
              '<g data-ng-switch-when="crystal">',
                '<rect x="8" y="25" width="50", height="6" class="srw-crystal" transform="translate(0) rotate(-30 50 50)" />',
              '</g>',
              '<g data-ng-switch-when="fiber" transform="translate(0) rotate(20 20 40)">',
                '<path d="M-10,35 L10,35" class="srw-fiber"/>',
                '<ellipse cx="10" cy="35" rx="3" ry="5" class="srw-fiber" />',
                '<path d="M10,30 L40,29 40,41 L10,40" class="srw-fiber"/>',
                '<ellipse cx="40" cy="35" rx="3"  ry="6" class="srw-fiber-right" />',
                '<path d="M40,35 L60,35" class="srw-fiber"/>',
              '</g>',
              '<g data-ng-switch-when="mask">',
                '<rect x="2" y="10" width="60", height="60" />',
                '<circle cx="11" cy="20" r="2" class="srw-mask" />',
                '<circle cx="21" cy="20" r="2" class="srw-mask" />',
                '<circle cx="31" cy="20" r="2" class="srw-mask" />',
                '<circle cx="41" cy="20" r="2" class="srw-mask" />',
                '<circle cx="11" cy="30" r="2" class="srw-mask" />',
                '<circle cx="21" cy="30" r="2" class="srw-mask" />',
                '<circle cx="31" cy="30" r="2" class="srw-mask" />',
                '<circle cx="41" cy="30" r="2" class="srw-mask" />',
                '<circle cx="11" cy="40" r="2" class="srw-mask" />',
                '<circle cx="21" cy="40" r="2" class="srw-mask" />',
                '<circle cx="31" cy="40" r="2" class="srw-mask" />',
                '<circle cx="41" cy="40" r="2" class="srw-mask" />',
                '<circle cx="11" cy="50" r="2" class="srw-mask" />',
                '<circle cx="21" cy="50" r="2" class="srw-mask" />',
                '<circle cx="31" cy="50" r="2" class="srw-mask" />',
                '<circle cx="41" cy="50" r="2" class="srw-mask" />',
              '</g>',
              '<g data-ng-switch-when="watch">',
                '<path d="M5 30 C 15 45 35 45 45 30" class="srw-watch" />',
                '<path d="M45 30 C 35 15 15 15 5 30" class="srw-watch" />',
                '<circle cx="25" cy="30" r="10" class="srw-watch" />',
                '<circle cx="25" cy="30" r="4" class="srw-watch-pupil" />',
              '</g>',
              '<g data-ng-switch-when="sample">',
                '<rect x="2" y="10" width="60", height="60" />',
                '<circle cx="26" cy="35" r="18" class="srw-sample-white" />',
                '<circle cx="26" cy="35" r="16" class="srw-sample-black" />',
                '<circle cx="26" cy="35" r="14" class="srw-sample-white" />',
                '<circle cx="26" cy="35" r="12" class="srw-sample-black" />',
                '<circle cx="26" cy="35" r="10" class="srw-sample-white" />',
                '<circle cx="26" cy="35" r="8" class="srw-sample-black" />',
                '<circle cx="26" cy="35" r="6" class="srw-sample-white" />',
                '<circle cx="26" cy="35" r="4" class="srw-sample-black" />',
              '</g>',
              '<g data-ng-switch-when="toroidalMirror">',
                '<path d="M17.5 3.5 C27.5 11.5 27.5 46.5 17.5 54.5" class="srw-dash-stroke"></path>',
                '<path d="M12.5 27.5 C27.5 28.5 32.5 29.5 37.5 32.5" class="srw-dash-stroke"></path>',
                '<path d="M30 7 C40 15 40 50 30 58 L43 58 L43 7 L30 7" class="srw-mirror"></path>',
                '<path d="M5 2 C20 3 25 4 30 7 L43 7 L18 2 L5 2" class="srw-mirror"></path>',
                '<path d="M5 2 C15 10 15 45 5 53 C20 54 25 55 30 58" class="srw-no-fill"></path>',
              '</g>',
            '</svg>',
        ].join(''),
    };
});

SIREPO.app.directive('beamlineItem', function(beamlineService, $timeout) {
    return {
        scope: {
            item: '=',
        },
        template: [
            '<span class="srw-beamline-badge badge">{{ item.position ? item.position + \'m\' : (item.position === 0 ? \'0m\' : \'⚠ \') }}</span>',
            '<span data-ng-if="showItemButtons()" data-ng-click="beamlineService.removeElement(item)" class="srw-beamline-close-icon glyphicon glyphicon-remove-circle" title="Delete Element"></span>',
            '<span data-ng-if="showItemButtons()" data-ng-click="toggleDisableElement(item)" class="srw-beamline-disable-icon glyphicon glyphicon-off" title="Disable Element"></span>',
            '<div class="srw-beamline-image">',
              '<span data-beamline-icon="", data-item="item"></span>',
            '</div>',
            '<div data-ng-attr-id="srw-item-{{ item.id }}" class="srw-beamline-element-label">{{ (beamlineService.isItemValid(item) ? \'\' : \'⚠ \') + item.title }}<span class="caret"></span></div>',
        ].join(''),
        controller: function($scope) {
            $scope.beamlineService = beamlineService;
            $scope.showItemButtons = function() {
                return beamlineService.isEditable();
            };
            $scope.toggleDisableElement = function(item) {
                if (item.isDisabled) {
                    delete item.isDisabled;
                }
                else {
                    item.isDisabled = true;
                }
            };
        },
        link: function(scope, element) {
            var el = $(element).find('.srw-beamline-element-label');
            el.on('click', togglePopover);
            el.popover({
                trigger: 'manual',
                html: true,
                placement: 'bottom',
                container: '.srw-popup-container-lg',
                viewport: { selector: '.srw-beamline'},
                content: function() {
                    return $('#srw-' + scope.item.type + '-editor');
                },
            }).on('show.bs.popover', function() {
                $('.srw-beamline-element-label').not(el).popover('hide');
                beamlineService.setActiveItem(scope.item);
            }).on('shown.bs.popover', function() {
                $('.popover-content .form-control').first().select();
            }).on('hide.bs.popover', function() {
                beamlineService.setActiveItem(null);
                var editor = el.data('bs.popover').getContent();
                // return the editor to the editor-holder so it will be available for the
                // next element of this type
                if (editor) {
                    $('.srw-editor-holder').trigger('sr.resetActivePage');
                    $('.srw-editor-holder').append(editor);
                }
            });

            function togglePopover() {
                if (beamlineService.activeItem) {
                    beamlineService.setActiveItem(null);
                    // clears the active item and invoke watchers before setting new active item
                    scope.$apply();
                }
                el.popover('toggle');
                scope.$apply();
            }
            if (beamlineService.isTouchscreen()) {
                var hasTouchMove = false;
                $(element).bind('touchstart', function() {
                    hasTouchMove = false;
                });
                $(element).bind('touchend', function() {
                    if (! hasTouchMove) {
                        togglePopover();
                    }
                    hasTouchMove = false;
                });
                $(element).bind('touchmove', function() {
                    hasTouchMove = true;
                });
            }
            else {
                $(element).find('.srw-beamline-image').click(function() {
                    togglePopover();
                });
            }
            if (scope.item.showPopover) {
                delete scope.item.showPopover;
                // when the item is added, it may have been dropped between items
                // don't show the popover until the position has been determined
                $timeout(function() {
                    var position = el.parent().position().left;
                    var width = $('.srw-beamline-container').width();
                    var itemWidth = el.width();
                    if (position + itemWidth > width) {
                        var scrollPoint = $('.srw-beamline-container').scrollLeft();
                        $('.srw-beamline-container').scrollLeft(position - width + scrollPoint + itemWidth);
                    }
                    el.popover('show');
                }, 500);
            }
            scope.$on('$destroy', function() {
                if (beamlineService.isTouchscreen()) {
                    $(element).bind('touchstart', null);
                    $(element).bind('touchend', null);
                    $(element).bind('touchmove', null);
                }
                else {
                    $(element).find('.srw-beamline-image').off();
                    $(element).off();
                }
                var el = $(element).find('.srw-beamline-element-label');
                el.off();
                var popover = el.data('bs.popover');
                // popover has a memory leak with $tip user_data which needs to be cleaned up manually
                if (popover && popover.$tip) {
                    popover.$tip.removeData('bs.popover');
                }
                el.popover('destroy');
            });
        },
    };
});

SIREPO.app.directive('beamlineItemEditor', function(appState, beamlineService) {
    return {
        scope: {
            modelName: '@',
            parentController: '=',
        },
        template: [
            '<div>',
              '<button type="button" class="close" ng-click="beamlineService.dismissPopup()"><span>&times;</span></button>',
              '<div data-help-button="{{ title }}"></div>',
              '<form name="form" class="form-horizontal" autocomplete="off" novalidate>',
                '<div class="sr-beamline-element-title">{{ title }}</div>',
                '<div data-advanced-editor-pane="" data-view-name="modelName" data-model-data="modelAccess" data-parent-controller="parentController"></div>',
                '<div class="form-group">',
                  '<div class="col-sm-offset-6 col-sm-3">',
                    '<button ng-click="beamlineService.dismissPopup()" style="width: 100%" type="submit" class="btn btn-primary" data-ng-disabled="! form.$valid">Close</button>',
                  '</div>',
                '</div>',
                '<div class="form-group" data-ng-show="beamlineService.isTouchscreen() && beamlineService.isEditable()">',
                  '<div class="col-sm-offset-6 col-sm-3">',
                    '<button ng-click="beamlineService.removeActiveItem()" style="width: 100%" type="submit" class="btn btn-danger">Delete</button>',
                  '</div>',
                '</div>',
              '</form>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.beamlineService = beamlineService;
            $scope.title = appState.viewInfo($scope.modelName).title;
            $scope.modelAccess = {
                modelKey: $scope.modelName,
                getData: function() {
                    return beamlineService.activeItem;
                },
            };
        },
    };
});

SIREPO.app.directive('beamlineReports', function(beamlineService) {
    return {
        restrict: 'A',
        scope: {},
        template: [
            '<div class="col-md-6 col-xl-4">',
              '<div data-report-panel="3d" data-request-priority="1" data-model-name="initialIntensityReport" data-panel-title="{{ beamlineService.getReportTitle(\'initialIntensityReport\') }}"></div>',
            '</div>',
            '<div class="col-md-6 col-xl-4" data-ng-if="! item.isDisabled" data-ng-repeat="item in beamlineService.getWatchItems() track by item.id">',
              '<div data-watchpoint-report="" data-request-priority="{{ $index + 2 }}" data-item-id="item.id"></div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.beamlineService = beamlineService;
        },
    };
});

SIREPO.app.directive('beamlineToolbar', function(appState) {
    return {
        restrict: 'A',
        scope: {
            toolbarItemNames: '=beamlineToolbar',
            parentController: '=',
        },
        template: [
            '<div class="row">',
              '<div class="col-sm-12">',
                '<div class="text-center bg-info sr-toolbar-holder">',
                  '<div class="sr-toolbar-section" data-ng-repeat="section in ::sectionItems">',
                    '<div class="sr-toolbar-section-header"><span class="sr-toolbar-section-title">{{ ::section[0] }}</span></div>',
                    '<span data-ng-repeat="item in ::section[1]" class="srw-toolbar-button srw-beamline-image" data-ng-drag="true" data-ng-drag-data="item">',
                      '<span data-beamline-icon="" data-item="item"></span><br>{{ ::item.title }}',
                    '</span>',
                  '</div>',
                  '<span data-ng-repeat="item in ::standaloneItems" class="srw-toolbar-button srw-beamline-image" data-ng-drag="true" data-ng-drag-data="item">',
                    '<span data-beamline-icon="" data-item="item"></span><br>{{ ::item.title }}',
                  '</span>',
                '</div>',
              '</div>',
            '</div>',
            '<div class="srw-editor-holder" style="display:none">',
              '<div data-ng-repeat="item in ::allItems">',
                '<div id="srw-{{ ::item.type }}-editor" data-beamline-item-editor="" data-model-name="{{ ::item.type }}" data-parent-controller="parentController" ></div>',
              '</div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.allItems = [];

            function addItem(name, items) {
                var featureName = name + '_in_toolbar';
                if (featureName in SIREPO.APP_SCHEMA.feature_config) {
                    if (! SIREPO.APP_SCHEMA.feature_config[featureName]) {
                        return;
                    }
                }
                var item = appState.setModelDefaults({type: name}, name);
                var MIRROR_TYPES = ['mirror', 'sphericalMirror', 'ellipsoidMirror', 'toroidalMirror'];
                if (MIRROR_TYPES.indexOf(item.type) >= 0) {
                    item.title = item.title.replace(' Mirror', '');
                }
                items.push(item);
                $scope.allItems.push(item);
            }

            function initToolbarItems() {
                var sections = [];
                var standalone = [];
                $scope.toolbarItemNames.forEach(function(section) {
                    var items = [];
                    if (angular.isArray(section)) {
                        section[1].forEach(function(name) {
                            addItem(name, items);
                        });
                        sections.push([section[0], items]);
                    }
                    else {
                        addItem(section, standalone);
                    }
                });
                $scope.sectionItems = sections;
                $scope.standaloneItems = standalone;
            }

            initToolbarItems();
        },
        link: function link(scope, element) {
            //TODO(pjm): work-around for iOS 10, it would be better to add into ngDraggable
            // see discussion here: https://github.com/metafizzy/flickity/issues/457
            window.addEventListener('touchmove', function() {});
        },
    };
});

SIREPO.app.directive('watchpointModalEditor', function(beamlineService) {
    return {
        scope: {
            parentController: '=',
            itemId: '=',
        },
        template: [
            '<div data-modal-editor="" view-name="watchpointReport" data-parent-controller="parentController" data-model-data="modelAccess" data-modal-title="reportTitle()"></div>',
        ].join(''),
        controller: function($scope) {
            beamlineService.setupWatchpointDirective($scope);
        },
    };
});

SIREPO.app.directive('watchpointReport', function(beamlineService) {
    return {
        scope: {
            itemId: '=',
            requestPriority: '@',
        },
        template: [
            '<div data-report-panel="3d" data-model-name="watchpointReport" data-model-data="modelAccess" data-panel-title="{{ reportTitle() }}"></div>',
        ].join(''),
        controller: function($scope) {
            beamlineService.setupWatchpointDirective($scope);
        },
    };
});
