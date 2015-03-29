suite("wait", function () {
    "use strict";

    var Wait = require("./wait");

    test("doesn't wait when no calls to wait for", function (done) {
        Wait.forAll([], done);
    });

    test("waits for synchronous calls", function (done) {
        var reclb = function (clb) {
            clb();
        };

        Wait.forAll([reclb, reclb], done);
    });

    test("waits for asynchronous calls", function (done) {
        var reclb = function (clb) {
            setTimeout(clb);
        };

        Wait.forAll([reclb, reclb], done);
    });

    test("waits for mixed calls", function (done) {
        var sreclb = function (clb) {
            clb();
        };

        var areclb = function (clb) {
            setTimeout(clb);
        };

        Wait.forAll([sreclb, areclb], done);
    });
});
