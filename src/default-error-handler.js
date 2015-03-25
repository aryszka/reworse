(function () {
    "use strict";

    var handle = function (name, emitter, handler) {
        var args;
        if (typeof handler === "function") {
            args = [].slice.call(arguments, 3);
        } else {
            handler = console.error;
            args = [].slice.call(arguments, 2);
        }

        emitter.on("error", function (err) {
            handler.apply(undefined, [name, err].concat(args));
        });
    };

    var emit = function (name, err, collector) {
        var args = [].slice.call(arguments, 3);
        collector.emit.apply(collector, [name, err].concat(args));
    };

    var forward = function (name, emitter, collector) {
        // todo: log these only in verbose mode,
        // if ECONNRESET on tcp socket

        var args = [].slice.call(arguments, 3);
        handle(name, emitter, function (name, err) {
            emit.apply(undefined, [name, err, collector].concat(args));
        });
    };

    module.exports = {
        emit:    emit,
        forward: forward,
        handle:  handle
    };
})();
