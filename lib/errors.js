(function () {
    "use strict";

    var applyOrigin = function (err, origin) {
        try {
            err.origin = err.origin ? origin + ":" + err.origin : origin;
        } catch (_) {}
    };

    // handles errors with custom handler or to stderr.
    // - source:  the source of the error events
    // - origin:  additional origin flag for the errors
    // - handler: optional handler function for the
    //            errors. expects the error object and
    //            the provided origin as arguments.
    var handle = function (source, origin, handler) {
        handler = handler || console.error;
        source.on("error", function (err) {
            applyOrigin(err, origin);
            handler(err, err.origin);
        });
    };

    // emits an error to target emitter.
    // - target: the object that recieves the error event
    // - err:    the error object
    // - origin: additional origin flag for the error
    var emit = function (target, err, origin) {
        applyOrigin(err, origin);
        target.emit("error", err, origin);
    };

    // maps errors from source to target.
    // - source: the source of the error events
    // - target: the object that recieves the error events
    // - origin: additional origin flag for the errors
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