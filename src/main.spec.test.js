suite("main spec", function () {
    "use strict";

    var mockArgs = require("./mock-args");
    var Http     = require("http");
    var Https    = require("https");
    var TestHttp = require("./test-http");

    var cmdArgs = process.argv.slice(2);

    setup(function () {
        mockArgs();
    });

    teardown(function () {
        mockArgs(cmdArgs);
    });

    test("http get roundtrip", function (done) {
        TestHttp.testGetRoundtrip(Http, 8989, done);
    });

    test("https get roundtrip", function (done) {
        TestHttp.testGetRoundtrip(Https, 4545, done);
    });

    test("http keep-alive session", function (done) {
        TestHttp.testKeepAliveSession(Http, 8989, done);
    });

    test("https keep-alive session", function (done) {
        TestHttp.testKeepAliveSession(Https, 4545, done);
    });

    test("https get roundtrip over tunneling", function (done) {
        TestHttp.testTunneling(4545, done);
    });
});
