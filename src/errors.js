(function () {
    "use strict";

    var applyOrigin = function (err, origin) {
        try {
            err.origin = err.origin ? origin + ":" + err.origin : origin;
        } catch (_) {}
    };

    var handle = function (source, origin, handler) {
        handler = handler || console.error;
        source.on("error", function (err) {
            applyOrigin(err, origin);
            handler(err, err.origin);
        });
    };

    var emit = function (target, err, origin) {
        applyOrigin(err, origin);
        target.emit("error", err, origin);
    };

    var map = function (source, target, origin) {
        handle(source, origin, function (err) {
            target.emit("error", err, origin);
        });
    };

    module.exports = {
        emit:   emit,
        handle: handle,
        map:    map
    };
})();
