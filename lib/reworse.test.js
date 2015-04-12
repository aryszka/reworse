suite("reworse", function () {
    "use strict";

    var assert              = require("assert");
    var Errors              = require("./errors");
    var Events              = require("events");
    var Filters             = require("./filters");
    var Listener            = require("./listener");
    var NotificationHandler = require("./notification-handler");
    var Proxy               = require("./proxy");
    var Reworse             = require("./reworse");

    var noop = function () {};

    var mockSafe = {};

    var listener = {
        on: noop,
        listen: noop
    };

    var proxy = {forward: noop};

    var mock = function (module, name, mock) {
        var saved            = module[name];
        var continueTeardown = mockSafe.teardown || noop;

        module[name] = mock || noop;

        mockSafe.teardown = function () {
            module[name] = saved;
            continueTeardown();
        };
    };

    var listenerCreate = function () {
        return listener;
    };

    var proxyCreate = function () {
        return proxy;
    };

    setup(function () {
        mock(Errors, "handle");
        mock(Filters, "load");
        mock(Filters, "apply");
        mock(Listener, "createServer", listenerCreate);
        mock(Proxy, "create", proxyCreate);
    });

    teardown(function () {
        mockSafe.teardown();
    });

    test("uses first arg as callback when no options provided", function (done) {
        var listener = {
            on: noop,

            listen: function (_, clb) {
                setTimeout(function () {
                    clb(listener);
                });
            }
        };

        mock(Listener, "createServer", function () {
            return listener;
        });

        var server = Reworse.run(function (s) {
            assert(server === s);
            done();
        });
    });

    test("uses console as default output", function (done) {
        var testError = "test error";

        mock(console, "error", function (m) {
            assert(m.indexOf(testError) >= 0);
            done();
        });

        mock(process, "exit");

        mock(Filters, "load", function () {
            throw testError;
        });

        Reworse.run();
    });

    test("uses default port", function (done) {
        mock(Listener, "createServer", function () {
            return {
                on: noop,

                listen: function (port) {
                    assert(port === Reworse.defaultPort);
                    done();
                }
            };
        });

        Reworse.run();
    });

    test("loads filters", function (done) {
        var paths   = {};
        var require = {};

        mock(Filters, "load", function (p, r) {
            assert(p === paths);
            assert(r === require);
            done();
        });

        Reworse.run({
            filters: {
                paths:   paths,
                require: require
            }
        });
    });

    test("prints filter load error and exits", function (done) {
        var testError = "test error";
        var printed = false;

        mock(Filters, "load", function () {
            throw testError;
        });

        mock(console, "error", function (m) {
            printed = true;
            assert(m.indexOf(testError) >= 0);
        });

        mock(process, "exit", function () {
            assert(printed);
            done();
        });

        Reworse.run();
    });

    test("creates listener", function (done) {
        var listenerOptions = {};
        mock(Listener, "createServer", function (options) {
            assert(options === listenerOptions);
            done();
            return {on: noop, listen: noop};
        });

        Reworse.run({listener: listenerOptions});
    });

    test("creates proxy", function (done) {
        mock(Proxy, "create", function () {
            done();
            return {forward: noop};
        });

        Reworse.run();
    });

    test("creates notification handler", function (done) {
        var options = {};

        mock(NotificationHandler, "create", function (o) {
            assert(o === options);
            done();
            return noop;
        });

        Reworse.run(options);
    });

    test("handles error notifications", function (done) {
        var handler         = {};
        var proxy           = {forward: noop};
        var listenerHandled = false;
        var proxyHandled    = false;

        var listener = {
            on: noop,

            listen: function (_, clb) {
                clb();
            }
        };

        mock(Listener, "createServer", function () {
            return listener;
        });

        mock(Proxy, "create", function () {
            return proxy;
        });

        mock(NotificationHandler, "create", function () {
            return handler;
        });

        mock(Errors, "handle", function (source, origin, h) {
            assert(h === handler);
            switch (source) {
            case listener:
                assert(origin === "listener");
                listenerHandled = true;
                break;
            case proxy:
                assert(origin === "proxy");
                proxyHandled = true;
                break;
            }
        });

        Reworse.run(function () {
            assert(listenerHandled);
            assert(proxyHandled);
            done();
        });
    });

    test("applies filters to requests and forwards them through the proxy", function (done) {
        var listener       = new Events.EventEmitter;
        var filtersApplied = false;
        var request        = {};
        var response       = {};
        var filters        = {};

        var proxy = {
            forward: function (req, res) {
                assert(filtersApplied);
                assert(req === request);
                assert(res === response);
                done();
            }
        };

        listener.listen = function (_, clb) {
            clb();
        };

        mock(Listener, "createServer", function () {
            return listener;
        });

        mock(Proxy, "create", function () {
            return proxy;
        });

        mock(Filters, "load", function () {
            return filters;
        });

        mock(Filters, "apply", function (f, req, res) {
            assert(f === filters);
            assert(req === request);
            assert(res === response);
            filtersApplied = true;
        });

        Reworse.run(function (l) {
            l.emit("request", request, response);
        });
    });

    test("does not forward to proxy if filters handled the request", function (done) {
        var listener       = new Events.EventEmitter;

        var proxy = {
            forward: function (req, res) {
                assert(false);
            }
        };

        listener.listen = function (_, clb) {
            clb();
        };

        mock(Listener, "createServer", function () {
            return listener;
        });

        mock(Proxy, "create", function () {
            return proxy;
        });

        mock(Filters, "apply", function () {
            setTimeout(done);
            return true;
        });

        Reworse.run(function (l) {
            l.emit("request");
        });
    });

    test("listens on specified port", function (done) {
        var testPort = {};

        mock(Listener, "createServer", function () {
            return {
                on: noop,

                listen: function (port) {
                    assert(port === testPort);
                    done();
                }
            };
        });

        Reworse.run({port: testPort});
    });
});
