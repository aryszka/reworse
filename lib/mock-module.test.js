suite("mock module", function () {
    "use strict";

    var assert     = require("assert");
    var MockModule = require("./mock-module");

    test("tear does not fail when nothing mocked", function () {
        var safe = MockModule.create();
        safe.teardown();
    });

    test("replaces module property with noop", function () {
        var Module = {
            f: function () {
                assert(false);
            }
        };

        var safe = MockModule.create();
        safe.mock(Module, "f");

        Module.f();
    });

    test("replaces module property with mock", function (done) {
        var Module = {
            f: function () {
                assert(false);
            }
        };

        var safe = MockModule.create();
        safe.mock(Module, "f", done);

        Module.f();
    });

    test("restores module", function (done) {
        var Module = {f: done};
        var safe   = MockModule.create();

        safe.mock(Module, "f", function () {
            assert(false);
        });

        safe.teardown();
        Module.f();
    });

    test("uses latest mock", function (done) {
        var Module = {
            f: function () {
                assert(false);
            }
        };

        var safe = MockModule.create();

        safe.mock(Module, "f", function () {
            assert(false);
        });

        safe.mock(Module, "f", done);

        Module.f();
    });

    test("restores module after multiple mocks", function (done) {
        var Module = {f: done};
        var safe   = MockModule.create();

        safe.mock(Module, "f", function () {
            assert(false);
        });

        safe.mock(Module, "f", function () {
            assert(false);
        });

        safe.teardown();
        Module.f();
    });
});
