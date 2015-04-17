suite("proxy", function () {
    "use strict";

    var assert     = require("assert");
    var Events     = require("events");
    var Headers    = require("./headers");
    var Http       = require("http");
    var Https      = require("https");
    var MockModule = require("./mock-module");
    var Proxy      = require("./proxy");
    var Url        = require("url");

    var mocks         = MockModule.create();
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
        var res  = new Events.EventEmitter;
        var noop = function () {};

        res.writeHead = noop;
        res.write     = noop;
        res.end       = noop;

        return res;
    };

    setup(function () {
        mocks.mock(Http, "request", makeProxyRequest("http:"));
        mocks.mock(Https, "request", makeProxyRequest("https:"));
    });

    teardown(function () {
        mocks.teardown();
        proxyRequests.removeAllListeners();
    });

    test("conditions request headers", function (done) {
        var proxy = Proxy.create();

        var rawHeaders = [
            "some-Header-0",    "some value 0",
            "Some-header-1",    "some value 1",
            "Proxy-Connection", "close"
        ];

        var req = testRequest({rawHeaders: rawHeaders});

        proxyRequests.on("request", function (preq) {
            var canonical = Headers.canonicalHeaders(rawHeaders);
            canonical = canonical.slice(0, 4);
            canonical = Headers.mapRaw(canonical);

            assert(Object.keys(preq.options.headers).every(function (header) {
                return header in canonical;
            }));

            done();
        });

        proxy.forward(req, testResponse());
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
        var testError = new Error("test error");

        proxyRequests.on("request", function (preq) {
            preq.emit("error", testError);
        });

        proxy.on("error", function (err) {
            assert(err.origin.indexOf(Proxy.errorOrigin) === 0);
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

        res.writeHead = function (statusCode) {
            assert(statusCode === 418);
            done();
        };

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
        var testError = new Error("test error");

        proxyRequests.on("request", function (preq) {
            var pres = testProxyResponse();

            preq.emit("response", pres);
            pres.emit("error", testError);
        });

        proxy.on("error", function (err) {
            assert(err === testError);
            assert(err.origin.indexOf(Proxy.errorOrigin) === 0);

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

        res.writeHead = function (_, headers) {
            var canonical = Headers.canonicalHeaders(rawHeaders);

            for (var i = 0; i < canonical.length; i += 2) {
                assert(headers[canonical[i]] === canonical[i + 1]);
            }

            done();
        };

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

        res.end = function () {
            done();
        };

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

        res.end = function () {
            done();
        };

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

        res.end = function () {
            done();
        };

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

        res.end = function () {
            done();
        };

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

        res.end = function () {
            done();
        };

        proxy.forward(req, res);
    });

    test("emits end event on proxy response end when no data", function (done) {
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

    test("copies response data", function (done) {
        var proxy   = Proxy.create();
        var req     = testRequest();
        var res     = testResponse();
        var data0   = "data 0";
        var data1   = "data 1";
        var allData = "";

        var pres = testProxyResponse({
            headers: {
                "Content-Length": data0.length + data1.length
            }
        });

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("data", function (ctx) {
            allData += ctx.buffer.toString();
        });

        res.end = function () {
            assert(allData === data0 + data1);
            done();
        };

        proxyRequests.on("request", function (preq) {
            pres.emit("data", data0);
            pres.emit("data", data1);

            pres.emit("end");
        });

        proxy.forward(req, res);
    });

    test("emits end event on proxy response end", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();
        var pres  = testProxyResponse();

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("end", function () {
            done();
        });

        proxyRequests.on("request", function (preq) {
            pres.emit("data", "data");
            pres.emit("end");
        });

        proxy.forward(req, res);
        pres.emit("end");
    });

    test("emits data event on response data", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();
        var data  = "data";

        var pres = testProxyResponse({
            headers: {
                "Content-Length": data.length
            }
        });

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("data", function (ctx) {
            assert(ctx.buffer === data);
            done();
        });

        proxyRequests.on("request", function (preq) {
            pres.emit("data", data);
        });

        proxy.forward(req, res);
    });

    test("emits head event on response head", function (done) {
        var proxy = Proxy.create();
        var req   = testRequest();
        var res   = testResponse();
        var data  = "data";

        var responseHead = {
            statusCode: 418,
            rawHeaders: [
                "Test-Header", "test-header-value"
            ]
        };

        var pres = testProxyResponse(responseHead);

        proxyRequests.on("request", function (preq) {
            preq.emit("response", pres);
        });

        res.on("data", function (ctx) {
            assert(ctx.buffer === data);
            done();
        });

        res.on("head", function (head) {
            console.error(head);
            assert(head.statusCode === responseHead.statusCode);
            assert(
                head.headers[responseHead.rawHeaders[0]] ===
                responseHead.rawHeaders[1]
            );
            done();
        });

        proxy.forward(req, res);
    });
});
