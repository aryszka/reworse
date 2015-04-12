suite("reworse specs", function () {
    "use strict";

    var assert   = require("assert");
    var Listener = require("./listener");
    var mockArgs = require("./mock-args");
    var Reworse  = require("./reworse");
    var TestHttp = require("./test-http");
    var Wait     = require("./wait");

    var processArgs;

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

        var assertResponse = function (requestDataChunks, res, data) {
            TestHttp.assertHeaders(res, responseHeaders);
            TestHttp.assertData(requestDataChunks, [data]);
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
        processArgs = process.argv;
        mockArgs();
    });

    teardown(function () {
        process.argv = processArgs;
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
});
