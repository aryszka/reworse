suite("listener", function () {
    "use strict";

    var assert   = require("assert");
    var FakeCert = require("./fake-cert");
    var FsEnv    = require("./fs-env");
    var Listener = require("./listener");
    var Path     = require("path");
    var Servers  = require("./servers");

    test("uses fake cert when none provided", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var httpsCalled        = false;

        var server = {
            listen: function (_, clb) {
                clb();
            },

            close: function (clb) {
                clb();
            }
        };

        Servers.createInternalHttp = function (options) {
            if (!options.useTls) {
                return server;
            }

            httpsCalled = true;
            assert(options.tlsCert === FakeCert);
            return server;
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            assert(httpsCalled);
            listener.close(done);
        });
    });

    test("emits error when no tls certificate provided", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var called             = false;

        Servers.createInternalHttp = function (options) {
            return {
                listen: function (_, clb) {
                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        var listener = Listener.createServer();

        listener.on("error", function (err, origin) {
            called = true;
            assert(err);
            assert(origin === Listener.fakeCertificateOrigin);
        });

        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            assert(called);
            listener.close(done);
        });
    });

    test("uses the provided certificate", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var httpsCalled        = false;
        var tlsCert            = {};

        var server = {
            listen: function (_, clb) {
                clb();
            },

            close: function (clb) {
                clb();
            }
        };

        Servers.createInternalHttp = function (options) {
            if (!options.useTls) {
                return server;
            }

            httpsCalled = true;
            assert(options.tlsCert === tlsCert);
            return server;
        };

        var listener = Listener.createServer({tlsCert: tlsCert});
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            assert(httpsCalled);
            listener.close(done);
        });
    });

    test("uses default socket dir when none provided", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var called             = false;

        Servers.createInternalHttp = function (options) {
            return {
                address: options.address,

                listen: function (address, clb) {
                    called = true;
                    assert(
                        Path.resolve(Path.dirname(address)) ===
                        Path.resolve(Listener.defaultSocketDir)
                    );
                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            assert(called);
            listener.close(done);
        });
    });

    test("uses the provided socket dir", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var called             = false;
        var socketDir          = Path.join(Listener.defaultSocketDir, "test-dir");

        Servers.createInternalHttp = function (options) {
            return {
                address: options.address,

                listen: function (address, clb) {
                    called = true;
                    assert(
                        Path.resolve(Path.dirname(address)) ===
                        Path.resolve(socketDir)
                    );
                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        var listener = Listener.createServer({socketDir: socketDir});
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            assert(called);
            listener.close(done);
        });
    });

    test("listens on a single non-tls http server on file error", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var ensureDir          = FsEnv.ensureDir;
        var called             = 0;
        var port               = 9999;

        Servers.createInternalHttp = function (options) {
            assert(!options.useTls);

            return {
                address: options.address,

                listen: function (address, clb) {
                    called++;
                    assert(address === port);
                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        FsEnv.ensureDir = function () {
            throw "test error";
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(port, function () {
            Servers.createInternalHttp = createInternalHttp;
            FsEnv.ensureDir            = ensureDir;

            assert(called === 1);
            listener.close(done);
        });
    });

    test("emits error on file error", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var ensureDir          = FsEnv.ensureDir;
        var called             = false;
        var testError          = "test error";

        Servers.createInternalHttp = function (options) {
            return {
                address: options.address,

                listen: function (_, clb) {
                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        FsEnv.ensureDir = function () {
            throw testError;
        };

        var listener = Listener.createServer();

        listener.on("error", function (err, origin) {
            called = true;
            assert(err === testError);
            assert(origin === Listener.httpFallbackOrigin);
        });

        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            FsEnv.ensureDir            = ensureDir;

            assert(called);
            listener.close(done);
        });
    });

    test("listens on non-tls internal http", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var called             = false;

        Servers.createInternalHttp = function (options) {
            return {
                address: options.address,
                useTls:  options.useTls,

                listen: function (address, clb) {
                    if (Path.basename(address) === Listener.httpSocketName) {
                        called = true;
                        assert(!this.useTls);
                    }

                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            assert(called);
            listener.close(done);
        });
    });

    test("listens internal https", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var called             = false;

        Servers.createInternalHttp = function (options) {
            return {
                address: options.address,
                useTls:  options.useTls,

                listen: function (address, clb) {
                    if (Path.basename(address) === Listener.httpsSocketName) {
                        called = true;
                        assert(this.useTls);
                    }

                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            assert(called);
            listener.close(done);
        });
    });

    test("listens on tunnel connect", function (done) {
        var createTunnelConnect = Servers.createTunnelConnect;
        var called              = false;

        Servers.createTunnelConnect = function (options) {
            assert(Path.basename(options.dataPath) === Listener.httpsSocketName);

            return {
                address: options.address,

                listen: function (address, clb) {
                    called = true;
                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createTunnelConnect = createTunnelConnect;
            assert(called);
            listener.close(done);
        });
    });

    test("listens on external tcp", function (done) {
        var createExternalServer = Servers.createExternalServer;
        var called               = false;
        var port                 = 9999;

        Servers.createExternalServer = function (options) {
            assert(options.address === port);

            return {
                address: options.address,

                listen: function (address, clb) {
                    called = true;
                    clb();
                },

                close: function (clb) {
                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(port, function () {
            Servers.createExternalServer = createExternalServer;
            assert(called);
            listener.close(done);
        });
    });

    test("closes fallback server", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var ensureDir          = FsEnv.ensureDir;
        var called             = false;

        Servers.createInternalHttp = function (options) {
            return {
                address: options.address,

                listen: function (address, clb) {
                    clb();
                },

                close: function (clb) {
                    called = true;
                    clb();
                }
            };
        };

        FsEnv.ensureDir = function () {
            throw "test error";
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            FsEnv.ensureDir            = ensureDir;

            listener.close(function () {
                assert(called);
                done();
            });
        });
    });

    test("closes internal non-tls http server", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var called             = false;

        Servers.createInternalHttp = function (options) {
            return {
                address: options.address,
                useTls:  options.useTls,

                listen: function (address, clb) {
                    clb();
                },

                close: function (clb) {
                    if (!this.useTls) {
                        called = true;
                    }

                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;

            listener.close(function () {
                assert(called);
                done();
            });
        });
    });

    test("closes internal https server", function (done) {
        var createInternalHttp = Servers.createInternalHttp;
        var called             = false;

        Servers.createInternalHttp = function (options) {
            return {
                address: options.address,
                useTls:  options.useTls,

                listen: function (address, clb) {
                    clb();
                },

                close: function (clb) {
                    if (this.useTls) {
                        called = true;
                    }

                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createInternalHttp = createInternalHttp;
            listener.close(function () {
                assert(called);
                done();
            });
        });
    });

    test("closes tunnel connect", function (done) {
        var createTunnelConnect = Servers.createTunnelConnect;
        var called              = false;

        Servers.createTunnelConnect = function (options) {
            return {
                address: options.address,

                listen: function (address, clb) {
                    clb();
                },

                close: function (clb) {
                    called = true;
                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createTunnelConnect = createTunnelConnect;
            listener.close(function () {
                assert(called);
                done();
            });
        });
    });

    test("closes external tcp server", function (done) {
        var createExternalServer = Servers.createExternalServer;
        var called               = false;

        Servers.createExternalServer = function (options) {
            return {
                address: options.address,

                listen: function (address, clb) {
                    clb();
                },

                close: function (clb) {
                    called = true;
                    clb();
                }
            };
        };

        var listener = Listener.createServer();
        listener.on("error", function () {});
        listener.listen(9090, function () {
            Servers.createExternalServer = createExternalServer;
            listener.close(function () {
                assert(called);
                done();
            });
        });
    });

    test("ignores missing callback on listen", function (done) {
        var listener = Listener.createServer();
        listener.on("error", function (err, origin) {
            assert(origin.indexOf(Listener.fakeCertificateOrigin) === 0);
        });

        listener.listen(9090);
        listener.close(function () {
            done();
        });
    });

    test("ignores missing callback on fallback listen", function (done) {
        var ensureDir = FsEnv.ensureDir;

        FsEnv.ensureDir = function () {
            throw "test error";
        };

        var listener = Listener.createServer();
        listener.on("error", function (err, origin) {
            assert(origin.indexOf(Listener.httpFallbackOrigin) === 0);
        });

        listener.listen(9090);
        listener.close(function () {
            FsEnv.ensureDir = ensureDir;
            done();
        });
    });

    test("ignores missing callback on close", function (done) {
        var listener = Listener.createServer();
        listener.on("error", function (err, origin) {
            assert(origin.indexOf(Listener.fakeCertificateOrigin) === 0);
        });

        listener.listen(9090);
        listener.close();
        setTimeout(done);
    });
});
