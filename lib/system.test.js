suite("reworse specs", function () {
    "use strict";

    var assert     = require("assert");
    var Headers    = require("./headers");
    var Listener   = require("./listener");
    var MockModule = require("./mock-module");
    var Reworse    = require("./reworse");
    var TestHttp   = require("./test-http");
    var Wait       = require("./wait");

    var mocks = MockModule.create();

    var startServerAndReworse = function (serverOptions, reworseOptions, clb) {
        var http;
        var reworse;

        var startHttp = function (clb) {
            http = TestHttp.server(serverOptions, clb);
        };

        var startReworse = function (clb) {
            reworse = Reworse.run(reworseOptions, clb);
        };

        var close = function (clb) {
            Wait.parallel([
                http.close.bind(http),
                reworse.close.bind(reworse)
            ], clb);
        };

        var onStarted = function () {
            clb({
                http:    http,
                reworse: reworse,
                close:   close
            });
        };

        Wait.parallel([startHttp, startReworse], onStarted);
    };

    var testRoundtrip = function (options, clb) {
        var requestHeaders  = {"Test-Request-Header": "test request value"};
        var responseHeaders = {"Test-Response-Header": "test response value"};

        var reworseOptions = {
            port: TestHttp.reworsePort,
            out:  function () {}
        };

        var postDataChunks = [
            [new Buffer("123"), new Buffer("456")],
            [new Buffer("789"), new Buffer("012")],
            [new Buffer("345"), new Buffer("678")]
        ];

        var requestOptions = {
            headers:   requestHeaders,
            keepAlive: options.keepAlive,
            method:    options.post ? "POST" : "GET",
            path:      "/testpath",
            useTls:    options.useTls,
            tunneling: options.tunneling
        };

        var serverOptions = {
            headers:    responseHeaders,
            useTls:     options.useTls || options.tunneling,
            dataChunks: options.post ? [] : postDataChunks[0]
        };

        var assertRequest = function (req, res, data) {
            TestHttp.assertPath(req.url, requestOptions.path);
            TestHttp.assertHeaders(req, requestOptions.headers, ["Host"]);

            if (options.post) {
                assert(req.headers["content-length"] === String(data.length));
            }
        };

        var assertResponse = function (dataChunks, res, data) {
            TestHttp.assertHeaders(res, responseHeaders);
            TestHttp.assertData(dataChunks, [data]);
        };

        var makeRequest = function (dataChunks) {
            dataChunks = options.post ? dataChunks : [];
            var responseDataChunks = options.post ? dataChunks : serverOptions.dataChunks;

            return function (clb) {
                requestOptions.headers = TestHttp.contentHeaders(
                    dataChunks,
                    requestOptions.headers
                );

                var request = TestHttp.request(requestOptions);

                request.on("responsecomplete", function (res, data) {
                    assertResponse(responseDataChunks, res, data);
                    clb();
                });

                TestHttp.send(request, dataChunks);
            };
        };

        var makeRequests = function (clb) {
            Wait.parallel(
                postDataChunks
                    .slice(0, options.requestCount || 1)
                    .map(makeRequest),
                clb
            );
        };

        var onStarted = function (servers) {
            servers.http.on("requestcomplete", assertRequest);
            makeRequests(servers.close.bind(servers, clb));
        };

        startServerAndReworse(serverOptions, reworseOptions, onStarted);
    };

    setup(function () {
        mocks.mock(process, "argv", process.argv.slice(0, 2));
    });

    teardown(function () {
        mocks.teardown();
    });

    test("non-tls get roundtrip", function (done) {
        testRoundtrip({
            keepAlive:    false,
            post:         false,
            requestCount: 1,
            tunneling:    false,
            useTls:       false
        }, done);
    });

    test("non-tls post roundtrip", function (done) {
        testRoundtrip({
            keepAlive:    false,
            post:         true,
            requestCount: 1,
            tunneling:    false,
            useTls:       false
        }, done);
    });

    test("get roundtrip", function (done) {
        testRoundtrip({
            keepAlive:    false,
            post:         false,
            requestCount: 1,
            tunneling:    false,
            useTls:       true
        }, done);
    });

    test("post roundtrip", function (done) {
        testRoundtrip({
            keepAlive:    false,
            post:         true,
            requestCount: 1,
            tunneling:    false,
            useTls:       true
        }, done);
    });

    test("non-tls keep-alive session", function (done) {
        testRoundtrip({
            keepAlive:    true,
            post:         true,
            requestCount: 3,
            tunneling:    false,
            useTls:       false
        }, done);
    });

    test("keep-alive session", function (done) {
        testRoundtrip({
            keepAlive:    true,
            post:         true,
            requestCount: 3,
            tunneling:    false,
            useTls:       true
        }, done);
    });

    test("get roundtrip over tunnel", function (done) {
        testRoundtrip({
            keepAlive:    false,
            post:         false,
            requestCount: 1,
            tunneling:    true,
            useTls:       true
        }, done);
    });

    test("post roundtrip over tunnel", function (done) {
        testRoundtrip({
            keepAlive:    false,
            post:         true,
            requestCount: 1,
            tunneling:    true,
            useTls:       true
        }, done);
    });

    test("keep-alive session over tunnel", function (done) {
        testRoundtrip({
            keepAlive:    true,
            post:         true,
            requestCount: 3,
            tunneling:    true,
            useTls:       true
        }, done);
    });

    test("applies filters", function (done) {
        var requestOptions = {
            useTls:    true,
            tunneling: true,

            headers: {
                "Test-Request-Header": "test-request-header-value"
            }
        };

        var serverOptions = {
            useTls:  true,
            headers: {"Test-Response-Header": "test-response-header-value"}
        };

        var filterRequestHeaders = [
            "Test-Request-Header-Filter", "test-request-header-filter-value"
        ];

        var filterResponseHeaders = [
            "Test-Response-Header-Filter", "test-response-header-fitler-value"
        ];

        var filter = function (req, res) {
            TestHttp.assertHeaders(req, requestOptions.headers);

            req.headers = Headers.mapRaw(
                Headers.merge(
                    Headers.canonical(Headers.toRaw(req.headers)),
                    filterRequestHeaders
                )
            );

            res.on("head", function (head) {
                assert(head.statusCode === 200);
                TestHttp.assertHeaders(head, serverOptions.headers, [
                    "Content-Length",
                    "Content-Type",
                    "Date",
                    "Connection"
                ]);

                head.statusCode = 418;
                head.headers[filterResponseHeaders[0].toLowerCase()] = filterResponseHeaders[1];
            });
        };

        var reworseOptions = {
            port: TestHttp.reworsePort,
            out:  function () {},

            filters: {
                preloaded: [filter]
            }
        };

        var assertRequest = function (req) {
            var testHeaders = Headers.mapRaw(
                Headers.merge(
                    Headers.toRaw(requestOptions.headers),
                    filterRequestHeaders
                )
            );
            TestHttp.assertHeaders(req, testHeaders);
        };

        var assertResponse = function (res) {
            assert(res.statusCode === 418);
            var testHeaders = Headers.mapRaw(
                Headers.merge(
                    Headers.toRaw(serverOptions.headers),
                    filterResponseHeaders
                )
            );
            TestHttp.assertHeaders(res, testHeaders);
        };

        var makeRequest = function (clb) {
            var request = TestHttp.request(requestOptions);

            request.on("responsecomplete", function (res) {
                assertResponse(res);
                clb();
            });

            TestHttp.send(request);
        };

        var onStarted = function (servers) {
            servers.http.on("requestcomplete", assertRequest);
            makeRequest(function () {
                servers.close(done);
            });
        };

        startServerAndReworse(serverOptions, reworseOptions, onStarted);
    });

    test("filter handles request", function (done) {
        // check server doesn't receive request
        // check filter response received
        var requestOptions = {
            useTls:    true,
            tunneling: true,

            headers: {
                "Test-Request-Header": "test-request-header-value"
            }
        };

        var serverOptions = {useTls:  true};

        var filterResponseHeaders = [
            "Test-Response-Header-Filter", "test-response-header-fitler-value"
        ];

        var filter = function (req, res) {
            TestHttp.assertHeaders(req, requestOptions.headers);

            res.writeHead(418, Headers.mapRaw(filterResponseHeaders));
            res.end();

            return true;
        };

        var reworseOptions = {
            port: TestHttp.reworsePort,
            out:  function () {},

            filters: {
                preloaded: [filter]
            }
        };

        var failOnRequest = function () {
            assert(false);
        };

        var assertResponse = function (res) {
            assert(res.statusCode === 418);
            TestHttp.assertHeaders(res, Headers.mapRaw(filterResponseHeaders));
        };

        var makeRequest = function (clb) {
            var request = TestHttp.request(requestOptions);

            request.on("responsecomplete", function (res) {
                assertResponse(res);
                clb();
            });

            TestHttp.send(request);
        };

        var onStarted = function (servers) {
            servers.http.on("request", failOnRequest);
            makeRequest(function () {
                servers.close(done);
            });
        };

        startServerAndReworse(serverOptions, reworseOptions, onStarted);
    });
});
