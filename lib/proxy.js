(function () {
    "use strict";

    var Errors  = require("./errors");
    var Events  = require("events");
    var Headers = require("./headers");
    var Http    = require("http");
    var Https   = require("https");
    var Url     = require("url");

    var errorOrigin = "proxy";

    var proxyRequest = function (proxy, method, url, rawHeaders) {
        var url            = Url.parse(url);
        var implementation = url.protocol === "https:" ? Https : Http;

        var preq = implementation.request({
            method:   method,
            hostname: url.hostname,
            port:     url.port,
            path:     url.path,
            headers:  Headers.mapRaw(rawHeaders)
        });

        Errors.map(preq, proxy, errorOrigin + "-proxyrequest");

        return preq;
    };

    var copyRequestData = function (req, preq) {
        var contentLength    = 0;
        var receivedLength   = 0;
        var requestEndCalled = false;

        if (req.headers["content-length"]) {
            contentLength = parseInt(req.headers["content-length"], 10);
        }

        req.on("data", function (data) {
            if (requestEndCalled) {
                return;
            }

            preq.write(data);
            receivedLength += data.length;

            if (contentLength > 0 && receivedLength >= contentLength) {
                preq.end();
                requestEndCalled = true;
            }
        });

        req.on("end", function () {
            if (!requestEndCalled) {
                preq.end();
                requestEndCalled = true;
            }
        });
    };

    var mapRequest = function (proxy, req) {
        var preq = proxyRequest(proxy, req.method, req.url, req.rawHeaders);

        // todo: figure this better
        if (req.method === "POST" || req.method === "PUT") {
            copyRequestData(req, preq);
            return preq;
        }

        preq.end();
        return preq;
    };

    var proxyError = function (res, url) {
        res.writeHead(418, {"Content-Type": "text/plain"});
        res.write("error: probably, proxy could not resolve host " + url + "\n");
        res.end();
    };

    var noContentLength = function (res) {
        return res.headers["content-length"] === "0";
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
        if (noContentLength(res)) {
            return true;
        }

        if (noDataStatus(res)) {
            return true;
        }

        return false;
    };

    var mapResponse = function (pres, res) {
        Headers.conditionMessage(pres);
        res.writeHead(
            pres.statusCode,
            Headers.mapRaw(pres.rawHeaders)
        );

        if (noData(pres)) {
            res.end();
        } else {
            pres.on("data", res.write.bind(res));
            pres.on("end", res.end.bind(res));
        }
    };

    var forward = function (proxy, req, res) {
        Headers.conditionMessage(req);

        var preq = mapRequest(proxy, req);

        preq.on("error", function (err) {
            proxyError(res, preq.url);
        });

        preq.on("response", function (pres) {
            Errors.map(pres, proxy, errorOrigin);
            mapResponse(pres, res);
        });
    };

    // creates a proxy instance that forwards incoming
    // requests to their original destination and maps
    // the response to the original client.
    //
    // to map the requests, use the
    // instance.forward(request, response) method.
    //
    // on communication errors with the original
    // destination, 'error' events will be triggered.
    var create = function () {
        var proxy = new Events.EventEmitter;

        proxy.forward = function (req, res) {
            forward(proxy, req, res);
        };

        return proxy;
    };

    module.exports = {
        create:      create,
        errorOrigin: errorOrigin
    };
})();
