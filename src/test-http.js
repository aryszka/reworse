(function () {
    "use strict";

    var Util = require("util");
    var Http = require("http");
    var Https = require("https");
    var Tls = require("tls");
    var main = require("./main");
    var assert = require("assert");
    var Cert = require("./fake-cert");

    var ProxyAgent = function (options) {
        Https.Agent.call(this, options);
        this.options = options || {};
    };

    Util.inherits(ProxyAgent, Https.Agent);

    ProxyAgent.prototype.createConnection = function (requestOptions, clb) {
        var requestHost = requestOptions.host + ":" + requestOptions.port;

        var req = Http.request({
            host:    this.options.host,
            port:    this.options.port,
            method:  "connect",
            path:    requestHost,
            headers: {host: requestHost}
        });

        var tls;

        req.on("connect", function (req, socket, head) {
            tls = Tls.connect({socket: socket}, function () {
                clb(null, tls);
            });
        });

        req.on("error", function (err) {
            clb(err);
        });

        req.end();
    };

    ProxyAgent.prototype.addRequest = function (req, options) {
        this.createSocket(req, options, function (socket) {
            req.onSocket(socket);
        });
    };

    ProxyAgent.prototype.createSocket = function (req, options, clb) {
        this.createConnection({
            host: options.host,
            port: options.port
        }, function (err, socket) {
            if (err) {
                req.emit("error", err);
                return;
            }

            socket.on("free", function () {
                this.emit("free", socket);
            }.bind(this))

            clb(socket);
        }.bind(this));
    };

    var Tunneling = function (options) {
        Https.Server.call(this, options);
    };

    Util.inherits(Tunneling, Https.Server);

    Tunneling.Agent   = ProxyAgent;
    Tunneling.request = Https.request;

    Tunneling.createServer = function (options) {
        return new Tunneling(options);
    };

    var assertHeaders = function (expect, test) {
        var expectObject = main.rawHeaders(expect);
        var testObject   = main.rawHeaders(test);

        for (var key in expectObject) {
            assert(expectObject[key] === testObject[key]);
        }
    };

    var getResponseBody = function (options, requestIndex) {
        return (
            (options.bodies && (options.bodies.length > requestIndex)) ?
            options.bodies[requestIndex] :
            (options.body || [])
        );
    };

    var createTestServer = function (options) {
        var server;
        var requestCounter = 0;

        if (options.Implementation.prototype instanceof Https.Server ||
            options.Implementation === Https.Server) {
            server = new options.Implementation(Cert);
        } else {
            server = new options.Implementation;
        }

        server.on("request", function (req, res) {
            var body = getResponseBody(options.response, requestCounter++);

            res.writeHeader(options.response.statusCode || 200, {
                "Content-Type":   options.response.contentType || "text/plain",
                "Content-Length": body && String(body.join("").length) || "0"
            });

            if (body) {
                body.forEach(function (part) {
                    setTimeout(function () {
                        res.write(part);
                    });
                });
            }

            setTimeout(function () {
                res.end();
            });
        });

        return server;
    };

    var testRequest = function (options) {
        var req = options.Implementation.request({
            method:   options.method || "GET",
            hostname: "localhost",
            port:     options.port || main.defaultPort,
            path:     "/",
            headers:  main.rawHeaders(options.headers || []),
            agent:    options.agent
        });

        req.on("response", function (res) {
            var body = "";

            res.on("data", function (data) {
                body += data.toString();
            });

            res.on("end", function () {
                req.emit("test-request-done", body);
            });
        });

        req.end();
        return req;
    };

    var testDone = function (server, testServer, done) {
        testServer.close(function () {
            server.close(function () {
                done();
            });
        });
    };

    var testRoundtrip = function (options) {
        main(function (server) {
            var headers = [
                "User-Agent", "reworse test",
                "Host",       "localhost:" + options.port,
                "Accept",     "*/*"
            ];

            var testServer = createTestServer({
                Implementation: options.Implementation.Server || options.Implementation,

                response: {
                    body:   options.body,
                    bodies: options.bodies
                }
            });

            var requestCounter = 0;

            var requestDone = function () {
                requestCounter--;
                if (requestCounter === 0) {
                    testDone(server, testServer, options.done);
                }
            };

            var request = function (index) {
                var req = testRequest({
                    Implementation: options.Implementation,
                    port:           options.port,
                    headers:        headers,
                    agent:          options.agent
                });

                var expectedBody = getResponseBody(options, index);

                requestCounter++;

                req.on("response", function (res) {
                    assert(res.statusCode === 200);
                    assertHeaders([
                        "Content-Length", String(expectedBody.join("").length),
                        "Content-Type",   "text/plain"
                    ], res.rawHeaders);
                });

                req.on("test-request-done", function (body) {
                    assert(body === expectedBody.join(""));
                    requestDone();
                });
            };

            testServer.on("request", function (req) {
                assert(req.method === "GET");
                assert(req.url === "/");
                assertHeaders(headers, req.rawHeaders);
            });

            testServer.listen(options.port, function () {
                var requestCount = options.requestCount || 1;
                for (var i = 0; i < requestCount; i++) {
                    request(i);
                }
            });
        });
    };

    var testGetRoundtrip = function (Implementation, port, done) {
        testRoundtrip({
            Implementation: Implementation,
            port:           port,
            done:           done
        });
    };

    var testKeepAliveSession = function (Implementation, port, done) {
        // note:
        // the current version strips off keep-alive
        // headers, but it still should be able to
        // serve such requests.

        testRoundtrip({
            Implementation: Implementation,
            port:           port,
            done:           done,
            requestCount:   3,

            agent: new Implementation.Agent({
                keepAlive:      true,
                maxSockets:     1,
                maxFreeSockets: 1
            }),

            bodies: [[
                "test response 0 part 0",
                "test response 0 part 1",
            ], [
                "test response 11 part 01",
                "test response 11 part 11",
            ], [
                "test response 222 part 022",
                "test response 222 part 122"
            ]]
        });
    };

    var testTunneling = function (port, done) {
        testRoundtrip({
            Implementation: Tunneling,
            port:           port,
            done:           done,

            agent: new Tunneling.Agent({
                host: "localhost",
                port: main.defaultPort
            }),

            body: [
                "response part 0",
                "response part 1"
            ]
        });
    };

    module.exports.testGetRoundtrip     = testGetRoundtrip;
    module.exports.testKeepAliveSession = testKeepAliveSession;
    module.exports.testTunneling        = testTunneling;
})();
