suite("main", function () {
    "use strict";

    var assert   = require("assert");
    var Events   = require("events");
    var Flags    = require("flags");
    var Fs       = require("fs");
    var Listener = require("./listener");
    var Main     = require("./main");
    var mockArgs = require("./mock-args");
    var Path     = require("path");
    var Proxy    = require("./proxy");

    var createListener;
    var createProxy;
    var exit;
    var getFlag;
    var readFile;
    var startupArgs;
    var stderr;

    var noop = function () {};

    var mockListener = function (onCreate) {
        Listener.createServer = function (options) {
            var listener = new Events.EventEmitter;

            listener.options = options;
            listener.listen  = noop;

            if (onCreate) {
                onCreate(listener);
            }

            return listener;
        };
    };

    var mockProxy = function (onCreate) {
        Proxy.create = function (options) {
            var proxy = new Events.EventEmitter;

            proxy.options = options;
            proxy.forward  = noop;

            if (onCreate) {
                onCreate(proxy);
            }

            return proxy;
        };
    };

    var mockExit = function (f) {
        process.exit = f;
    };

    var mockStderr = function (f) {
        console.error = f;
    };

    var mockFlags = function (f) {
        Flags.get = f;
    };

    var mockReadFile = function (f) {
        Fs.readFileSync = f;
    };

    setup(function () {
        createListener = Listener.createServer;
        createProxy    = Proxy.create;
        exit           = process.exit;
        getFlag        = Flags.get;
        readFile       = Fs.readFileSync;
        startupArgs    = process.argv;
        stderr         = console.error;

        mockArgs();
        mockListener();
        mockProxy();
    });

    teardown(function () {
        console.error         = stderr;
        Flags.get             = getFlag;
        Fs.readFileSync       = readFile;
        Listener.createServer = createListener;
        process.argv          = startupArgs;
        process.exit          = exit;
        Proxy.create          = createProxy;
    });

    test("uses command line flags if no options provided", function () {
        var testSocketDir  = "test-socket-dir";
        var createListener = Listener.createServer;

        mockFlags(function (name) {
            if (name === "socket-dir") {
                return testSocketDir;
            }
        });

        mockListener(function (listener) {
            assert(listener.options.socketDir === testSocketDir);
        });

        Main.run();
    });

    test("reports failure on tls certificate load error", function () {
        var reported = false;

        mockExit(noop);

        mockFlags(function (name) {
            if (name === "tls-cert") {
                return "test-path";
            }
        });

        mockReadFile(function () {
            throw "test error";
        });

        mockStderr(function (msg) {
            reported = true;
            assert(msg.indexOf("certificate") >= 0);
        });

        Main.run();
        assert(reported);
    });

    test("loads specified filters", function () {
        var filters = {
            "filter0": false,
            "filter1": false,
            "filter2": false
        };

        var paths = Object.keys(filters);

        Main.run({
            filters: {
                require: function (path) {
                    filters[Path.basename(path)] = true;
                },

                paths: paths
            }
        });

        assert(paths.every(function (path) {
            return filters[path];
        }));
    });

    test("reports failure on filter load error", function () {
        var reported = false;

        mockExit(noop);

        mockStderr(function (msg) {
            reported = true;
            assert(msg.indexOf("invalid filter") >= 0);
        });

        Main.run({
            filters: {
                require: function () {
                    throw "test error";
                },

                paths: ["filter-path"]
            }
        });

        assert(reported);
    });

    test("handles errors on listener", function (done) {
        var testError = new Error("test error");

        mockListener(function (listener) {
            setTimeout(function () {
                listener.emit("error", testError);
            });
        });

        mockStderr(function (msg, origin) {
            assert(msg === testError);
            assert(origin === "listener");

            done();
        });

        Main.run();
    });

    test("handles errors on proxy", function (done) {
        var testError = new Error("test error");

        mockProxy(function (proxy) {
            setTimeout(function () {
                proxy.emit("error", testError);
            });
        });

        mockStderr(function (msg, origin) {
            assert(msg === testError);
            assert(origin === "proxy");

            done();
        });

        Main.run();
    });

    test("calls proxy on request", function (done) {
        var request     = {};
        var response    = {};
        var proxyCalled = false;

        mockListener(function (listener) {
            setTimeout(function () {
                listener.emit("request", request, response);
                assert(proxyCalled);
                done();
            });
        });

        mockProxy(function (proxy) {
            proxy.forward = function (req, res) {
                assert(req === request);
                assert(res === response);

                proxyCalled = true;
            };
        });

        Main.run();
    });

    test("applies filters on listener request before proxying", function (done) {
        var request     = {};
        var response    = {};
        var filters     = {};
        var proxyCalled = false;

        var mkfilter = function (name) {
            filters[name] = function (req, res) {
                assert(req === request);
                assert(res === response);
                filters[name].called = true;
            };
        };

        mkfilter("filter0");
        mkfilter("filter1");
        mkfilter("filter2");

        mockListener(function (listener) {
            setTimeout(function () {
                listener.emit("request", request, response);
                assert(proxyCalled);
                done();
            });
        });

        mockProxy(function (proxy) {
            proxy.forward = function (req, res) {
                assert(req === request);
                assert(res === response);

                assert(Object.keys(filters).every(function (name) {
                    return filters[name].called;
                }));

                proxyCalled = true;
            };
        });

        Main.run({
            filters: {
                require: function (name) {
                    return filters[Path.basename(name)];
                },

                paths: Object.keys(filters)
            }
        });
    });

    test("does not make proxy request if any of the filters handled the request", function (done) {
        var filters = {};

        var mkfilter = function (name, handle) {
            filters[name] = function () {
                return handle;
            };
        };

        mkfilter("filter0");
        mkfilter("filter1", true);
        mkfilter("filter2");

        mockListener(function (listener) {
            setTimeout(function () {
                listener.emit("request");
                done();
            });
        });

        mockProxy(function (proxy) {
            proxy.forward = function () {
                assert(false);
            };
        });

        Main.run({
            filters: {
                require: function (name) {
                    return filters[Path.basename(name)];
                },

                paths: Object.keys(filters)
            }
        });
    });
});
