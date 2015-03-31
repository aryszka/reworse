suite("filters", function () {
    "use strict";

    var assert  = require("assert");
    var Filters = require("./filters");
    var Path    = require("path");

    var requireFilter = function (path) {
        return {path: path};
    };

    var makeFilter = function (handledBefore, handles) {
        return function (req, res, handled) {
            assert(handled === handledBefore);
            return handles;
        };
    };

    test("loads empty filter list", function () {
        var filters = Filters.load([]);
        assert(filters.length === 0);
    });

    test("loads filters with absolute path", function () {
        var paths   = ["filter0", "filter1", "filter2"];
        var filters = Filters.load(paths, requireFilter);

        assert(filters.length === paths.length);
        assert(paths.every(function (path) {
            return filters.some(function (filter) {
                return filter.path === Path.resolve(path);
            });
        }));
    });

    test("applies zero filters", function () {
        var handled = Filters.apply([]);
        assert(!handled);
    });

    test("applies filters", function () {
        var filters = [
            makeFilter(false, false),
            makeFilter(false, true),
            makeFilter(true, false)
        ];

        var handled = Filters.apply(filters, {}, {});
        assert(handled);
    });
});
