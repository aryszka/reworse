suite("reworse", function () {
    "use strict";

    var Listener = require("./listener");
    var Main     = require("./main");
    var mockArgs = require("./mock-args");
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
            reworse = Main.run(reworseOptions, clb);
        };

        var close = function (clb) {
            Wait.forAll([
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

        Wait.forAll([startHttp, startReworse], onStarted);
    };

    var reworseErrorHandler = function (err, origin, subOrigin) {
        if (origin !== "listener" || subOrigin !== Listener.fakeCertificateOrigin) {
            console.error.apply(console, [].slice.call(arguments));
        }
    };

    var testRoundtrip = function (options, clb) {
        var chunk0             = new Buffer("123");
        var chunk1             = new Buffer("456");
        var postDataChunks     = [chunk0, chunk1];
        var receivedData       = new Buffer("");
        var requestHeaders     = {"Test-Request-Header": "test request value"};
        var responseHeaders    = {"Test-Response-Header": "test response value"};
        var responseDataChunks = [chunk1, chunk0];

        var reworseOptions = {
            errorHandler: reworseErrorHandler,
            port:         TestHttp.reworsePort
        };

        var requestOptions = {
            headers:   requestHeaders,
            method:    options.post ? "POST" : "GET",
            path:      "/testpath",
            useTls:    options.useTls,
            tunneling: options.tunneling
        };

        var serverOptions = {
            dataChunks: responseDataChunks,
            headers:    responseHeaders,
            useTls:     options.useTls || options.tunneling
        };

        var assertRequest = function (req, res, data) {
            TestHttp.assertPath(req.url, requestOptions.path);
            TestHttp.assertHeaders(req, requestHeaders, ["Host"]);
            if (options.post) {
                TestHttp.assertData(postDataChunks, [data]);
            }
        };

        var assertResponse = function (res, data) {
            TestHttp.assertHeaders(res, responseHeaders);
            TestHttp.assertData(responseDataChunks, [data]);
        };

        var makeRequest = function (clb) {
            var request = TestHttp.request(requestOptions);
            request.on("responsecomplete", function (req, res, data) {
                assertResponse(req, res, data);
                clb();
            });

            TestHttp.send(request, options.post ? postDataChunks : []);
        };

        var onStarted = function (servers) {
            servers.http.on("requestcomplete", assertRequest);
            makeRequest(servers.close.bind(servers, clb));
        };

        startServerAndReworse(serverOptions, reworseOptions, onStarted);
    };

    var testKeepAliveSession = function (options, clb) {
        var receivedData    = new Buffer("");
        var requestHeaders  = {"Test-Request-Header": "test request value"};
        var responseHeaders = {"Test-Response-Header": "test response value"};

        var reworseOptions = {
            errorHandler: reworseErrorHandler,
            port:         TestHttp.reworsePort
        };

        var postDataChunks = [
            [new Buffer("123"), new Buffer("456")],
            [new Buffer("789"), new Buffer("012")],
            [new Buffer("345"), new Buffer("678")]
        ];

        var requestOptions = {
            headers:   requestHeaders,
            keepAlive: true,
            method:    "POST",
            path:      "/testpath",
            useTls:    options.useTls
        };

        var serverOptions = {
            headers: responseHeaders,
            useTls:  options.useTls
        };

        var assertRequest = function (req, res, data) {
            TestHttp.assertPath(req.url, requestOptions.path);
            TestHttp.assertHeaders(req, requestOptions.headers, ["Host"]);
        };

        var makeRequest = function (dataChunks) {
            return function (clb) {
                var request = TestHttp.request(requestOptions);

                request.on("responsecomplete", function (res, data) {
                    TestHttp.assertHeaders(res, responseHeaders);
                    TestHttp.assertData(dataChunks, [data]);

                    clb();
                });

                TestHttp.send(request, dataChunks);
            };
        };

        var makeRequests = function (clb) {
            Wait.forAll(postDataChunks.map(makeRequest), clb);
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
        testRoundtrip({post: false, useTls: false}, done);
    });

    test("non-tls post roundtrip", function (done) {
        testRoundtrip({post: true, useTls: false }, done);
    });

    test("get roundtrip", function (done) {
        testRoundtrip({post: false, useTls: true}, done);
    });

    test("post roundtrip", function (done) {
        testRoundtrip({post: true, useTls: true}, done);
    });

    test("non-tls keep-alive session", function (done) {
        testKeepAliveSession({useTls: false}, done);
    });

    test("keep-alive session", function (done) {
        testKeepAliveSession({useTls: true}, done);
    });

    test("get roundtrip over tunnel", function (done) {
        testRoundtrip({post: false, tunneling: true}, done);
    });

    test("post roundtrip over tunnel", function (done) {
        testRoundtrip({post: true, tunneling: true}, done);
    });
});
