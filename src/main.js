(function () {
    "use strict";

    var HttpParser = require("http-parser-js");
    process.binding("http_parser").HTTPParser = HttpParser.HTTPParser;

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var Url      = require("url");
    var Flags    = require("flags");
    var Url      = require("url");
    var Path     = require("path");
    var Listener = require("./listener");
    var Http     = require("http");
    var Https    = require("https");

    var defaultPort = 9000;

    var rawHeaders = function (list) {
        var headers = {};
        for (var i = 0; i < list.length; i += 2) {
            headers[list[i]] = list[i + 1];
        }

        return headers;
    };

    var mapRequest = function (req, parsedUrl) {
        var implementation = parsedUrl.protocol === "https:" ? Https : Http;
        console.error("requesting", req.rawHeaders);
        var preq = implementation.request({
            method:   req.method,
            hostname: parsedUrl.hostname,
            port:     parsedUrl.port,
            path:     parsedUrl.path,
            headers:  rawHeaders(req.rawHeaders)
        });

        Listener.logError(preq, "proxy request");

        req.on("data", function (data) {
            preq.write(data, "binary");
        });

        req.on("end", function () {
            preq.end();
        });

        return preq;
    };

    var noContent = function (res) {
        return res.headers["content-length"] === 0;
    };

    var noDataStatus = function (res) {
        switch (res.statusCode) {
        case 204:
        case 205:
        case 304:
            return true;
        default:
            return false;
        }
    };

    var noData = function (res) {
        if (noContent(res)) {
            return true;
        }

        if (noDataStatus(res)) {
            return true;
        }

        return false;
    };

    var mapResponse = function (pres, res) {
        console.error("received", pres.statusCode, pres.rawHeaders);
        pres.rawHeaders = Listener.cleanHeaders(pres);
        res.writeHead(pres.statusCode, rawHeaders(pres.rawHeaders));

        if (noData(pres)) {
            console.error("no data");
            res.end();
        } else {
            pres.on("data", function (data) {
                res.write(data, "binary");
            });

            pres.on("end", function () {
                res.end();
            });
        }
    };

    var proxyError = function (res, url) {
        res.writeHead(418, {"Content-Type": "text/plain"});
        res.write("error: probably, proxy could not resolve host " + url.host + "\n");
        res.end();
    };

    var applyFilters = function (filters, req, res) {
        var handled = false;
        filters.forEach(function (filter) {
            handled = filter(req, res, handled) || handled;
        });

        return handled;
    };

    var proxy = function (req, res, filters) {
        var handled = applyFilters(filters, req, res);
        if (handled) {
            return;
        }

        var url  = Url.parse(req.url);
        var preq = mapRequest(req, url);

        preq.on("error", function (err) {
            proxyError(res, url);
        });

        preq.on("response", function (pres) {
            Listener.logError(pres);
            mapResponse(pres, res);
        });

        if (req.reworse && req.reworse.tunnel) {
            // todo: not good when posting data
            preq.end();
        }
    };

    var createServer = function (implementation, port, filters, clb) {
        var server = implementation.createServer();

        server.on("request", function (req, res) {
            proxy(req, res, filters);
        });

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

        paths.forEach(function (path) {
            if (!Path.isAbsolute(path)) {
                path = Path.join(process.cwd(), path);
            }

            var filter;
            try {
                filter = requireFilter(path);
            } catch (err) {
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
        return createServer(Listener, Flags.get("port"), getFilters(requireFilter), clb);
    };

    run.defaultPort = defaultPort;

    module.exports = run;
})();
