(function () {
    "use strict";

    var names = {
        connection:              "Connection",
        proxyConnection:         "Proxy-Connection",
        strictTransportSecurity: "Strict-Transport-Security"
    };

    var canonicalHeaders = function (rawHeaders) {
        var canonicalHeaders = [];
        for (var i = 0; i < rawHeaders.length; i += 2) {
            canonicalHeaders[i] = rawHeaders[i].replace(/(^|-)[a-z]/g, function (s) {
                return s.toUpperCase();
            });

            canonicalHeaders[i + 1] = rawHeaders[i + 1];
        }

        return canonicalHeaders;
    };

    // converts header names to canonical format (not nodejs)
    // removes proxy and hsts headers
    // as a temporary solution, converts keep-alive requests
    // into single entity exchange requests (connection close)
    var conditionMessage = function (message) {
        var headers    = canonicalHeaders(message.rawHeaders);
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
                newHeaders.push("Connection");
                newHeaders.push("close");
                message.headers["connection"] = "close";
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

    module.exports = {
        canonicalHeaders: canonicalHeaders,
        conditionMessage: conditionMessage
    };
})();
