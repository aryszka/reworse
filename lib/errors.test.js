suite("errors", function () {
    "use strict";

    var assert     = require("assert");
    var Errors     = require("./errors");
    var Events     = require("events");
    var MockModule = require("./mock-module");

    var mocks = MockModule.create();

    teardown(function () {
        mocks.teardown();
    });

    test("logs errors to console", function (done) {
        var source     = new Events.EventEmitter;
        var testError  = new Error("test error");
        var testOrigin = "test origin";

        mocks.mock(console, "error", function (err) {
            assert(err === testError);
            assert(err.origin === testOrigin);
            done();
        });

        Errors.handle(source, testOrigin);
        source.emit("error", testError);
    });

    test("handles errors with custom handler", function (done) {
        var source     = new Events.EventEmitter();
        var testError  = new Error("test error");
        var testOrigin = "test origin";

        var handler = function (err) {
            assert(err === testError);
            assert(err.origin === testOrigin);
            done();
        };

        Errors.handle(source, testOrigin, handler);
        source.emit("error", testError);
    });

    test("emits error", function (done) {
        var target     = new Events.EventEmitter();
        var testError  = new Error("test error");
        var testOrigin = "test origin";

        target.on("error", function (err) {
            assert(err === testError);
            assert(err.origin === testOrigin);
            done();
        });

        Errors.emit(target, testError, testOrigin);
    });

    test("maps errors from source to target", function (done) {
        var source     = new Events.EventEmitter();
        var target     = new Events.EventEmitter();
        var testError  = new Error("test error");
        var testOrigin = "test origin";

        target.on("error", function (err) {
            assert(err === testError);
            assert(err.origin === testOrigin);
            done();
        });

        Errors.map(source, target, testOrigin);
        source.emit("error", testError);
    });
});
