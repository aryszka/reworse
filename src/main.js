(function () {
    "use strict";

    var Http  = require("http");
    var Url   = require("url");
    var Flags = require("flags");
    var Url   = require("url");
    var Path  = require("path");

    var defaultPort = 9000;

    var mapRequest = function (implementation, req, parsedUrl) {
        var preq = implementation.request({
            method:   req.method,
            hostname: parsedUrl.hostname,
            port:     parsedUrl.port,
            path:     parsedUrl.path,
            headers:  req.headers
        });

        req.on("data", function (data) {
            preq.write(data, "binary");
        });

        req.on("end", function () {
            preq.end();
        });

        return preq;
    };

    var mapResponse = function (pres, res) {
        res.writeHead(pres.statusCode, pres.headers);

        pres.on("data", function (data) {
            res.write(data, "binary");
        });

        pres.on("end", function () {
            res.end();
        });
    };

    var proxyError = function (res, url) {
        res.writeHead(418, {"Content-Type": "text/plain"});
        res.write("error: probably, proxy could not resolve host " + url.host);
        res.end();
    };

    var applyFilters = function (filters, req, res) {
        var handled = false;

        var logErr = function (err) {
            console.error(err);
        };
        req.on("error", logErr);
        res.on("error", logErr);

        filters.forEach(function (filter) {
            handled = filter(req, res, handled) || handled;
        });

        return handled;
    };

    var proxy = function (implementation, req, res, filters) {
        var handled = applyFilters(filters, req, res);
        if (handled) {
            return;
        }

        var url  = Url.parse(req.url);
        var preq = mapRequest(implementation, req, url);

        preq.on("error", function () {
            proxyError(res, url);
        });

        preq.on("response", function (pres) {
            mapResponse(pres, res);
        });
    };

    var createServer = function (implementation, port, filters, clb) {
        var server = implementation.createServer();

        server.on("request", function (req, res) {
            proxy(implementation, req, res, filters);
        });

        server.listen(port, function () {
            console.error("ready on port " + port);
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

        paths.forEach(function (path) {
            if (!Path.isAbsolute(path)) {
                path = Path.join(process.cwd(), path);
            }

            var filter;
            try {
                filter = requireFilter(path);
            } catch (err) {
                console.error("invalid filter:", path, "(" + err.message + ")");
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
        return createServer(Http, Flags.get("port"), getFilters(requireFilter), clb);
    };

    run.defaultPort = defaultPort;

    module.exports = run;
})();
