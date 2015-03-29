(function () {
    "use strict";

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var Errors   = require("./errors");
    var Flags    = require("flags");
    var Listener = require("./listener");
    var Path     = require("path");
    var Proxy    = require("./proxy");

    var defaultPort = 9000;

    var initFlags = function () {
        Flags.reset();

        Flags.defineMultiString("filter", []);
        Flags.defineInteger("port", defaultPort);
        Flags.defineString("socket-dir", Listener.defaultSocketDir);
        Flags.defineString("tls-key");
        Flags.defineString("tls-cert");

        Flags.parse();
    };

    var getTlsCert = function (keyPath, certPath) {
        return {
            key:  Fs.readFileSync(keyPath),
            cert: Fs.readFileSync(certPath)
        };
    };

    var getOptions = function (options) {
        options = options || {};

        initFlags();

        options.port               = Flags.get("port");
        options.filters            = options.filters || {};
        options.filters.paths      = options.filters.paths || Flags.get("filter");
        options.listener           = options.listener || {};
        options.listener.socketDir = options.listener.socketDir || Flags.get("socket-dir");

        if (!options.listener.tlsCert && Flags.get("tls-cert")) {
            try {
                options.listener.tlsCert = getTlsCert(
                    Flags.get("tls-key"),
                    Flags.get("tls-cert")
                );
            } catch (err) {
                console.error("failed to read tls certificate", err);
                process.exit(-1);
            }
        }

        return options;
    };

    var loadFilters = function (options) {
        options.paths   = options.paths || [];
        options.require = options.require || require;

        var filters = [];

        options.paths.map(function (path) {
            path = Path.resolve(path);

            var filter;
            try {
                filter = options.require(path);
            } catch (err) {
                console.error("invalid filter:", path, err);
                process.exit(1);
            }

            filters.push(filter);
        });

        return filters;
    };

    var applyFilters = function (filters, req, res) {
        var handled = false;

        filters.map(function (filter) {
            handled = filter(req, res, handled) || handled;
        });

        return handled;
    };

    var run = function (options, clb) {
        if (typeof options === "function") {
            clb     = options;
            options = undefined;
        }

        options = getOptions(options);

        var filters  = loadFilters(options.filters);
        var listener = Listener.createServer(options.listener);
        var prx      = Proxy.create();

        Errors.handle("listener", listener);
        Errors.handle("proxy", prx);

        listener.on("request", function (req, res) {
            if (applyFilters(filters, req, res)) {
                return;
            }

            prx.handle(req, res);
        });

        listener.listen(options.port, function () {
            if (clb) {
                clb(listener);
            }
        });

        return listener;
    };

    module.exports = {
        defaultPort: defaultPort,
        run:         run
    };
})();
