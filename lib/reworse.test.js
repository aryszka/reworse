suite("reworse", function () {
    "use strict";

    var assert              = require("assert");
    var Defaults            = require("./defaults");
    var Errors              = require("./errors");
    var Events              = require("events");
    var Filters             = require("./filters");
    var Listener            = require("./listener");
    var MockModule          = require("./mock-module");
    var NotificationHandler = require("./notification-handler");
    var Proxy               = require("./proxy");
    var Reworse             = require("./reworse");

    var noop  = function () {};
    var mocks = MockModule.create();
    var proxy = {forward: noop};

    var listener = {
        on: noop,
        listen: noop
    };

    var listenerCreate = function () {
        return listener;
    };

    var proxyCreate = function () {
        return proxy;
    };

    setup(function () {
        mocks.mock(Errors, "handle");
        mocks.mock(Filters, "load");
        mocks.mock(Filters, "apply");
        mocks.mock(Listener, "createServer", listenerCreate);
        mocks.mock(Proxy, "create", proxyCreate);
    });

    teardown(function () {
        mocks.teardown();
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

        mocks.mock(Listener, "createServer", function () {
            return listener;
        });

        var server = Reworse.run(function (s) {
            assert(server === s);
            done();
        });
    });

    test("uses console as default output", function (done) {
        var testError = "test error";

        mocks.mock(console, "error", function (m) {
            assert(m.indexOf(testError) >= 0);
            done();
        });

        mocks.mock(process, "exit");

        mocks.mock(Filters, "load", function () {
            throw testError;
        });

        Reworse.run();
    });

    test("uses default port", function (done) {
        mocks.mock(Listener, "createServer", function () {
            return {
                on: noop,

                listen: function (port) {
                    assert(port === Defaults.port);
                    done();
                }
            };
        });

        Reworse.run();
    });

    test("loads filters", function (done) {
        var paths   = {};
        var require = {};

        mocks.mock(Filters, "load", function (p, r) {
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

        mocks.mock(Filters, "load", function () {
            throw testError;
        });

        mocks.mock(console, "error", function (m) {
            printed = true;
            assert(m.indexOf(testError) >= 0);
        });

        mocks.mock(process, "exit", function () {
            assert(printed);
            done();
        });

        Reworse.run();
    });

    test("creates listener", function (done) {
        var listenerOptions = {};
        mocks.mock(Listener, "createServer", function (options) {
            assert(options === listenerOptions);
            done();
            return {on: noop, listen: noop};
        });

        Reworse.run({listener: listenerOptions});
    });

    test("creates proxy", function (done) {
        mocks.mock(Proxy, "create", function () {
            done();
            return {forward: noop};
        });

        Reworse.run();
    });

    test("creates notification handler", function (done) {
        var options = {};

        mocks.mock(NotificationHandler, "create", function (o) {
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

        mocks.mock(Listener, "createServer", function () {
            return listener;
        });

        mocks.mock(Proxy, "create", function () {
            return proxy;
        });

        mocks.mock(NotificationHandler, "create", function () {
            return handler;
        });

        mocks.mock(Errors, "handle", function (source, origin, h) {
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
        var filters        = [];

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

        mocks.mock(Listener, "createServer", function () {
            return listener;
        });

        mocks.mock(Proxy, "create", function () {
            return proxy;
        });

        mocks.mock(Filters, "load", function () {
            return filters;
        });

        mocks.mock(Filters, "apply", function (f, req, res) {
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

        mocks.mock(Listener, "createServer", function () {
            return listener;
        });

        mocks.mock(Proxy, "create", function () {
            return proxy;
        });

        mocks.mock(Filters, "apply", function () {
            setTimeout(done);
            return true;
        });

        Reworse.run(function (l) {
            l.emit("request");
        });
    });

    test("listens on specified port", function (done) {
        var testPort = {};

        mocks.mock(Listener, "createServer", function () {
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

    test("uses preloaded filters", function (done) {
        var listener         = new Events.EventEmitter;
        var filtersApplied   = false;
        var request          = {};
        var response         = {};
        var filters          = [];
        var preloadedFilter  = function () {};
        var preloadedFilters = [preloadedFilter];

        var options = {filters: {preloaded: preloadedFilters}};

        var proxy = {
            forward: function (req, res) {
                assert(filtersApplied);
                done();
            }
        };

        listener.listen = function (_, clb) {
            clb();
        };

        mocks.mock(Listener, "createServer", function () {
            return listener;
        });

        mocks.mock(Proxy, "create", function () {
            return proxy;
        });

        mocks.mock(Filters, "load", function () {
            return filters;
        });

        mocks.mock(Filters, "apply", function (f, req, res) {
            assert(f.indexOf(preloadedFilter) >= 0);
            filtersApplied = true;
        });

        Reworse.run(options, function (l) {
            l.emit("request", request, response);
        });
    });
});
