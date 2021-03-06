(function () {
    "use strict";

    var Errors              = require("./errors");
    var Filters             = require("./filters");
    var Listener            = require("./listener");
    var NotificationHandler = require("./notification-handler");
    var Defaults            = require("./defaults");
    var Proxy               = require("./proxy");

    // accept non-verified certificates
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var defaultOut = function (message) {
        console.error(message);
    };

    // starts a reworse instance:
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
    // - port:               port to which the listener will be bound
    // - filters.paths:      paths where the filter modules can be found
    // - listener.tlsCert:   key and certificate for https connections
    //                       {key: <key pem>, cert: <cert pem>}
    // - listener.socketDir: root directory path for the internal unix
    //                       sockets
    // - verbose:            verbose notifications enabled
    //
    // returns the started listener instance.
    //
    // the listener instance returned directly or through the
    // callback argument. it should be closed when not needed
    // anymore.
    var run = function (options, clb) {
        if (typeof options === "function") {
            clb     = options;
            options = undefined;
        }

        options         = options || {};
        options.filters = options.filters || {};
        options.out     = options.out || defaultOut;
        options.port    = options.port || Defaults.port;

        var filters;
        try {
            filters = Filters.load(
                options.filters.paths,
                options.filters.require
            );
        } catch (err) {
            options.out(["invalid filter:", err].join(" "));
            process.exit(1);
        }

        if (options.filters.preloaded) {
            filters = filters.concat(options.filters.preloaded);
        }

        var listener            = Listener.createServer(options.listener);
        var proxy               = Proxy.create();
        var notificationHandler = NotificationHandler.create(options);

        Errors.handle(listener, "listener", notificationHandler);
        Errors.handle(proxy, "proxy", notificationHandler);

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

    module.exports = {run: run};
})();
