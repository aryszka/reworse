(function () {
    "use strict";

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var Errors   = require("./errors");
    var Flags    = require("flags");
    var Headers  = require("./headers");
    var Http     = require("http");
    var Https    = require("https");
    var Listener = require("./listener");
    var Path     = require("path");
    var Proxy    = require("./proxy");
    var Url      = require("url");

    var defaultPort = 9000;

    var applyFilters = function (filters, req, res) {
        var handled = false;
        filters.map(function (filter) {
            handled = filter(req, res, handled) || handled;
        });

        return handled;
    };

    var proxy = function (req, res, prx, filters) {
        var handled = applyFilters(filters, req, res);
        if (handled) {
            return;
        }

        prx.handle(req, res);
    };

    var createServer = function (implementation, port, filters, clb) {
        var server = implementation.createServer();
        var prx = Proxy.create();

        server.on("request", function (req, res) {
            proxy(req, res, prx, filters);
        });

        Errors.handle("listener error", server);

        server.listen(port, function (err) {
            if (clb) {
                clb(server);
            }
        });

        return server;
    };

    var initFlags = function () {
        Flags.reset();
        Flags.defineMultiString("filter", []);
        Flags.defineInteger("port", defaultPort);
        Flags.parse();
    };

    var getFilters = function (requireFilter) {
        var paths   = Flags.get("filter");
        var filters = [];

        paths.map(function (path) {
            if (!Path.isAbsolute(path)) {
                path = Path.join(process.cwd(), path);
            }

            var filter;
            try {
                filter = requireFilter(path);
            } catch (err) {
                console.error("invalid filter:", path);
                process.exit(1);
            }

            filters.push(filter);
        });

        return filters;
    };

    var run = function (requireFilter, clb) {
        if (arguments.length < 2) {
            clb = requireFilter;
            requireFilter = require;
        }

        initFlags();
        return createServer(
            Listener,
            Flags.get("port"),
            getFilters(requireFilter),
            clb
        );
    };

    run.defaultPort = defaultPort;
    run.run         = run;

    module.exports = run;
})();
