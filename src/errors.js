(function () {
    "use strict";

    var apply = function (f, args) {
        f.apply(undefined, args);
    };

    var handle = function (origin, emitter, handler) {
        var args;
        if (typeof handler === "function") {
            args = [].slice.call(arguments, 3);
        } else {
            handler = console.error;
            args = [].slice.call(arguments, 2);
        }

        emitter.on("error", function (err) {
            apply(
                handler,
                [err, origin]
                    .concat(args)
                    .concat([].slice.call(arguments, 1))
            );
        });
    };

    var emit = function (err, origin, collector) {
        var args = [].slice.call(arguments, 3);
        collector.emit.apply(collector, ["error", err, origin].concat(args));
    };

    var forward = function (origin, emitter, collector) {
        var args = [].slice.call(arguments, 3);
        handle(origin, emitter, function (err, origin) {
            apply(
                emit,
                [err, origin, collector]
                    .concat(args)
                    .concat([].slice.call(arguments, 2))
            );
        });
    };

    module.exports = {
        emit:    emit,
        forward: forward,
        handle:  handle
    };
})();
