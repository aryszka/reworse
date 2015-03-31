(function () {
    "use strict";

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var Errors   = require("./errors");
    var Filters  = require("./filters");
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

        options.port               = options.port || Flags.get("port");
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
        try {
            return Filters.load(options.paths, options.require);
        } catch (err) {
            console.error("invalid filter:", err);
            process.exit(1);
        }
    };

    // starts a reworse instance:
    // - loads the command line flags
    // - loads the specified filters
    // - starts an http listener
    // - applies the loaded filters on the requests coming from
    //   the listener
    // - proxies the requests that are not handled by any filters
    //   to their original destination
    //
    // arguments:
    // - options: options to override command line flags
    // - clb:     optional callback executed when the listener is
    //            ready. expects the listener as argument.
    //
    // options:
    // - port:               port to which the listener will be
    //                       bound
    // - filters.paths:      paths where the filter modules can
    //                       be found
    // - listener.socketDir: directory to use for internal the
    //                       sockets
    //
    // returns the listener instance.
    //
    // the listener instance returned directly or through the
    // callback argument should be closed when not needed
    // anymore.
    var run = function (options, clb) {
        if (typeof options === "function") {
            clb     = options;
            options = undefined;
        }

        options = getOptions(options);

        var filters  = loadFilters(options.filters);
        var listener = Listener.createServer(options.listener);
        var proxy    = Proxy.create();

        Errors.handle(listener, "listener", options.errorHandler);
        Errors.handle(proxy, "proxy", options.errorHandler);

        listener.on("request", function (req, res) {
            var handled = Filters.apply(filters, req, res);
            if (!handled) {
                proxy.forward(req, res);
            }
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
