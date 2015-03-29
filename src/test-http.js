(function () {
    "use strict";

    var Util   = require("util");
    var Http   = require("http");
    var Https  = require("https");
    var Tls    = require("tls");
    var assert = require("assert");
    var main   = require("./main");
    var Cert   = require("./fake-cert");

    var ProxyAgent = function (options) {
        Https.Agent.call(this, options);
        this.options = options || {};
    };

    Util.inherits(ProxyAgent, Https.Agent);

    ProxyAgent.prototype.createConnection = function (options, clb) {
        var requestHost = options.host + ":" + options.port;

        var req = Http.request({
            host:    this.options.host,
            port:    this.options.port,
            method:  "connect",
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

    Tunneling.Server  = Tunneling;
    Tunneling.Agent   = ProxyAgent;
    Tunneling.request = Https.request;

    var assertHeaders = function (expect, test) {
        expect = main.rawHeaders(expect);
        test   = main.rawHeaders(test);

        for (var key in expect) {
            assert(expect[key] === test[key]);
        }
    };

    var getResponseBody = function (options, requestIndex) {
        return (
            (options.bodies && (options.bodies.length > requestIndex)) ?
            options.bodies[requestIndex] :
            (options.body || [])
        );
    };

    var applyDefaults = function (values, defaults) {
        values = values || {};
        for (var key in defaults) {
            if (!(key in values)) {
                values[key] = defaults[key];
            }
        }

        return values;
    };

    var isHttps = function (Implementation) {
        return (
            Implementation.prototype instanceof Https.Server ||
            Implementation === Https.Server
        );
    };

    var createTestService = function (options) {
        options = applyDefaults(options, {
            Implementation: Http.Server,
            response: applyDefaults(options.response, {
                statusCode:  200,
                contentType: "text/plain",
                body:        [],
                bodies:      []
            })
        });

        var service;
        var requestCounter = 0;

        if (isHttps(options.Implementation)) {
            service = new options.Implementation(Cert);
        } else {
            service = new options.Implementation;
        }

        service.on("request", function (req, res) {
            var body = getResponseBody(options.response, requestCounter++);

            res.writeHeader(options.response.statusCode, {
                "Content-Type":   options.response.contentType,
                "Content-Length": body && String(body.join("").length) || "0"
            });

            if (body) {
                body.map(function (part) {
                    setTimeout(function () {
                        res.write(part);
                    });
                });
            }

            setTimeout(function () {
                res.end();
            });

            var requestBody = "";

            req.on("data", function (data) {
                requestBody += data.toString();
            });

            req.on("end", function () {
                this.emit("test-request-end", requestBody);
            }.bind(this));
        });

        return service;
    };

    var testRequest = function (options) {
        options = applyDefaults(options, {
            Implementation: Http.Server,
            hostname:       "localhost",
            port:           8989,
            method:         "GET",
            path:           "/",
            agent:          undefined,
            headers:        []
        });
        options.headers = main.rawHeaders(options.headers);

        var req = options.Implementation.request(options);
        req.on("response", function (res) {
            var body = "";

            res.on("data", function (data) {
                body += data.toString();
            });

            res.on("end", function () {
                req.emit("test-request-done", body);
            });
        });

        return req;
    };

    var testDone = function (proxy, service, done) {
        service.close(function () {
            proxy.close(function () {
                done();
            });
        });
    };

    var testRoundtrip = function (options) {
        options = applyDefaults(options, {
            Implementation: Http,
            servicePort:    8989,
            method:         "GET",
            body:           [],
            bodies:         [],
            requestBody:    [],
            done:           function () {},
            agent:          undefined,
            requestCount:   1
        });

        options = applyDefaults(options, {
            requestPort: options.servicePort,

            headers: [
                "User-Agent", "reworse test",
                "Host",       "localhost:" + options.servicePort,
                "Accept",     "*/*"
            ]
        });

        main.run(function (proxy) {
            var service = createTestService({
                Implementation: options.Implementation.Server,

                response: {
                    body:   options.body,
                    bodies: options.bodies
                }
            });

            var requestCounter = 0;

            var requestDone = function () {
                requestCounter--;
                if (requestCounter === 0) {
                    testDone(proxy, service, options.done);
                }
            };

            var request = function (index) {
                var req = testRequest({
                    Implementation: options.Implementation,
                    port:           options.requestPort,
                    headers:        options.headers,
                    agent:          options.agent,
                    method:         options.method
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

                options.requestBody.map(function (part) {
                    req.write(part);
                });

                req.end();
            };

            var requestBodyLength = options.requestBody.join("").length;

            if (requestBodyLength) {
                options.headers.push("Content-Type");
                options.headers.push("text/plain");
                options.headers.push("Content-Length");
                options.headers.push(String(requestBodyLength));
            }

            service.on("request", function (req) {
                assert(req.method === options.method);
                assert(req.url === "/");
                assertHeaders(options.headers, req.rawHeaders);
            });

            service.on("test-request-end", function (requestBody) {
                assert(requestBody === options.requestBody.join(""));
            });

            service.listen(options.servicePort, function () {
                var requestCount = options.requestCount;
                for (var i = 0; i < requestCount; i++) {
                    request(i);
                }
            });
        });
    };

    var testGetRoundtrip = function (Implementation, servicePort, done) {
        testRoundtrip({
            Implementation: Implementation,
            servicePort:    servicePort,
            requestPort:    main.defaultPort,
            done:           done,

            body: [
                "response part 0",
                "response part 1"
            ]
        });
    };

    var testPostRoundtrip = function (Implementation, servicePort, done) {
        testRoundtrip({
            Implementation: Implementation,
            servicePort:    servicePort,
            requestPort:    main.defaultPort,
            done:           done,
            method:         "POST",

            requestBody: [
                "request part 0",
                "request part 1"
            ],

            body: [
                "response part 0",
                "response part 1"
            ]
        });
    };

    var testKeepAliveSession = function (Implementation, servicePort, done) {
        // note:
        // the current version strips off keep-alive
        // headers, but it still should be able to
        // serve such requests.

        testRoundtrip({
            Implementation: Implementation,
            servicePort:    servicePort,
            requestPort:    main.defaultPort,
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

    var testGetTunneling = function (servicePort, done) {
        testRoundtrip({
            Implementation: Tunneling,
            servicePort:    servicePort,
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

    var testPostTunneling = function (servicePort, done) {
        testRoundtrip({
            Implementation: Tunneling,
            servicePort:    servicePort,
            done:           done,
            method:         "POST",

            agent: new Tunneling.Agent({
                host: "localhost",
                port: main.defaultPort
            }),

            requestBody: [
                "request part 0",
                "request part 1"
            ],

            body: [
                "response part 0",
                "response part 1"
            ]
        });
    };

    exports.testGetRoundtrip     = testGetRoundtrip;
    exports.testPostRoundtrip    = testPostRoundtrip;
    exports.testKeepAliveSession = testKeepAliveSession;
    exports.testGetTunneling     = testGetTunneling;
    exports.testPostTunneling    = testPostTunneling;
})();
