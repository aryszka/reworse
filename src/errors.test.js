suite("errors", function () {
    "use strict";

    var assert = require("assert");
    var Errors = require("./errors");
    var Events = require("events");

    test("logs errors to console", function (done) {
        var stderr = console.error;
        var emitter = new Events.EventEmitter();

        console.error = function (err, origin, arg0, arg1) {
            console.error = stderr;
            assert(err === "test error");
            assert(origin === "test origin");
            assert(arg0 === "test arg 0");
            assert(arg1 === "test arg 1");
            done();
        };

        Errors.handle("test origin", emitter, "test arg 0");
        emitter.emit("error", "test error", "test arg 1");
    });

    test("handles errors with custom handler", function (done) {
        var emitter = new Events.EventEmitter();
        var handler = function (err, origin, arg0, arg1) {
            assert(err === "test error");
            assert(origin === "test origin");
            assert(arg0 === "test arg 0");
            assert(arg1 === "test arg 1");
            done();
        };
        Errors.handle("test origin", emitter, handler, "test arg 0");
        emitter.emit("error", "test error", "test arg 1");
    });

    test("emits erorr", function (done) {
        var collector = new Events.EventEmitter();
        collector.on("error", function (err, origin, testArg) {
            assert(err === "test error");
            assert(origin === "test origin");
            assert(testArg === "test arg");
            done();
        });

        Errors.emit(
            "test error",
            "test origin",
            collector,
            "test arg"
        );
    });

    test("forwards errors from emitter to collector", function (done) {
        var emitter   = new Events.EventEmitter();
        var collector = new Events.EventEmitter();

        collector.on("error", function (err, origin, arg0, arg1) {
            assert(err === "test error");
            assert(origin === "test origin");
            assert(arg0 === "test arg 0");
            assert(arg1 === "test arg 1");
            done();
        });

        Errors.forward("test origin", emitter, collector, "test arg 0");
        emitter.emit("error", "test error", "test arg 1");
    });
});
