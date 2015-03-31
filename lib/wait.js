(function () {
    "use strict";

    // expects calls with the signature f(clb),
    // where clb has no argumnets.
    // executes all calls immediately and waits
    // for all of them to execute their callback.
    // once all calls executed their callback,
    // clb is executed.
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

    // expects calls with the signature f(clb),
    // where clb has no argumnets.
    // executes all calls in order, each of them
    // only after the previous executed its
    // callback.
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
