suite("main", function () {
    "use strict";

    var assert = require("assert");
    var Flags  = require("flags");
    var main   = require("./main");
    var Url    = require("url");
    var Path   = require("path");
    var Listener = require("./listener");
    var Http = require("http");

    var withServer = function (test) {
        return function (done) {
            var server;
            test(
                function (requireFilter) {
                    server = main(requireFilter || require, function () {});
                    return server;
                },
                function () {
                    if (!server) {
                        done();
                        return;
                    }

                    server.close(function (err) {
                        assert(!err, err);
                        done();
                    });
                }
            );
        };
    };

    var watchStderr = function (expression, done) {
        var stderr = console.error;
        console.error = function (message) {
            if (!String(message).match(expression)) {
                stderr.apply(console, [].slice.call(arguments));
                return;
            }

            console.error = stderr;
            done();
        };
    };

    var mockArgs = function (args, test) {
        args = args || [];

        process.argv = process.argv
            .slice(0, 2)
            .concat(args);

        if (test) {
            test();
        }
    };

    var testServer = function () {
        return function () {
            return {
                on: function (eventName, handler) {
                    this[eventName] = handler;
                },

                emit: function (eventName) {
                    this[eventName].apply(this, [].slice.call(arguments, 1));
                },

                close: function (clb) {
                    clb();
                },

                listen: function () {}
            };
        };
    };

    var withTestServer = function (test) {
        return withServer(function (start, done) {
            var listenerCreateServer = Listener.createServer;
            Listener.createServer    = testServer();

            test(start, function () {
                Listener.createServer = listenerCreateServer;
                done();
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

    test("starts/stops", function (done) {
        main(function (server) {
            server.close(function () {
                done();
            });
        });
    });

    test("reports status on stderr, on success, with default port", withServer(function (start, done) {
        // enable when server can listen to the specified port
        done();
        return;

        watchStderr(new RegExp(String(main.defaultPort)), done);
        start();
    }));

    test("reports status on stderr, on success, with custom port", withServer(function (start, done) {
        // enable when server can listen to the specified port
        done();
        return;

        mockArgs(["--port", "8989"], function () {
            watchStderr(/8989/, done);
            start();
        });
    }));

    test("maps requests", withTestServer(function (start, done) {
        var httpRequest = Http.request;
        var testRequestOptions = {
            method:   "HEAD",
            hostname: "test-host",
            port:     8989,
            path:     "/test-path",

            rawHeaders: [
                "Test-Header-0", "test-value-0",
                "Test-Header-1", "test-value-1"
            ]
        };

        testRequestOptions.headers = main.rawHeaders(testRequestOptions.rawHeaders);

        Http.request = function (options) {
            assert(options.method         === testRequestOptions.method);
            assert(options.hostname       === testRequestOptions.hostname);
            assert(String(options.port)   === String(testRequestOptions.port));
            assert(options.path           === testRequestOptions.path);

            for (var key in options.headers) {
                assert(options.headers[key] === testRequestOptions.headers[key]);
            }

            Http.request = httpRequest;

            done();
            return {on: function () {}};
        };

        var server = start();
        server.emit("request", {
            method:     testRequestOptions.method,
            rawHeaders: testRequestOptions.rawHeaders,
            headers:    testRequestOptions.headers,
            on:         function () {},

            url: Url.format({
                protocol: "http",
                hostname: testRequestOptions.hostname,
                port:     testRequestOptions.port,
                pathname: testRequestOptions.path
            })
        }, {
            on: function () {}
        });
    }));

    test("copies request input", withTestServer(function (start, done) {
        var httpRequest   = Http.request;
        var requestBuffer = new Buffer("");

        Http.request = function () {
            return {
                buffer: new Buffer(""),
                on:     function () {},

                write: function (data) {
                    this.buffer = Buffer.concat([this.buffer, data]);
                },

                end: function (data) {
                    if (data) {
                        this.buffer = Buffer.concat([this.buffer, data]);
                    }

                    assert(this.buffer.equals(requestBuffer));

                    Http.request = httpRequest;
                    done();
                }
            };
        };

        var request = {
            method:     "POST",
            url:        "http://test-hostname:8989/test-path",
            rawHeaders: ["Content-Length", "0"],
            headers:    {"content-length": "0"},

            on: function (eventName, handler) {
                this[eventName] = handler;
            },

            emit: function (eventName) {
                this[eventName].apply(this, [].slice.call(arguments, 1));
            },

            send: function (string) {
                var buffer = new Buffer(string);
                requestBuffer = Buffer.concat([requestBuffer, buffer]);
                this.emit("data", buffer);
            },

            end: function () {
                this.emit("end");
            }
        };

        var server = start();
        server.emit("request", request, {
            on: function () {}
        });
        request.send("some");
        request.send(" ");
        request.send("data");
        request.end();
    }));

    test("maps response", withTestServer(function (start, done) {
        var httpRequest = Http.request;

        var request = {
            method:     "GET",
            url:        "http://test-hostname:8989/test-path",
            rawHeaders: [],
            headers:    {},
            on:         function () {}
        };

        var prequest = {
            on: function (eventName, handler) {
                this[eventName] = handler;
            },

            emit: function (eventName) {
                this[eventName].apply(this, [].slice.call(arguments, 1));
            }
        };

        Http.request = function () {
            return prequest;
        };

        var presponse = {
            statusCode: 418,
            on:         function () {},

            rawHeaders: [
                "Test-Header-0", "test-value-0",
                "Test-Header-1", "test-value-1"
            ]
        };

        presponse.headers = main.rawHeaders(presponse.rawHeaders);

        var response = {
            on: function () {},

            writeHead: function (statusCode, headers) {
                assert(statusCode === presponse.statusCode);
                for (var key in headers) {
                    assert(headers[key] === presponse.headers[key]);
                }

                Http.request = httpRequest;
                done();
            }
        };

        var server = start();
        server.emit("request", request, response);
        prequest.emit("response", presponse);
    }));

    test("copies response", withTestServer(function (start, done) {
        var httpRequest    = Http.request;
        var responseBuffer = new Buffer("");

        var request = {
            url:        "http://test-hostname:8989/test-path",
            rawHeaders: [],
            headers:    {},
            on:         function () {}
        };

        var response = {
            buffer:    new Buffer(""),
            writeHead: function () {},
            on:        function () {},

            write: function (data) {
                this.buffer = Buffer.concat([this.buffer, data]);
            },

            end: function (data) {
                if (data) {
                    this.buffer = Buffer.concat([this.buffer, data]);
                }

                assert(this.buffer.equals(responseBuffer));

                Http.request = httpRequest;
                done();
            }
        };

        var prequest = {
            on: function (eventName, handler) {
                this[eventName] = handler;
            },

            emit: function (eventName) {
                this[eventName].apply(this, [].slice.call(arguments, 1));
            }
        };

        Http.request = function () {
            return prequest;
        };

        var presponse = {
            rawHeaders: [],
            headers:    {},

            on: function (eventName, handler) {
                this[eventName] = handler;
            },

            emit: function (eventName) {
                this[eventName].apply(this, [].slice.call(arguments, 1));
            },

            send: function (string) {
                var buffer = new Buffer(string);
                responseBuffer = Buffer.concat([responseBuffer, buffer]);
                this.emit("data", buffer);
            }
        };

        var server = start();
        server.emit("request", request, response);
        prequest.emit("response", presponse);
        presponse.send("some");
        presponse.send(" ");
        presponse.send("data");
        presponse.end();
    }));

    test("applies passive filters", withTestServer(function (start, done) {
        var httpRequest   = Http.request;
        var response      = {on: function () {}};
        var filtersCalled = 0;

        var request = {
            url:        "http://test-hostname:8989/test-path",
            rawHeaders: [],
            headers:    {},
            on:         function () {}
        };

        var filter = function (req, res) {
            filtersCalled++;

            assert(req === request);
            assert(res === response);
        };

        var filters = {
            "filter0": filter,
            "filter1": filter
        };

        Http.request = function () {
            assert(filtersCalled === 2);
            Http.request = httpRequest;
            done();
            return {on: function () {}};
        };

        mockArgs(["--filter", "filter0", "--filter", "filter1"], function () {
            var server = start(function (path) {
                return filters[Path.basename(path)];
            });

            server.emit("request", request, response);
        });
    }));

    test("applies active filters", withTestServer(function (start, done) {
        var httpRequest   = Http.request;
        var request       = {on: function () {}};
        var response      = {on: function () {}};
        var filtersCalled = [];

        var checkDone = function () {
            if (filtersCalled.length < 3) {
                return;
            }

            assert(filtersCalled.reduce(function (handledCount, handled) {
                if (handled) {
                    return handledCount + 1;
                }

                return handledCount;
            }) > 0);

            Http.request = httpRequest;
            done();
        };

        var filters = {
            "filter0": function (req, res, handled) {
                filtersCalled.push(handled);

                assert(req === request);
                assert(res === response);

                checkDone();
            },

            "filter1": function (req, res, handled) {
                filtersCalled.push(handled);

                assert(req === request);
                assert(res === response);

                checkDone();

                return true;
            },

            "filter2": function (req, res, handled) {
                filtersCalled.push(handled);

                assert(req === request);
                assert(res === response);

                checkDone();

                return true;
            }
        };

        Http.request = function () {
            assert(false);
        };

        mockArgs([
            "--filter", "filter0",
            "--filter", "filter1",
            "--filter", "filter2"
        ], function () {
            var server = start(function (path) {
                return filters[Path.basename(path)];
            });

            server.emit("request", request, response);
        });
    }));

    test("reports failure of loading filter", withTestServer(function (start, done) {
        var processExit = process.exit;
        process.exit = function () {};
        watchStderr(/invalid filter/, function () {
            setTimeout(function () {
                process.exit = processExit;
                done();
            });
        });
        mockArgs(["--filter", "some-filter"], function () {
            start(function () {
                throw new Error("test-error");
            });
        });
    }));
});
