(function () {
    "use strict";

    var HttpParser = require("http-parser-js");
    process.binding("http_parser").HTTPParser = HttpParser.HTTPParser;

    var Url      = require("url");
    var Flags    = require("flags");
    var Url      = require("url");
    var Path     = require("path");
    var Listener = require("./listener");
    var Http     = require("http");
    var Https    = require("https");

    var defaultPort = 9000;

    var mapRequest = function (req, parsedUrl) {
        var implementation = parsedUrl.protocol === "https:" ? Https : Http;
        // console.error("request", parsedUrl, {
        //     method:   req.method,
        //     hostname: parsedUrl.hostname,
        //     port:     parsedUrl.port,
        //     path:     parsedUrl.path,
        //     headers:  req.headers
        // });
        console.error("sending request", req.method, {
            method:   req.method,
            hostname: parsedUrl.hostname,
            port:     parsedUrl.port,
            path:     parsedUrl.path,
            headers:  req.headers
        });
        var preq = implementation.request({
            method:   req.method,
            hostname: parsedUrl.hostname,
            port:     parsedUrl.port,
            path:     parsedUrl.path,
            headers:  req.headers
        });

        req.on("data", function (data) {
            // console.error("request data");
            // console.error(data.toString());
            preq.write(data, "binary");
        });

        req.on("end", function () {
            console.error("request end triggered");
            preq.end();
        });

        return preq;
    };

    var mapResponse = function (pres, res) {
        delete pres.headers["strict-transport-security"];
        res.writeHead(pres.statusCode, pres.headers);

        pres.on("data", function (data) {
            // console.error("response data");
            // console.error(data.toString());
            res.write(data, "binary");
        });

        pres.on("end", function () {
            res.end();
        });
    };

    var proxyError = function (res, url) {
        res.writeHead(418, {"Content-Type": "text/plain"});
        res.write("error: probably, proxy could not resolve host " + url.host + "\n");
        res.end();
    };

    var applyFilters = function (filters, req, res) {
        var handled = false;

        var logErr = function (err) {
            console.error("main request error", err);
        };
        req.on("error", logErr);
        res.on("error", function (err) {
            console.error("main response error", err);
        });

        filters.forEach(function (filter) {
            handled = filter(req, res, handled) || handled;
        });

        return handled;
    };

    var proxy = function (req, res, filters) {
        // console.error("proxying");
        var handled = applyFilters(filters, req, res);
        if (handled) {
            return;
        }

        var url  = Url.parse(req.url);
        var preq = mapRequest(req, url);

        preq.on("error", function (err) {
            // console.error("proxy request error", err);
            proxyError(res, url);
        });

        preq.on("response", function (pres) {
            console.error("response");
            pres.on("error", function (err) {
                // console.error("proxy response error", err);
            });

            mapResponse(pres, res);
        });

        // if (req.reworse && req.reworse.tunnel) {
            // console.error("sending end");
            preq.end();
        // }
    };

    var createServer = function (implementation, port, filters, clb) {
        var server = implementation.createServer();

        server.on("request", function (req, res) {
            proxy(req, res, filters);
        });

        server.listen(port, function (err) {
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
        return createServer(Listener, Flags.get("port"), getFilters(requireFilter), clb);
    };

    run.defaultPort = defaultPort;

    module.exports = run;
})();
