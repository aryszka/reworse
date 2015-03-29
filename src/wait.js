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

    module.exports = {
        forAll: waitForAll
    };
})();
