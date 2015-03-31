(function () {
    "use strict";

    var parallel = function (calls, clb) {
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

    var serial = function (calls) {
        var call = calls.shift();
        if (!call) {
            return;
        }

        call(function () {
            serial(calls);
        });
    };

    module.exports = {
        parallel: parallel,
        serial:   serial
    };
})();
