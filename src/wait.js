(function () {
    "use strict";

    var waitForAll = function (calls, clb) {
        var callsCount = calls.length;

        var clbi = function () {
            callsCount--;
            if (!callsCount) {
                clb();
            }
        };

        if (!callsCount) {
            clb();
            return;
        }

        calls.map(function (call) {
            call(clbi);
        });
    };

    var waitForNext = function (calls) {
        var call = calls.shift();
        if (!call) {
            return;
        }

        call(function () {
            waitForNext(calls);
        });
    };

    module.exports = {
        forAll:  waitForAll,
        forNext: waitForNext
    };
})();
