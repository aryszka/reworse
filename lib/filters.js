(function () {
    "use strict";

    var Path = require("path");

    // loads filters specified by their path.
    // - paths: absolute or relative path to modules
    //          implementing filters.
    var load = function (paths, requireFilter) {
        paths = paths || [];
        requireFilter = requireFilter || require;

        return paths.map(function (path) {
            path = Path.resolve(path);
            return requireFilter(path);
        });
    };

    // applies filters for a given request.
    // - filters: list of filters
    // - req:     the request message object
    // - res:     the response object
    // returns true if any of the filters returned true,
    // indicating that it handled the request by sending
    // a response, otherwise returns false.
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
