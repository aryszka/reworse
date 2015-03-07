suite("main spec", function () {
    "use strict";

    var assert     = require("assert");
    var main       = require("./main");
    var mockArgs   = require("./mock-args");
    var Http       = require("http");
    var Https      = require("https");
    var Cert       = require("./cert");
    var Tls        = require("tls");
    var ProxyAgent = require("./test-proxy-agent");

    var assertHeaders = function (expect, test) {
        var expectObject = main.rawHeaders(expect);
        var testObject = main.rawHeaders(test);
        for (var key in expectObject) {
            assert(expectObject[key] === testObject[key]);
        }
    };

    var testGet = function (overTls, done) {
        var serverPort     = overTls ? 4545 : 8989;
        var Implementation = overTls ? Https : Http;

        main(function (server) {
            var responsePart0 = "response part 0";
            var responsePart1 = "response part 1";

            server.on("httpfallback", function () {
                assert(false);
            });

            var testServer = Implementation.createServer(overTls ? Cert : undefined);
            testServer.on("request", function (req, res) {
                assert(req.method === "GET");
                assert(req.url === "/");
                assertHeaders([
                    "User-Agent", "reworse test",
                    "Host", "localhost:" + serverPort,
                    "Accept", "*/*"
                ], req.rawHeaders);

                res.writeHeader(200, {
                    "Content-Length": String(responsePart0.length + responsePart1.length),
                    "Content-Type": "text/plain"
                });

                var writtenParts = 0;
                var write = function (part) {
                    setTimeout(function () {
                        res.write(part);
                        writtenParts++;
                        if (writtenParts.length === 2) {
                            setTimeout(function () {
                                res.end();
                            });
                        }
                    });
                };
                write(responsePart0);
                write(responsePart1);
            });

            testServer.listen(serverPort, function () {
                var req = Implementation.request({
                    method: "GET",
                    hostname: "localhost",
                    port: main.defaultPort,
                    path: "/",
                    headers: {
                        "User-Agent": "reworse test",
                        "Host": "localhost:" + serverPort,
                        "Accept": "*/*"
                    }
                });
                req.on("response", function (res) {
                    assert(res.statusCode === 200);
                    assertHeaders([
                        "Content-Length", String(responsePart0.length + responsePart1.length),
                        "Content-Type", "text/plain"
                    ], res.rawHeaders);

                    var responseText = "";
                    res.on("data", function (data) {
                        responseText += data.toString();
                    });

                    res.on("end", function () {
                        assert(responseText === responsePart0 + responsePart1);

                        testServer.close(function () {
                            server.close(function () {
                                done();
                            });
                        });
                    });
                });

                req.end();
            });
        });
    };

    var testKeepAliveSession = function (overTls, done) {
        var serverPort     = overTls ? 4545 : 8989;
        var Implementation = overTls ? Https : Http;

        main(function (server) {
            var testResponse0Part0 = "test response 0 part 0";
            var testResponse0Part1 = "test response 0 part 1";
            var testResponse1Part0 = "test response 1 part 0";
            var testResponse1Part1 = "test response 1 part 1";
            var testResponse2Part0 = "test response 2 part 0";
            var testResponse2Part1 = "test response 2 part 1";

            var testServer = Implementation.createServer(overTls ? Cert : undefined);
            var reqCount = 0;
            testServer.on("request", function (req, res) {
                assert(req.method === "GET");
                assert(req.url === "/");
                assertHeaders([
                    "User-Agent", "reworse test",
                    "Host", "localhost:" + serverPort,
                    "Accept", "*/*"
                ], req.rawHeaders);

                var part0;
                var part1;
                switch (reqCount) {
                case 0:
                    part0 = testResponse0Part0;
                    part1 = testResponse0Part1;
                case 1:
                    part0 = testResponse1Part0;
                    part1 = testResponse1Part1;
                case 2:
                    part0 = testResponse2Part0;
                    part1 = testResponse2Part1;
                }
                res.writeHeader(200, {
                    "content-type": "text/plain",
                    "content-length": part0.length + part1.length
                });
                var writtenParts = 0;
                var write = function (part) {
                    setTimeout(function () {
                        res.write(part);
                        writtenParts++;
                        if (writtenParts === 2) {
                            res.end();
                        }
                    });
                };
                write(part0);
                write(part1);
            });

            var agent = new Implementation.Agent({
                keepAlive: true,
                maxSockets: 1,
                maxFreeSockets: 1
            });

            var closeAll = function () {
                testServer.close(function () {
                    server.close(function () {
                        done();
                    });
                });
            };

            var responseCount = 0;
            var req = function () {
                var req = Implementation.request({
                    method: "GET",
                    hostname: "localhost",
                    port: main.defaultPort,
                    path: "/",
                    headers: {
                        "User-Agent": "reworse test",
                        "Host": "localhost:" + serverPort,
                        "Accept": "*/*"
                    },
                    agent: agent
                });
                var responseText = "";
                req.on("response", function (res) {
                    assert(res.statusCode === 200);
                    assertHeaders([
                        "Content-Type", "text/plain"
                    ], res.rawHeaders);

                    res.on("data", function (data) {
                        responseText += data.toString();
                    });

                    res.on("end", function () {
                        responseCount++;
                        assert(
                            responseText === testResponse0Part0 + testResponse0Part1 ||
                            responseText === testResponse1Part0 + testResponse1Part1 ||
                            responseText === testResponse2Part0 + testResponse2Part1
                        );
                        if (responseCount === 3) {
                            closeAll();
                        }
                    });
                });
                req.end();
            };

            testServer.listen(serverPort, function () {
                req();
                req();
                req();
            });
        });
    };

    var cmdArgs = process.argv.slice(2);

    setup(function () {
        mockArgs();
    });

    teardown(function () {
        mockArgs(cmdArgs);
    });

    test("http get", function (done) {
        testGet(false, done);
    });

    test("http keep-alive session", function (done) {
        // note:
        // the current version strips off keep-alive
        // headers, but it still should be able to
        // serve such requests.

        testKeepAliveSession(false, done);
    });

    test("https get", function (done) {
        testGet(true, done);
    });

    test("https keep-alive session", function (done) {
        // note:
        // the current version strips off keep-alive
        // headers, but it still should be able to
        // serve such requests.

        testKeepAliveSession(true, done);
    });

    test("https get over tunneling", function (done) {
        main(function (server) {

            var serverPort    = 4545;
            var responsePart0 = "response part 0";
            var responsePart1 = "response part 1";

            var testServer = Https.createServer(Cert);
            testServer.on("request", function (req, res) {
                assert(req.method === "GET");
                assert(req.url === "/");
                assertHeaders([
                    "User-Agent", "reworse test",
                    "Host", "localhost:" + serverPort,
                    "Accept", "*/*"
                ], req.rawHeaders);

                res.writeHeader(200, {
                    "Content-Length": String(responsePart0.length + responsePart1.length),
                    "Content-Type": "text/plain"
                });

                var writtenParts = 0;
                var write = function (part) {
                    setTimeout(function () {
                        res.write(part);
                        writtenParts++;
                        if (writtenParts.length === 2) {
                            setTimeout(function () {
                                res.end();
                            });
                        }
                    });
                };
                write(responsePart0);
                write(responsePart1);
            });

            testServer.listen(serverPort, function () {
                // create an agent
                var agent = new ProxyAgent({
                    host: "localhost",
                    port: main.defaultPort
                });

                // make a request to the https server using the proxy
                var req = Https.request({
                    agent: agent,
                    host: "localhost",
                    port: serverPort,
                    method: "GET",
                    path: "/",
                    headers: {
                        "User-Agent": "reworse test",
                        "Host": "localhost:" + serverPort,
                        "Accept": "*/*"
                    }
                }, function (res) {
                    assert(res.statusCode === 200);
                    assertHeaders([
                        "Content-Length", String(responsePart0.length + responsePart1.length),
                        "Content-Type", "text/plain"
                    ], res.rawHeaders);

                    var responseText = "";
                    res.on("data", function (data) {
                        responseText += data.toString();
                    });

                    res.on("end", function () {
                        assert(responseText === responsePart0 + responsePart1);
                        testServer.close(function () {
                            server.close(function () {
                                done();
                            });
                        });
                    });
                });

                req.end();
            });
        });
    });
});
