suite("errors", function () {
    "use strict";

    var assert = require("assert");
    var Errors = require("./errors");
    var Events = require("events");

    var stderr;

    setup(function () {
        stderr = console.error;
    });

    teardown(function () {
        console.error = stderr;
    });

    test("logs errors to console", function (done) {
        var source     = new Events.EventEmitter;
        var testError  = new Error("test error");
        var testOrigin = "test origin";

        console.error = function (err, origin) {
            assert(err === testError);
            assert(err.origin === testOrigin);
            assert(origin === testOrigin);
            done();
        };

        Errors.handle(source, testOrigin);
        source.emit("error", testError);
    });

    test("handles errors with custom handler", function (done) {
        var source     = new Events.EventEmitter();
        var testError  = new Error("test error");
        var testOrigin = "test origin";

        var handler = function (err, origin) {
            assert(err === testError);
            assert(err.origin === testOrigin);
            assert(origin === testOrigin);
            done();
        };

        Errors.handle(source, testOrigin, handler);
        source.emit("error", testError);
    });

    test("emits error", function (done) {
        var target     = new Events.EventEmitter();
        var testError  = new Error("test error");
        var testOrigin = "test origin";

        target.on("error", function (err, origin) {
            assert(err === testError);
            assert(err.origin === testOrigin);
            assert(origin === testOrigin);
            done();
        });

        Errors.emit(target, testError, testOrigin);
    });

    test("maps errors from source to target", function (done) {
        var source     = new Events.EventEmitter();
        var target     = new Events.EventEmitter();
        var testError  = new Error("test error");
        var testOrigin = "test origin";

        target.on("error", function (err, origin) {
            assert(err === testError);
            assert(err.origin === testOrigin);
            assert(origin === testOrigin);
            done();
        });

        Errors.map(source, target, testOrigin);
        source.emit("error", testError);
    });
});
