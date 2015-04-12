suite("options", function () {
    "use strict";

    var assert     = require("assert");
    var Fs         = require("fs");
    var MockModule = require("./mock-module");
    var Options    = require("./options");

    var mocks = MockModule.create();

    teardown(function () {
        mocks.teardown();
    });

    test("parses basic flags", function () {
        mocks.mock(process, "argv", [
            "", "",
            "--port", "9002",
            "--verbose",
            "--socket-dir", "test-dir"
        ]);

        var options = Options.load();
        assert(options.port === 9002);
        assert(options.verbose);
        assert(options.listener.socketDir === "test-dir");
    });

    test("parses filters", function () {
        mocks.mock(process, "argv", [
            "", "",
            "--filter", "filter0",
            "--filter", "filter1"
        ]);

        var options = Options.load();
        assert(options.filters.paths.length === 2);

        assert(options.filters.paths.some(function (filter) {
            return filter === "filter0";
        }));

        assert(options.filters.paths.some(function (filter) {
            return filter === "filter1";
        }));
    });

    test("reads tls certificates", function () {
        mocks.mock(process, "argv", [
            "", "",
            "--tls-key", "tls-key",
            "--tls-cert", "tls-cert"
        ]);

        mocks.mock(Fs, "readFileSync", function (path) {
            switch (path) {
            case "tls-key":
                return "key";
            case "tls-cert":
                return "cert";
            }
        });

        var options = Options.load();
        assert(options.listener.tlsCert.key === "key");
        assert(options.listener.tlsCert.cert === "cert");
    });

    test("reports and exits on file read error", function (done) {
        var message;

        mocks.mock(process, "argv", [
            "", "",
            "--tls-key", "tls-key",
            "--tls-cert", "tls-cert"
        ]);

        mocks.mock(Fs, "readFileSync", function () {
            throw "test-error";
        });

        mocks.mock(process, "exit", function (code) {
            assert(message.indexOf("test-error") >= 0);
            assert(code !== 0);
            done();
        });

        Options.load(function (m) {
            message = m;
        });
    });
});
