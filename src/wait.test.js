suite("wait", function () {
    "use strict";

    var assert = require("assert");
    var Wait = require("./wait");

    test("doesn't wait when no calls to wait for", function (done) {
        Wait.parallel([], done);
    });

    test("waits for synchronous calls", function (done) {
        var reclb = function (clb) {
            clb();
        };

        Wait.parallel([reclb, reclb], done);
    });

    test("waits for asynchronous calls", function (done) {
        var reclb = function (clb) {
            setTimeout(clb);
        };

        Wait.parallel([reclb, reclb], done);
    });

    test("waits for mixed calls", function (done) {
        var sreclb = function (clb) {
            clb();
        };

        var areclb = function (clb) {
            setTimeout(clb);
        };

        Wait.parallel([sreclb, areclb], done);
    });

    test("doesn't wait when no calls to execute", function () {
        Wait.serial([]);
    });

    test("calls synchronous calls in order", function (done) {
        var firstCalled = false;
        var secondCalled = false;

        var firstCall = function (clb) {
            assert(!firstCalled);
            assert(!secondCalled);
            firstCalled = true;
            clb();
        };

        var secondCall = function (clb) {
            assert(firstCalled);
            assert(!secondCalled);
            secondCalled = true;
            clb();
        };

        var clb = function () {
            assert(firstCalled);
            assert(secondCalled);
            done();
        };

        Wait.serial([firstCall, secondCall, clb]);
    });

    test("calls asynchronous calls in order", function (done) {
        var firstCalled = false;
        var secondCalled = false;

        var firstCall = function (clb) {
            assert(!firstCalled);
            assert(!secondCalled);
            firstCalled = true;
            setTimeout(clb);
        };

        var secondCall = function (clb) {
            assert(firstCalled);
            assert(!secondCalled);
            secondCalled = true;
            setTimeout(clb);
        };

        var clb = function () {
            assert(firstCalled);
            assert(secondCalled);
            setTimeout(done);
        };

        Wait.serial([firstCall, secondCall, clb]);
    });
});
