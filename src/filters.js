(function () {
    "use strict";

    var Path = require("path");

    var load = function (paths, requireFilter) {
        paths = paths || [];
        requireFilter = requireFilter || require;

        return paths.map(function (path) {
            path = Path.resolve(path);
            return requireFilter(path);
        });
    };

    var apply = function (filters, req, res) {
        return filters.reduce(function (handled, filter) {
            return filter(req, res, handled) || handled;
        }, false);
    };

    module.exports = {
        load:  load,
        apply: apply
    };
})();
