(function () {
    "use strict";

    var names = {
        connection:              "Connection",
        proxyConnection:         "Proxy-Connection",
        strictTransportSecurity: "Strict-Transport-Security"
    };

    // converts header names into their canonical casing.
    // e.g: content-length -> Content-Length
    // returns a new list of the headers names and values.
    var canonical = function (rawHeaders) {
        var canonical = [];
        for (var i = 0; i < rawHeaders.length; i += 2) {
            canonical[i] = rawHeaders[i].replace(/(^|-)[a-z]/g, function (s) {
                return s.toUpperCase();
            });

            canonical[i + 1] = rawHeaders[i + 1];
        }

        return canonical;
    };

    // converts header names to canonical format (not nodejs).
    // removes proxy and hsts headers.
    // as a temporary solution, converts keep-alive requests
    // into single entity exchange requests (connection: close).
    var conditionMessage = function (message) {
        var headers    = canonical(message.rawHeaders);
        var newHeaders = [];

        for (var i = 0; i < headers.length; i += 2) {
            var key = headers[i];
            switch (key) {

            // omit
            case names.proxyConnection:
            case names.strictTransportSecurity:
                delete message.headers[key.toLowerCase()];
                break;

            // close
            // todo: handle keep-alive
            case names.connection:
                newHeaders.push(names.connection);
                newHeaders.push("close");
                message.headers[names.connection.toLowerCase()] = "close";
                break;

            // canonical name, verbatim value
            default:
                newHeaders.push(headers[i]);
                newHeaders.push(headers[i + 1]);
                message.headers[headers[i]] = headers[i + 1];
                break;
            }
        }

        message.rawHeaders = newHeaders;
    };

    // maps raw list representation of headers into a keyed
    // object.
    var mapRaw = function (raw) {
        var headers = {};
        for (var i = 0; i < raw.length; i += 2) {
            headers[raw[i]] = raw[i + 1];
        }

        return headers;
    };

    // converts mapped headers into their raw representation
    var toRaw = function (mapped) {
        var raw = [];
        for (var header in mapped) {
            raw.push(header);
            raw.push(mapped[header]);
        }

        return raw;
    };

    var merge = function () {
        if (!arguments.length) {
            return [];
        }

        if (arguments.length === 1) {
            return arguments[0];
        }

        var headers = mapRaw(arguments[0]);
        for (var i = 0; i < arguments[1].length; i += 2) {
            headers[arguments[1][i]] = arguments[1][i + 1];
        }

        return merge.apply(
            undefined,
            [toRaw(headers)].concat([].slice.call(arguments, 2))
        );
    };

    module.exports = {
        canonical:        canonical,
        conditionMessage: conditionMessage,
        mapRaw:           mapRaw,
        toRaw:            toRaw,
        merge:            merge
    };
})();
