suite("listener", function () {
    "use strict";

    var assert     = require("assert");
    var Defaults   = require("./defaults");
    var FakeCert   = require("./fake-cert");
    var FsEnv      = require("./fs-env");
    var Listener   = require("./listener");
    var MockModule = require("./mock-module");
    var Path       = require("path");
    var Servers    = require("./servers");

    var mocks = MockModule.create();

    var mockServer = function (name) {
        var servers = [];

        mocks.mock(Servers, name, function (options) {
            var server = {
                options: options,
                address: options.address,

                listen: function (address, clb) {
                    this.listenAddress = address;
                    if (clb) {
                        clb();
                    }
                },

                close: function (clb) {
                    clb();
                }
            };

            if (servers) {
                servers.push(server);
            }

            return server;
        });

        return servers;
    };

    var mockInternalServer = function () {
        return mockServer("createInternalHttp");
    };

    var mockTunnelConnect = function () {
        return mockServer("createTunnelConnect");
    };

    var mockExternal = function () {
        return mockServer("createExternalServer");
    };

    var mockEnsureDir = function (f) {
        mocks.mock(FsEnv, "ensureDir", f);
    };

    teardown(function () {
        mocks.teardown();
    });

    test("uses fake cert when none provided", function (done) {
        var servers = mockInternalServer(servers);

        var listener = Listener.createServer();
        listener.on("error", function () {});

        listener.listen(9090, function () {
            assert(servers.some(function (server) {
                return (
                    server.options.useTls &&
                    server.options.tlsCert === FakeCert
                );
            }));

            listener.close(done);
        });
    });

    test("emits error when no tls certificate provided", function (done) {
        mockInternalServer();

        var called   = false;
        var listener = Listener.createServer();

        listener.on("error", function (err) {
            called = true;
            assert(err);
            assert(err.origin === Listener.fakeCertificateOrigin);
        });

        listener.listen(9090, function () {
            assert(called);
            listener.close(done);
        });
    });

    test("uses the provided certificate", function (done) {
        var tlsCert = {};
        var servers = mockInternalServer(servers);

        var listener = Listener.createServer({tlsCert: tlsCert});
        listener.on("error", function () {});

        listener.listen(9090, function () {
            assert(servers.some(function (server) {
                return (
                    server.options.useTls &&
                    server.options.tlsCert == tlsCert
                );
            }));

            listener.close(done);
        });
    });

    test("uses default socket dir when none provided", function (done) {
        var servers = mockInternalServer(servers);

        var listener = Listener.createServer();
        listener.on("error", function () {});

        listener.listen(9090, function () {
            assert(servers.every(function (server) {
                return (
                    Path.resolve(Path.dirname(server.listenAddress)) ===
                    Path.resolve(Defaults.socketDir)
                )
            }));

            listener.close(done);
        });
    });

    test("uses the provided socket dir", function (done) {
        var servers = mockInternalServer(servers);

        var socketDir = Path.join(Defaults.socketDir, "test-dir");
        var listener  = Listener.createServer({socketDir: socketDir});

        listener.on("error", function () {});

        listener.listen(9090, function () {
            assert(servers.every(function (server) {
                return (
                    Path.resolve(Path.dirname(server.listenAddress)) ===
                    Path.resolve(socketDir)
                )
            }));

            listener.close(done);
        });
    });

    test("listens on a single non-tls http server on file error", function (done) {
        var port    = 9999;
        var servers = mockInternalServer();

        mockEnsureDir(function () {
            throw "test error";
        });

        var listener = Listener.createServer();
        listener.on("error", function () {});

        listener.listen(port, function () {
            assert(servers.length === 1);
            assert(!servers[0].options.useTls);
            assert(servers[0].listenAddress === port);

            listener.close(done);
        });
    });

    test("emits error on file error", function (done) {
        var port      = 9999;
        var servers   = mockInternalServer();
        var testError = new Error("test error");

        mockEnsureDir(function () {
            throw testError;
        });

        var listener = Listener.createServer();

        listener.on("error", function (err) {
            assert(err === testError);
            assert(err.origin === Listener.httpFallbackOrigin);

            setTimeout(function () {
                listener.close(done);
            });
        });

        listener.listen(port);
    });

    test("listens on non-tls internal http", function (done) {
        var servers  = mockInternalServer();
        var listener = Listener.createServer();

        listener.on("error", function () {});

        listener.listen(9090, function () {
            assert(servers.some(function (server) {
                return (
                    Path.basename(server.listenAddress) === Listener.httpSocketName &&
                    !server.options.useTls
                );
            }));

            listener.close(done);
        });
    });

    test("listens on internal https", function (done) {
        var servers  = mockInternalServer();
        var listener = Listener.createServer();

        listener.on("error", function () {});

        listener.listen(9090, function () {
            assert(servers.some(function (server) {
                return (
                    Path.basename(server.listenAddress) === Listener.httpsSocketName &&
                    server.options.useTls
                );
            }));

            listener.close(done);
        });
    });

    test("listens on tunnel connect", function (done) {
        var servers  = mockTunnelConnect();
        var listener = Listener.createServer();

        listener.on("error", function () {});

        listener.listen(9090, function () {
            assert(servers.length === 1);
            assert(
                Path.basename(servers[0].listenAddress) === Listener.tunnelConnectSocketName &&
                Path.basename(servers[0].options.dataPath) === Listener.httpsSocketName
            );

            listener.close(done);
        });
    });

    test("listens on external tcp", function (done) {
        var port     = 9999;
        var servers  = mockExternal();
        var listener = Listener.createServer();

        listener.on("error", function () {});

        listener.listen(port, function () {
            assert(servers.length === 1);
            assert(servers[0].listenAddress === port);
            listener.close(done);
        });
    });

    test("closes fallback server", function (done) {
        var port    = 9999;
        var servers = mockInternalServer();

        mockEnsureDir(function () {
            throw "test error";
        });

        var listener = Listener.createServer();
        listener.on("error", function () {});

        listener.listen(port, function () {
            listener.close(done);
        });
    });

    test("closes internal servers", function (done) {
        mockInternalServer();

        var listener = Listener.createServer();
        listener.on("error", function () {});

        listener.listen(9090, function () {
            listener.close(done);
        });
    });

    test("closes tunnel connect", function (done) {
        mockTunnelConnect();

        var listener = Listener.createServer();
        listener.on("error", function () {});

        listener.listen(9090, function () {
            listener.close(done);
        });
    });

    test("closes external tcp server", function (done) {
        mockExternal();

        var listener = Listener.createServer();
        listener.on("error", function () {});

        listener.listen(9090, function () {
            listener.close(done);
        });
    });

    test("ignores missing callback on listen", function (done) {
        var listener = Listener.createServer();
        listener.on("error", function (err) {
            assert(err.origin.indexOf(Listener.fakeCertificateOrigin) === 0);
        });

        listener.listen(9090);
        listener.close(function () {
            done();
        });
    });

    test("ignores missing callback on fallback listen", function (done) {
        mockEnsureDir(function () {
            throw new Error("test error");
        });

        var listener = Listener.createServer();
        listener.on("error", function (err) {
            assert(err.origin.indexOf(Listener.httpFallbackOrigin) === 0);
        });

        listener.listen(9090);
        listener.close(function () {
            done();
        });
    });

    test("ignores missing callback on close", function (done) {
        var listener = Listener.createServer();
        listener.on("error", function (err) {
            assert(err.origin.indexOf(Listener.fakeCertificateOrigin) === 0);
        });

        listener.listen(9090);
        listener.close();
        setTimeout(done);
    });
});
