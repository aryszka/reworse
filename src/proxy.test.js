suite("proxy", function () {
    "use strict";

    var assert  = require("assert");
    var Events  = require("events");
    var Headers = require("./headers");
    var Http    = require("http");
    var Https   = require("https");
    var Proxy   = require("./proxy");
    var Url     = require("url");

    var httpRequest   = Http.request;
    var httpsRequest  = Https.request;
    var proxyRequests = new Events.EventEmitter;

    var makeProxyRequest = function (protocol) {
        return function (options) {
            var req = new Events.EventEmitter;

            req.protocol = protocol;
            req.options  = options;

            req.write = function (data) {
                req.emit("data", data);
            };

            req.end = function () {
                req.ended = true;
                req.emit("end");
            };

            setTimeout(function () {
                proxyRequests.emit("request", req);
            });

            return req;
        };
    };

    var testProxyResponse = function (options) {
        options = options || {};

        var res = new Events.EventEmitter;

        res.statusCode = options.statusCode || 200;
        res.rawHeaders = options.rawHeaders || [];
        res.headers    = options.headers || {};

        return res;
    };

    var testRequest = function (options) {
        options = options || {};

        var req = new Events.EventEmitter;

        req.method     = options.method || "GET";
        req.url        = options.url || "https://test-url";
        req.rawHeaders = options.rawHeaders || [];
        req.headers    = options.headers || {};

        return req;
    };

    var testResponse = function () {
        var res = new Events.EventEmitter;

        res.writeHead = function (statusCode, headers) {
            res.emit("head", statusCode, headers);
        };

        res.write = function (data) {
            res.emit("data", data);
        };

        res.end = function () {
            res.emit("end");
        };

        return res;
    };

    setup(function () {
        Http.request  = makeProxyRequest("http:");
        Https.request = makeProxyRequest("https:");
    });

    teardown(function () {
        Http.request  = httpRequest;
        Https.request = httpsRequest;

        proxyRequests.removeAllListeners();
    });

    test("maps non-tls to non-tls requests", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest({url: "http://test-url"});

        proxyRequests.on("request", function (preq) {
            assert(preq.protocol === "http:");
            done();
        });

        proxy.forward(req, testResponse());
    });

    test("maps tls to tls requests", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest({url: "https://test-url"});

        proxyRequests.on("request", function (preq) {
            assert(preq.protocol === "https:");
            done();
        });

        proxy.forward(req, testResponse());
    });

    test("maps request method", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest({method: "DELETE"});

        proxyRequests.on("request", function (preq) {
            assert(preq.options.method === "DELETE");
            done();
        });

        proxy.forward(req, testResponse());
    });

    test("maps request url", function (done) {
        var proxy = Proxy.create();
        var url   = "https://test-domain:9090/test-path";
        var req   = testRequest({url: url});

        proxyRequests.on("request", function (preq) {
            var testUrl = Url.parse(url);

            assert(preq.options.hostname === testUrl.hostname);
            assert(preq.options.port === testUrl.port);
            assert(preq.options.path === testUrl.path);

            done();
        });

        proxy.forward(req, testResponse());
    });

    test("maps request headers", function (done) {
        var proxy = Proxy.create();

        var rawHeaders = [
            "Some-Header-0", "some value 0",
            "Some-Header-1", "some value 1"
        ];

        var req = testRequest({rawHeaders: rawHeaders});

        proxyRequests.on("request", function (preq) {
            for (var i = 0; i < rawHeaders.length; i += 2) {
                assert(preq.options.headers[rawHeaders[i]] === rawHeaders[i + 1]);
            }

            done();
        });

        proxy.forward(req, testResponse());
    });

    test("maps request errors to proxy", function (done) {
        var proxy     = Proxy.create();
        var req       = testRequest();
        var testError = "test error";

        proxyRequests.on("request", function (preq) {
            preq.emit("error", testError);
        });

        proxy.on("error", function (err, origin) {
            assert(origin.indexOf(Proxy.errorOrigin) === 0);
            done();
        });

        proxy.forward(req, testResponse());
    });

    test("copies data until content length", function (done) {
        var proxy = Proxy.create();

        var req = testRequest({
            method:  "PUT",
            headers: {"content-length": "3"}
        });

        proxyRequests.on("request", function (preq) {
            var pdata = new Buffer("");

            preq.on("data", function (data) {
                pdata = Buffer.concat([pdata, data]);
            });

            preq.on("end", function () {
                assert(pdata.toString() === "123");
                done();
            });

            req.emit("data", new Buffer("1"));
            req.emit("data", new Buffer("2"));
            req.emit("data", new Buffer("3"));
        });

        proxy.forward(req, testResponse());
    });

    test("copies data until end received", function (done) {
        var proxy = Proxy.create();

        var req = testRequest({
            method:  "PUT",
            headers: {"content-length": "3"}
        });

        proxyRequests.on("request", function (preq) {
            var pdata = new Buffer("");

            preq.on("data", function (data) {
                pdata = Buffer.concat([pdata, data]);
            });

            preq.on("end", function () {
                assert(pdata.toString() === "12");
                done();
            });

            req.emit("data", new Buffer("1"));
            req.emit("data", new Buffer("2"));
            req.emit("end");
            req.emit("data", new Buffer("3"));
        });

        proxy.forward(req, testResponse());
    });

    test("does not copy data if not PUT or POST (todo!!!)", function (done) {
        var proxy = Proxy.create();

        var req = testRequest({
            method:  "GET",
            headers: {"content-length": "3"}
        });

        proxyRequests.on("request", function (preq) {
            assert(preq.ended);
            done();
        });

        proxy.forward(req, testResponse());
    });

    test("response teapot on request error", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();

        res.on("head", function (statusCode) {
            assert(statusCode === 418);
            done();
        });

        proxyRequests.on("request", function (preq) {
            preq.emit("error", "test error");
        });

        proxy.on("error", function () {});
        proxy.forward(req, res);
    });

    test("maps response errors to proxy", function (done) {
        var proxy     = Proxy.create();
        var req       = testRequest();
        var res       = testResponse();
        var testError = "test error";

        proxyRequests.on("request", function (preq) {
            var pres = testProxyResponse();

            preq.emit("response", pres);
            pres.emit("error", testError);
        });

        proxy.on("error", function (err, origin) {
            assert(err === testError);
            assert(origin.indexOf(Proxy.errorOrigin) === 0);

            done();
        });

        proxy.forward(req, res);
    });

    test("conditions response headers", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();

        var rawHeaders = [
            "some-Header-0", "some value 0",
            "Some-header-1", "some value 1"
        ];

        var pres = testProxyResponse({rawHeaders: rawHeaders});

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("head", function (_, headers) {
            var canonical = Headers.canonicalHeaders(rawHeaders);

            for (var i = 0; i < canonical.length; i += 2) {
                assert(headers[canonical[i]] === canonical[i + 1]);
            }

            done();
        });

        proxy.forward(req, res);
    });

    test("finishes response if no content", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();
        var pres  = testProxyResponse({headers: {"content-length": "0"}});

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("end", function () {
            done();
        });

        proxy.forward(req, res);
    });

    test("finishes response if status 204", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();
        var pres  = testProxyResponse({statusCode: 204});

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("end", function () {
            done();
        });

        proxy.forward(req, res);
    });

    test("finishes response if status 205", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();
        var pres  = testProxyResponse({statusCode: 205});

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("end", function () {
            done();
        });

        proxy.forward(req, res);
    });

    test("finishes response if status 304", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();
        var pres  = testProxyResponse({statusCode: 304});

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("end", function () {
            done();
        });

        proxy.forward(req, res);
    });

    test("finishes response on response end", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();
        var pres  = testProxyResponse();

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
            pres.emit("end");
        });

        res.on("end", function () {
            done();
        });

        proxy.forward(req, res);
    });
});
